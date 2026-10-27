"""Real unit tests for security-critical helpers. Zero skips."""
import pytest

from app.core.errors import (
    classify_db_error,
    sanitize_message,
)
from app.core.file_signature import UploadSignatureError, verify_upload
from app.core.ssrf_guard import SsrfError, assert_safe_host


# ══════════════════════════════════════════════════════════════════
# SSRF guard
# ══════════════════════════════════════════════════════════════════

class TestSsrfGuard:
    def test_loopback_rejected(self):
        with pytest.raises(SsrfError):
            assert_safe_host("127.0.0.1", 5432)

    def test_private_class_c_rejected(self):
        with pytest.raises(SsrfError):
            assert_safe_host("192.168.1.1", 5432)

    def test_private_class_a_rejected(self):
        with pytest.raises(SsrfError):
            assert_safe_host("10.0.0.1", 5432)

    def test_link_local_rejected(self):
        with pytest.raises(SsrfError):
            assert_safe_host("169.254.169.254", 80)

    def test_cloud_metadata_name_rejected(self):
        with pytest.raises(SsrfError):
            assert_safe_host("metadata.google.internal", 80)

    def test_localhost_name_rejected(self):
        with pytest.raises(SsrfError):
            assert_safe_host("localhost", 5432)

    def test_empty_host_rejected(self):
        with pytest.raises(SsrfError):
            assert_safe_host("", 5432)

    @pytest.mark.parametrize("port", [0, -1, 65536, 99999])
    def test_invalid_port_rejected(self, port):
        with pytest.raises(SsrfError):
            assert_safe_host("example.com", port)


# ══════════════════════════════════════════════════════════════════
# Crypto round-trip
# ══════════════════════════════════════════════════════════════════

class TestCrypto:
    def test_roundtrip(self):
        from app.core.crypto import decrypt, encrypt

        plaintext = "hello-glassbox-secret"
        ciphertext = encrypt(plaintext)
        assert ciphertext != plaintext
        assert decrypt(ciphertext) == plaintext

    def test_empty_strings_are_preserved(self):
        from app.core.crypto import decrypt, encrypt

        assert encrypt("") == ""
        assert decrypt("") == ""

    def test_invalid_ciphertext_returns_empty(self):
        from app.core.crypto import decrypt

        # decrypt() swallows InvalidToken/ValueError and returns "" so a
        # rotated SECRET_KEY yields 'wrong password', not a 500.
        assert decrypt("not-valid-base64-or-fernet-token") == ""


# ══════════════════════════════════════════════════════════════════
# File signatures
# ══════════════════════════════════════════════════════════════════

class TestFileSignature:
    def test_csv_plain_text_passes(self):
        verify_upload(b"a,b,c\n1,2,3\n", "csv", filename="test.csv")

    def test_csv_with_utf8_bom_passes(self):
        verify_upload(
            b"\xef\xbb\xbfa,b,c\n1,2,3\n", "csv", filename="test.csv"
        )

    def test_csv_with_binary_bytes_rejected(self):
        # PNG magic disguised as .csv
        with pytest.raises(UploadSignatureError):
            verify_upload(
                b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0d", "csv",
                filename="fake.csv",
            )

    def test_json_starting_with_brace_passes(self):
        verify_upload(b'{"a": 1}', "json", filename="test.json")

    def test_json_starting_with_bracket_passes(self):
        verify_upload(b"[1, 2, 3]", "json", filename="test.json")

    def test_json_not_starting_with_brace_rejected(self):
        with pytest.raises(UploadSignatureError):
            verify_upload(b"hello", "json", filename="test.json")

    def test_xlsx_with_zip_header_passes(self):
        verify_upload(b"PK\x03\x04....", "xlsx", filename="test.xlsx")

    def test_xlsx_without_zip_header_rejected(self):
        with pytest.raises(UploadSignatureError):
            verify_upload(b"plain text", "xlsx", filename="fake.xlsx")

    def test_parquet_with_magic_passes(self):
        verify_upload(b"PAR1....", "parquet", filename="test.parquet")

    def test_parquet_without_magic_rejected(self):
        with pytest.raises(UploadSignatureError):
            verify_upload(
                b"PK\x03\x04....", "parquet", filename="fake.parquet"
            )

    def test_unknown_extension_rejected(self):
        with pytest.raises(UploadSignatureError):
            verify_upload(b"anything", "exe", filename="bad.exe")


# ══════════════════════════════════════════════════════════════════
# Sanitizer
# ══════════════════════════════════════════════════════════════════

class TestSanitizer:
    def test_path_redacted(self):
        result = sanitize_message("Could not read /home/user/app/data/sales.csv")
        assert "/home/user" not in result
        assert "<path>" in result

    def test_credential_redacted(self):
        result = sanitize_message("Connection failed: password=hunter2")
        assert "hunter2" not in result
        assert "<redacted>" in result

    def test_max_len_truncates(self):
        assert len(sanitize_message("x" * 1000, max_len=100)) <= 100

    def test_empty_string_passes_through(self):
        assert sanitize_message("") == ""


# ══════════════════════════════════════════════════════════════════
# DB error classifier
# ══════════════════════════════════════════════════════════════════

class TestDbErrorClassifier:
    def test_auth_failed(self):
        assert classify_db_error("password authentication failed") == "auth_failed"

    def test_timeout(self):
        assert classify_db_error("connection timed out") == "timeout"

    def test_ssl_error(self):
        assert classify_db_error("SSL error occurred") == "ssl_error"

    def test_not_found(self):
        assert classify_db_error("database does not exist") == "not_found"

    def test_unknown_fallback(self):
        assert classify_db_error("something completely unexpected") == "unknown"
        