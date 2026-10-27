
---

### 3. `SECURITY.md` (Complete File)

```md
# Security — Glassbox

Small-trusted-team data-analyst tool. This document records what was
hardened, what was deliberately not hardened, and what's still open.
Maintained batch-by-batch alongside CHANGELOG.md.

Last reviewed: Batch 1.6 (post-Batch-83 re-baseline, includes test
foundation, CI wiring, frontend/backend test coverage).
Prior review at security Batch 7.

---

## Open risks

### R1 — Login timing side channel
- **What:** Unknown-account login returns in ~1 ms; wrong-password on
  an existing account takes ~100 ms (bcrypt runs only in that branch).
  An attacker can distinguish "account exists" from "account does not
  exist."
- **Impact:** Account enumeration. Not credential theft.
- **Mitigation today:** Auth is opt-in (`AUTH_ENABLED=false` by default);
  rate limiting + per-account backoff (Batch 5) slow enumeration.
- **Recommended fix (future batch):** run bcrypt against a fixed dummy
  hash on the unknown-account branch so all branches take comparable
  time.
- **Priority:** **Medium.** Multi-user small-team deployment confirmed;
  the server distinguishes "account exists" from "account does not" in
  response time. Rate limiting + per-account backoff (Batch 5) slow
  enumeration but do not eliminate it. Fix: run bcrypt against a fixed
  dummy hash on the unknown-account branch.

### R2 — Route-table introspection (RESOLVED — not a security issue)
- **What it was:** `api_router.routes == 18` but `app.routes == 5`,
  with `_IncludedRouter` objects showing `'?'` for `.path`.
- **Root cause:** FastAPI 0.137 (June 2026) changed `include_router()`
  to lazy inclusion. `app.routes` is now a tree of `_IncludedRouter`
  wrappers, not a flat list of `APIRoute` objects. The old
  introspection pattern (`[r.path for r in app.routes]`) silently
  returns an almost-empty list. Uvicorn always served the routes
  correctly.
- **Resolution (Batch 7 follow-up):**
  - `backend/app/core/route_audit.py` (new) enumerates routes via
    `fastapi.routing.iter_route_contexts()` (public since 0.137.2),
    with a recursive fallback for older versions.
  - `main.lifespan` calls `audit_routes(app)` at startup and refuses
    to boot if no `/api/*` route is registered.
- **Impact on prior verification:** none. The earlier 405 was a wrong
  test path (`POST /api/v1/datasets` vs `.../upload`), not a route-table
  problem.

### R3 — Batch 6 e2e verification deferred (RESOLVED — Batch 1.1)
- **What it was:** File-upload hardening (magic-byte check, streaming
  size cap, BOM strip via `_strip_bom_in_place`, effective `file_path`
  storage, cleanup on delete / profiling failure) was code-complete but
  had no end-to-end test.
- **Resolution (Batch 1.1):** `backend/tests/test_upload_roundtrip.py`
  adds 10 tests: CSV / JSON / Parquet happy paths, PNG-disguised-as-CSV
  and binary-disguised-as-JSON rejection, size-cap enforcement, direct
  unit test for `_strip_bom_in_place`, upload → GET → DELETE → 404
  round-trip, and on-disk file cleanup after delete. Zero skips.

### R4 — SSRF guard: DNS rebinding (TOCTOU)
- **What:** `assert_safe_host` resolves the hostname once and checks the
  resulting IPs. The database connection is made later against the same
  hostname, which is resolved again. A malicious DNS server can return
  a public IP to the guard and a private IP to the connector.
- **Impact:** SSRF bypass in theory. Requires attacker control of DNS
  for the supplied hostname.
- **Mitigation today:** `CONNECTOR_ALLOW_PRIVATE_HOSTS=false` by default;
  `CONNECTOR_ALLOWLIST` for tightening.
- **Recommended fix (future batch):** pass the resolved IP (not the
  hostname) to the connector, or install a resolver hook on the driver.
- **Priority:** Low for small-team.

### R5 — SSRF guard: non-standard IPv4 encodings
- **What:** `assert_safe_host` first tries `ipaddress.ip_address(host)`;
  on failure falls back to `socket.getaddrinfo`. Decimal (`2130706433`),
  octal, or hex (`0x7f000001`) IPv4 literals are not normalised before
  the check — they rely on `getaddrinfo` interpreting them, which is
  platform-dependent.
- **Impact:** On platforms where `getaddrinfo` does not interpret these
  forms, the guard passes them through. Whether the connector then
  reaches `127.0.0.1` depends on the driver.
- **Recommended fix (future batch):** reject host strings that are all
  digits, start with `0x`, or contain unusual patterns before resolution.
- **Priority:** Low; theoretical.

### R6 — Rate-limit strings not validated at boot
- **What:** `rate_limit_*` settings (e.g. `10/minute`) are stored as
  strings and only parsed by slowapi on the first request. A malformed
  value fails at request time, not startup.
- **Impact:** Operational, not security-critical. Boot can succeed with
  a broken rate limiter.
- **Recommended fix (future batch):** parse each with slowapi's parser
  inside `validate_ranges()`.
- **Priority:** Low.

### R7 — `display_timezone` not validated
- **What:** `display_timezone` is a free-form string. `ZoneInfo` raises
  only when a timestamp is actually formatted.
- **Recommended fix:** whitelist via `zoneinfo.available_timezones()` in
  `validate_ranges()`.
- **Priority:** Cosmetic.

### R8 — No antivirus / ClamAV scanning
- **What:** Uploaded files are never scanned for malware.
- **Rationale:** Single-user local tool; the user is the only uploader.
- **Revisit if:** the app becomes multi-tenant or accepts uploads from
  untrusted parties.
- **Priority:** Accepted.

### R9 — `AUTH_SHOW_RESET_LINK` outside production
- **What:** Exposing the password-reset link in the API response is
  refused at boot only when `APP_ENV=production` (Batch 7C). A
  non-production deployment that is actually internet-facing could
  leak reset links.
- **Recommended fix:** none imminent; ensure `APP_ENV` reflects reality.
- **Priority:** Low.

### R10 — Text formats limited to UTF-8 / UTF-16-with-BOM
- **What:** Uploaded CSV/TSV/JSON/TXT must be UTF-8 (optionally with a
  BOM) or UTF-16 LE/BE with a BOM. Latin-1, CP1252, and other legacy
  encodings without a BOM are rejected at the signature check.
- **Rationale:** We do not silently guess encodings.
- **Workaround:** re-save as UTF-8 before upload.
- **Priority:** Accepted (design choice).

### R11 — Test coverage was zero (RESOLVED — Batch 1.0)
- **What it was:** No `backend/tests/`, no `frontend/tests/`, no
  `*.test.*` or `test_*.py` files, no `conftest.py`. Every change since
  Batch 1 shipped unverified.
- **Resolution (Batch 1.0):** 49 backend tests green, covering:
  config validators, module imports, all 18 router prefixes, HTTP smoke
  (`/health`, `/auth/config`, `/auth/me` as anonymous, `/openapi.json`,
  `/docs` 404, 404 unknown), SSRF guard (9 cases), crypto round-trip
  (3 cases), file signatures (11 cases), error sanitizer (4 cases),
  DB-error classifier (5 cases). Runner scripts at
  `scripts/test.ps1` / `scripts/test.sh`.
- **Priority:** Resolved.

### R12 — CI workflows not yet running (RESOLVED — Batch 1.1)
- **What:** `.github/workflows/security.yml` exists as `Security.txt`
  at repo root (wrong location + wrong extension). CI did not execute
  on push/PR.
- **Resolution (Batch 1.1):** File moved to `.github/workflows/security.yml`.
  Backend-tests job added to the workflow.
- **Priority:** Resolved.

### R13 — `env_file` reads two `.env` files
- **What:** `app/config.py` declares
  `env_file=(".env", "../.env")`. Both are read; the later tuple entry
  takes precedence. Users may have divergent values in
  `backend/.env` vs root `.env`, or assume one is authoritative.
- **Impact:** Operational confusion; secrets may exist in a file the
  operator doesn't think is live.
- **Mitigation today:** Tests use direct `os.environ` assignment (Batch
  1.0), so test isolation is unaffected. Runtime behavior is
  deterministic per pydantic-settings precedence.
- **Fix (Phase 0.2 docs follow-up):** Consolidate to a single root
  `.env.example`; delete or symlink `backend/.env.example`. Document
  precedence in README.
- **Priority:** Low.

### R14 — Upload round-trip test depends on response schema shape
- **What:** `test_upload_roundtrip.py` asserts `body["row_count"]` and
  `body["column_count"]` exist in the `/datasets/upload` response. If
  the schema changes field names, tests will fail with `KeyError`.
- **Mitigation:** Failure is loud and immediate — that's the point of
  the test. Fix is 1-line in the test.
- **Priority:** Accepted (this is a *feature* of having tests).

### R15 — CI depends on `pip-audit --strict` and `npm audit --high`
- **What:** The `backend-audit` and `frontend-audit` jobs fail on
  High/Critical CVEs. A newly-disclosed CVE in any dependency will turn
  the build red — including on the weekly cron.
- **Mitigation:** This is intentional. Alerts on CVEs are cheaper than
  shipping known-vulnerable deps.
- **Priority:** Accepted (design intent).

### R16 — Auth flow has no e2e coverage beyond unit helpers
- **Status:** ✅ **Resolved — Batch 1.2.** `test_auth_flow.py` covers
  register → login → JWT → `/auth/me` → forgot → reset → new login,
  plus single-use token, expired token, weak password rejection,
  duplicate detection, and email-enumeration resistance.
- **Remaining gap:** Backoff behavior (rate throttling under repeated
  failures) is not exercised — `auth_backoff_enabled` is monkeypatched
  to False for auth tests. A dedicated backoff test is a future batch.
- **Priority:** Low (unit tests for `auth_backoff.py` cover the math;
  only the wiring is untested e2e).

### R17 — Orchestrator E2E coverage was zero (RESOLVED — Batch 1.3)
- **Status:** ✅ **Resolved — Batch 1.3.** `test_orchestrator_e2e.py`
  drives `POST /chat/stream` end-to-end with a mocked LLM. Covers the
  full SSE protocol, run persistence, filter application, conversation
  context, and three error paths.
- **Remaining gap:** Frontend never receives SSE in tests — only the
  backend stream is verified. Frontend integration is Batch 1.4+.
- **Priority:** Resolved.

### R18 — Rate limit on `/chat/stream` not asserted in tests
- **What:** Rate limiting is disabled via `RATE_LIMIT_ENABLED=false`
  in conftest. A regression in `rate_limit.py` wouldn't be caught by
  E2E tests.
- **Mitigation:** Auth tests exercise the limiter decorator path —
  if the limiter breaks globally, they fail. A dedicated chat rate
  limit test is a future batch.
- **Priority:** Low.

### R19 — Frontend had zero test coverage (RESOLVED — Batch 1.4)
- **What it was:** No `frontend/tests/`, no `*.test.*` files, no
  test runner. Every frontend change since Batch 7 (frontend scaffold)
  shipped unverified.
- **Resolution (Batch 1.4):** vitest + jsdom scaffold. 5 test files
  covering pure-logic utilities: `http.ts` (error branches, auth
  headers, guest gate, rate limit), `encoding.ts` (round-trip,
  unicode, malformed input), `format.ts` (empty/valid passthrough,
  case handling), `time.ts` (parse, relative, absolute), `cn.ts`
  (merge, tailwind conflict resolution). CI job `frontend-tests`
  added with coverage artifact upload.
- **Remaining gap:** No React component tests, no SSE stream handler
  tests (`src/lib/sse.ts`), no store tests, no E2E.
- **Priority:** Resolved.

### R20 — SSE client stream handling not tested (RESOLVED — Batch 1.5)
- **What:** `src/lib/sse.ts` is the client-side SSE consumer. No
  tests. A regression here would silently break the workspace chat
  view — backend tests couldn't catch it.
- **Impact:** Users would see "spinner never resolves" with no
  error visible.
- **Resolution (Batch 1.5):** 14 vitest tests covering the full SSE spec
  (multi-line data, CRLF, trailing frames), split UTF-8 byte decoding,
  auth header injection, and all error/abort paths.
- **Priority:** Resolved.

### R21 — `parseError` fallback was dead code (RESOLVED — Batch 1.4)
- **What:** `frontend/src/lib/http.ts` `parseError()` called `res.json()`,
  and on error attempted `res.text()` as a fallback. `Response.json()`
  consumes the body stream, so the `res.text()` fallback threw "body
  already used" and the outer `HTTP ${status}` branch fired. Users
  saw `HTTP 500` instead of the actual error text from any non-JSON
  4xx/5xx response.
- **Impact:** Error messages from reverse proxies (nginx, Cloudflare),
  raw HTML error pages, and non-standard backends were replaced with
  a generic status string.
- **Resolution (Batch 1.4):** `parseError` now reads `res.text()` once
  and attempts `JSON.parse` on the result. Falls back to the text body,
  then to `HTTP ${status}` only if the body is empty or unreadable.
  Test `on 500 with non-JSON body falls back to text` now passes and
  guards against regression.
- **Priority:** Resolved.

### R22 — npm audit: 3 critical + 1 high in frontend dev deps (RESOLVED — Batch 1.4a)
- **What:** vitest@2.x transitively pins tinypool@1.x, which has two
  critical prototype-pollution-to-RCE CVEs with no patched 1.x release.
  monaco-editor@0.57.0 pins dompurify@3.4.15, vulnerable to two XSS
  advisories fixed in 3.4.16.
- **Impact:** CI `frontend-audit` would fail on every push; dev-server
  RCE risk if a malicious mock configuration is ever committed.
- **Resolution (Batch 1.4a):** vitest upgraded to 4.1.12 (no longer
  depends on tinypool); dompurify forced to >=3.4.16 via npm overrides.
  `npm audit` → 0 vulnerabilities.
- **Priority:** Resolved.

### R23 — Core UI components (Composer, AgentRail) had no render tests (RESOLVED — Batch 1.6)
- **What:** The most-used input surface (Composer) and the primary
  progress feedback (AgentRail) were untested. Regressions here break
  the main user loop.
- **Resolution (Batch 1.6):** RTL + jsdom scaffold added. Smoke tests
  cover rendering, keyboard submission, guest-mode gating, and the
  AgentRail collapsible state machine.
- **Priority:** Resolved.

---

## Closed hardening (reference)

| Batch | What |
|-------|------|
| 1 | Secrets validation at startup; `.env.example` cleanup; gitleaks pre-commit; `requirements-dev.txt` |
| 2A/2B | SSRF guard module + wiring in `connector_service`; SQLite path validation; connect timeout; drilldown column-name sanity check |
| 3A/3B | `AppError` hierarchy, `sanitize_message`, `classify_db_error`, correlation-ID middleware, three exception handlers; `str(e)[:N]` leaks patched in five files |
| 4A/4B | Dependency audit scaffolding (scripts + GitHub Actions); two CVEs fixed (pip PYSEC-2026-3721, DOMPurify) |
| 5A/5B | Per-account exponential auth backoff; wired into login; trusted-proxy IP derivation; `/health` exposes backoff stats |
| 6 | Magic-byte file signature check; streaming size cap; upload-time UTF-8 BOM strip; effective `file_path` storage; `_strip_bom_in_place` in `duckdb_service`; cleanup on delete / profiling failure |
| 7A | Read-only audit of `config.py` vs `.env.example` — 100% key coverage, 14 validation gaps flagged |
| 7C | `Settings.validate_ranges()` — range/enum checks; `validate_llm()` now called at startup; production safety net (`APP_DEBUG`, `AUTH_SHOW_RESET_LINK` refused when `APP_ENV=production`) |
| 7E-1 | `file_signature.py` accepts UTF-16 LE/BE with BOM; `datasets.py` commit-failure cleanup via `_cleanup_upload_group`; one missed `sanitize_message` site |
| 7E-2 | `duckdb_service.py` gains `run_with_timeout` + `execute_with_timeout`; `query()` enforces `QUERY_TIMEOUT_SECONDS`; `column_stats` runs all DuckDB calls under the timeout; `execute.py` `str(e)[:N]` client leaks closed |
| 7E-3 | Silent `except Exception: pass` blocks in `column_stats` now log structured warnings |
| 7-post | `core/route_audit.py` + `audit_routes(app)` at startup — version-agnostic route enumeration via `iter_route_contexts()`; fails boot if `/api/*` routes are missing (closes R2) |
| 84 | Post-Batch-83 review: R1 escalated to Medium; R11 closed by Batch 1.0 test foundation; R12 flagged (CI workflow misnamed as `Security.txt`); R13 flagged (dual `.env` load). No code changes — re-baseline only. |
| 1.1 | CI workflow moved from `Security.txt` to `.github/workflows/security.yml` (R12 closed) + `backend-tests` job added; upload round-trip tests added (R3 closed). |
| 1.2 | Auth flow e2e — register/login/me/reset (R16 resolved). |
| 1.3 | Orchestrator E2E via mocked LLM (R17 resolved; R18 noted). |
| 1.4 | `parseError` body-consumed-once bug fixed (R21 resolved). Frontend test scaffold + CI job added (R19 resolved). |
| 1.4a | Security audit remediation: vitest 4 upgrade, dompurify override (R22 resolved). |
| 1.5 | SSE client stream tests (R20 resolved). |
| 1.6 | Composer + AgentRail smoke tests (R23 resolved). |
| 16 | Provider fallback chain implemented; adapters refactored to accept explicit credentials (preventing cross-contamination of keys). |
---

## Verification convention

Every "Closed" row maps to a CHANGELOG entry. Every "Open" row should
have a code pointer or a test command. If a row has neither, it is
stale — update it.

Re-run this document at the end of every security batch. New findings
get a new R-number; resolved findings move to "Closed" with a batch tag.