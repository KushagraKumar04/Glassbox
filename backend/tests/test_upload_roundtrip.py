"""Upload round-trip tests — closes SECURITY.md R3.

Covers the upload path end-to-end through TestClient:
- Happy path: CSV / JSON / Parquet accepted with correct profile counts
- Security: magic-byte rejection, size cap, BOM strip (unit + e2e)
- Round-trip: upload → GET → DELETE → 404, file removed from disk
"""
import io
from pathlib import Path

import pytest


# ── Helpers ──────────────────────────────────────────────

def _csv_bytes(rows: int = 3) -> bytes:
    lines = ["a,b,c"]
    for i in range(rows):
        lines.append(f"{i},{i * 10},{i * 100}")
    return ("\n".join(lines) + "\n").encode("utf-8")


def _upload(client, name: str, content: bytes, mime: str = "text/csv"):
    return client.post(
        "/api/v1/datasets/upload",
        files={"file": (name, content, mime)},
    )


# ── Happy path ───────────────────────────────────────────

class TestUploadHappyPath:
    def test_csv_upload_returns_profile(self, app_client):
        r = _upload(app_client, "test_happy.csv", _csv_bytes(rows=5))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["row_count"] == 5
        assert body["column_count"] == 3
        assert body["id"]
        app_client.delete(f"/api/v1/datasets/{body['id']}")

    def test_json_upload(self, app_client):
        content = b'[{"a": 1, "b": 2}, {"a": 3, "b": 4}]'
        r = _upload(app_client, "test.json", content, "application/json")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["row_count"] == 2
        app_client.delete(f"/api/v1/datasets/{body['id']}")

    def test_parquet_upload(self, app_client):
        import pandas as pd
        df = pd.DataFrame({"x": [1, 2, 3]})
        buf = io.BytesIO()
        df.to_parquet(buf, index=False)
        r = _upload(
            app_client,
            "test.parquet",
            buf.getvalue(),
            "application/octet-stream",
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["row_count"] == 3
        app_client.delete(f"/api/v1/datasets/{body['id']}")


# ── Security ─────────────────────────────────────────────

class TestUploadSecurity:
    def test_png_disguised_as_csv_rejected(self, app_client):
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        r = _upload(app_client, "fake.csv", png)
        assert 400 <= r.status_code < 500, (
            f"expected 4xx rejection, got {r.status_code}: {r.text}"
        )

    def test_binary_disguised_as_json_rejected(self, app_client):
        r = _upload(
            app_client, "fake.json", b"\x00\x01\x02\x03", "application/json"
        )
        assert 400 <= r.status_code < 500, r.text

    def test_size_cap_enforced(self, app_client, monkeypatch):
        from app.config import get_settings
        s = get_settings()
        monkeypatch.setattr(s, "max_upload_size_mb", 1)

        big = b"a,b,c\n" + (b"1,2,3\n" * 400_000)  # ~2.4 MB
        r = _upload(app_client, "big.csv", big)
        assert r.status_code >= 400, r.text

    def test_strip_bom_in_place_helper(self, tmp_path):
        """Direct unit test for the SECURITY.md Batch-6 BOM strip path."""
        from app.services import duckdb_service

        fn = getattr(duckdb_service, "_strip_bom_in_place", None)
        assert fn is not None, (
            "duckdb_service._strip_bom_in_place missing — BOM strip path "
            "referenced in SECURITY.md Batch 6 may have been renamed"
        )

        f = tmp_path / "bom.csv"
        f.write_bytes(b"\xef\xbb\xbfa,b,c\n1,2,3\n")
        fn(str(f))
        assert f.read_bytes() == b"a,b,c\n1,2,3\n"

    def test_utf8_bom_csv_upload_succeeds(self, app_client):
        content = b"\xef\xbb\xbf" + _csv_bytes(rows=2)
        r = _upload(app_client, "with_bom.csv", content)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["row_count"] == 2
        app_client.delete(f"/api/v1/datasets/{body['id']}")


# ── Round-trip ───────────────────────────────────────────

class TestUploadRoundTrip:
    def test_upload_get_delete_cycle(self, app_client):
        r = _upload(app_client, "roundtrip.csv", _csv_bytes(rows=10))
        assert r.status_code == 200, r.text
        dataset_id = r.json()["id"]

        g = app_client.get(f"/api/v1/datasets/{dataset_id}")
        assert g.status_code == 200
        assert g.json()["id"] == dataset_id

        d = app_client.delete(f"/api/v1/datasets/{dataset_id}")
        assert 200 <= d.status_code < 300, d.text

        g2 = app_client.get(f"/api/v1/datasets/{dataset_id}")
        assert g2.status_code == 404

    def test_delete_removes_file_from_disk(self, app_client):
        from app.config import get_settings
        s = get_settings()
        upload_dir = Path(s.upload_dir)

        before = {str(p) for p in upload_dir.rglob("*") if p.is_file()}

        r = _upload(app_client, "cleanup.csv", _csv_bytes())
        assert r.status_code == 200, r.text
        dataset_id = r.json()["id"]

        after = {str(p) for p in upload_dir.rglob("*") if p.is_file()}
        new_files = after - before
        assert new_files, "no new file appeared on disk after upload"

        app_client.delete(f"/api/v1/datasets/{dataset_id}")

        final = {str(p) for p in upload_dir.rglob("*") if p.is_file()}
        orphans = new_files & final
        assert not orphans, f"orphaned files after delete: {orphans}"