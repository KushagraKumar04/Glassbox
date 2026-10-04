"""
Sandboxed Python execution.

Two modes, chosen by SANDBOX_ENABLED in .env:

    true   → run inside an ephemeral Docker container
             (CPU/memory/wall-time capped, no network by default)

    false  → run as a local subprocess with a wall-time cap
             (dev convenience only — not safe for untrusted code)

Both modes:
    • write code to a scratch dir under ARTIFACT_DIR/sandbox/<run_id>/
    • capture stdout + stderr
    • truncate output at SANDBOX_MAX_OUTPUT_BYTES
    • return artifact filenames for anything the code wrote to ./output/
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

from app.config import get_settings

settings = get_settings()


class SandboxResult(dict):
    """Plain dict subclass for typing convenience."""
    pass


class SandboxService:
    # ── Public ──────────────────────────────────────────────

    async def execute(
        self,
        code: str,
        *,
        input_files: dict[str, str] | None = None,
    ) -> SandboxResult:
        """
        Run `code` and return:
            {status, run_id, exit_code, stdout, artifacts, elapsed_ms}
        """
        if settings.sandbox_enabled:
            return await self._run_docker(code, input_files or {})
        return await self._run_local(code, input_files or {})

    # ── Docker mode ─────────────────────────────────────────

    async def _run_docker(
        self,
        code: str,
        input_files: dict[str, str],
    ) -> SandboxResult:
        try:
            import docker  # type: ignore
        except ImportError:
            return SandboxResult(
                status="error",
                error="docker SDK not installed — pip install docker "
                      "or set SANDBOX_ENABLED=false",
            )

        run_id, scratch = self._prepare_scratch(code, input_files)

        def _launch():
            client = docker.from_env()
            return client.containers.run(
                image=settings.sandbox_image,
                command=["python", "/workspace/main.py"],
                volumes={str(scratch): {"bind": "/workspace", "mode": "rw"}},
                mem_limit=f"{settings.sandbox_memory_limit_mb}m",
                nano_cpus=int(settings.sandbox_cpu_limit * 1e9),
                network_disabled=settings.sandbox_network_disabled,
                detach=False,
                remove=False,
                working_dir="/workspace",
            )

        try:
            container = await asyncio.wait_for(
                asyncio.to_thread(_launch),
                timeout=settings.sandbox_timeout_seconds,
            )
        except asyncio.TimeoutError:
            return SandboxResult(
                status="timeout",
                run_id=run_id,
                error=f"Execution exceeded {settings.sandbox_timeout_seconds}s",
            )
        except Exception as e:
            return SandboxResult(status="error", run_id=run_id, error=str(e)[:500])

        logs = container.logs(stdout=True, stderr=True).decode("utf-8", errors="replace")
        exit_code = container.wait()["StatusCode"]
        try:
            container.remove(force=True)
        except Exception:
            pass

        return self._build_result(run_id, scratch, exit_code, logs)

    # ── Local mode ──────────────────────────────────────────

    async def _run_local(
        self,
        code: str,
        input_files: dict[str, str],
    ) -> SandboxResult:
        """
        Run the code with a local Python subprocess.

        Two choices that make this robust across environments:

          1. We pass the code via `-c` instead of a script path. Some
             Python launchers (shimmed venvs, frozen interpreters, Store
             aliases) fail with 'failed to set __main__.__loader__' when
             given a script file, but work fine with `-c`.

          2. `-I` (isolated mode) keeps PYTHON* env vars from the uvicorn
             parent process from leaking into the child. Any PYTHONPATH /
             PYTHONHOME mismatch can otherwise cause bizarre startup errors.

        The scratch directory still exists (with a copy of main.py) so that
        artifacts and post-mortem inspection work the same as in Docker mode.
        """
        run_id, scratch = self._prepare_scratch(code, input_files)

        # Clean env — pass only the minimal environment the child needs.
        # Keeps PATH (for any subprocesses the script might spawn) but drops
        # every PYTHON* var so nothing leaks from the parent.
        child_env = {
            k: v for k, v in os.environ.items()
            if not k.upper().startswith("PYTHON")
        }
        # Ensure UTF-8 stdout so accented characters don't blow up on Windows.
        child_env.setdefault("PYTHONIOENCODING", "utf-8")

        def _run():
            return subprocess.run(
                [sys.executable, "-I", "-c", code],
                cwd=str(scratch),
                capture_output=True,
                text=True,
                timeout=settings.sandbox_timeout_seconds,
                env=child_env,
            )

        try:
            proc = await asyncio.wait_for(
                asyncio.to_thread(_run),
                timeout=settings.sandbox_timeout_seconds + 2,
            )
        except asyncio.TimeoutError:
            return SandboxResult(
                status="timeout",
                run_id=run_id,
                error=f"Execution exceeded {settings.sandbox_timeout_seconds}s",
            )
        except Exception as e:
            return SandboxResult(status="error", run_id=run_id, error=str(e)[:500])

        combined = proc.stdout
        if proc.stderr:
            combined += ("\n" if combined else "") + proc.stderr

        return self._build_result(run_id, scratch, proc.returncode, combined)

    # ── Helpers ─────────────────────────────────────────────

    def _prepare_scratch(
        self,
        code: str,
        input_files: dict[str, str],
    ) -> tuple[str, Path]:
        """Create the scratch dir, write code, copy input files."""
        run_id = uuid.uuid4().hex[:12]
        # Resolve to an ABSOLUTE path. Relative paths break when we set
        # cwd=str(scratch) and pass main.py as a relative argument —
        # the subprocess then resolves main.py relative to the new cwd,
        # producing a doubled path like <scratch>/<scratch>/main.py.
        # Absolute paths also make Docker volume mounts portable.
        scratch = (
            Path(settings.artifact_dir) / "sandbox" / run_id
        ).resolve()
        scratch.mkdir(parents=True, exist_ok=True)

        (scratch / "main.py").write_text(code, encoding="utf-8")
        (scratch / "allowed.json").write_text(
            json.dumps(settings.allowed_package_list), encoding="utf-8"
        )

        # An output/ dir the script can write artifacts to
        (scratch / "output").mkdir(exist_ok=True)

        for name, src in input_files.items():
            src_path = Path(src)
            if src_path.exists():
                (scratch / name).write_bytes(src_path.read_bytes())

        return run_id, scratch

    def _build_result(
        self,
        run_id: str,
        scratch: Path,
        exit_code: int,
        stdout: str,
    ) -> SandboxResult:
        """Truncate, discover artifacts, package result."""
        if len(stdout) > settings.sandbox_max_output_bytes:
            head = settings.sandbox_max_output_bytes
            stdout = stdout[:head] + "\n...[output truncated]"

        artifacts: list[dict] = []
        output_dir = scratch / "output"
        if output_dir.exists():
            for f in sorted(output_dir.rglob("*")):
                if f.is_file():
                    artifacts.append({
                        "name": f.relative_to(output_dir).as_posix(),
                        "size": f.stat().st_size,
                    })

        return SandboxResult(
            status="ok" if exit_code == 0 else "error",
            run_id=run_id,
            exit_code=exit_code,
            stdout=stdout,
            artifacts=artifacts,
            scratch_dir=str(scratch),
        )

    # ── Cleanup ─────────────────────────────────────────────

    @staticmethod
    def cleanup(run_id: str) -> None:
        """Remove a run's scratch dir. Safe to call multiple times."""
        import shutil
        scratch = Path(settings.artifact_dir) / "sandbox" / run_id
        if scratch.exists():
            shutil.rmtree(scratch, ignore_errors=True)