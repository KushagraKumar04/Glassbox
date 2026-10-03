"""
Content-based file signature verification.

The upload endpoint accepts an extension but the extension alone is not
proof of content type. This module reads the first few KB of a file and
verifies that the actual bytes match the declared extension.

Signatures:
  XLSX   → ZIP archive header ('PK\\x03\\x04' and variants)
  XLS    → OLE Compound File header (legacy .xls)
  Parquet → 'PAR1' magic
  CSV / TSV → text-plausible bytes (no NUL, valid UTF-8, no control chars)
  JSON / JSONL → text-plausible AND first non-whitespace char is { or [

The check is intentionally permissive for text-like formats. The goal is
to reject obviously wrong content (a PNG renamed to .csv, a binary blob
named .json), not to parse the file — parsing happens later and is
already sandboxed.
"""
from __future__ import annotations


class UploadSignatureError(ValueError):
    """Raised when a file's content doesn't match its declared extension."""


# ── Binary signatures ────────────────────────────────────────

_ZIP_HEADERS = (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")
_OLE_HEADER = b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1"
_PARQUET_MAGIC = b"PAR1"
_UTF8_BOM = b"\xef\xbb\xbf"

_BINARY_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "xlsx": _ZIP_HEADERS,
    "xls": (_OLE_HEADER,),
    "parquet": (_PARQUET_MAGIC,),
}

_TEXT_LIKE = {"csv", "tsv", "json", "jsonl", "txt"}


# ── Text heuristics ──────────────────────────────────────────

def _strip_bom(sample: bytes) -> bytes:
    return sample[3:] if sample.startswith(_UTF8_BOM) else sample


def _no_bad_controls(text: str) -> bool:
    """True if `text` has no control chars other than \\r \\n \\t."""
    for ch in text:
        code = ord(ch)
        if code < 32 and ch not in "\r\n\t":
            return False
    return True


def _decode_text_sample(sample: bytes) -> str | None:
    """
    Decode a byte sample to str if it looks like text; None otherwise.

    Accepts:
      - UTF-8, with or without BOM
      - UTF-16 LE with BOM (FF FE)
      - UTF-16 BE with BOM (FE FF)

    The UTF-16 branches require a BOM. A non-BOM sample containing a
    NUL byte is rejected — that catches renamed binaries without
    silently reinterpreting them as UTF-16.

    Returns None on decode failure or if the decoded text contains
    disallowed control characters.
    """
    if sample.startswith(b"\xff\xfe"):  # UTF-16 LE
        try:
            text = sample[2:].decode("utf-16-le")
        except UnicodeDecodeError:
            return None
        return text if _no_bad_controls(text) else None

    if sample.startswith(b"\xfe\xff"):  # UTF-16 BE
        try:
            text = sample[2:].decode("utf-16-be")
        except UnicodeDecodeError:
            return None
        return text if _no_bad_controls(text) else None

    body = _strip_bom(sample)
    if b"\x00" in body:
        return None
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        return None
    return text if _no_bad_controls(text) else None


def _is_probably_text(sample: bytes) -> bool:
    return _decode_text_sample(sample) is not None


def _looks_like_json(sample: bytes) -> bool:
    text = _decode_text_sample(sample)
    if text is None:
        return False
    return text.lstrip(" \t\r\n")[:1] in ("{", "[")


# ── Public API ───────────────────────────────────────────────

def verify_upload(content_head: bytes, extension: str, *, filename: str) -> None:
    """
    Raise UploadSignatureError if `content_head` doesn't match `extension`.

    Args:
        content_head: first ~8 KB of the uploaded file
        extension:    extension including the leading dot ('.csv'), or bare ('csv')
        filename:     original filename — used only for the error message
    """
    ext = extension.lower().lstrip(".")

    # ── Binary formats ──────────────────────────────────────
    if ext in _BINARY_SIGNATURES:
        signatures = _BINARY_SIGNATURES[ext]
        if not any(content_head.startswith(sig) for sig in signatures):
            raise UploadSignatureError(
                f"'{filename}' doesn't look like a valid {ext.upper()} file. "
                f"Its contents don't match the extension."
            )
        return

    # ── Text formats ────────────────────────────────────────
    if ext in ("json", "jsonl"):
        if not _is_probably_text(content_head):
            raise UploadSignatureError(
                f"'{filename}' doesn't look like a text file."
            )
        if not _looks_like_json(content_head):
            raise UploadSignatureError(
                f"'{filename}' doesn't look like valid JSON "
                f"(expected to start with {{ or [)."
            )
        return

    if ext in ("csv", "tsv", "txt"):
        if not _is_probably_text(content_head):
            raise UploadSignatureError(
                f"'{filename}' doesn't look like text. "
                f"CSV/TSV files must be UTF-8 encoded text."
            )
        return

    # ── Unknown extension ───────────────────────────────────
    raise UploadSignatureError(
        f"Unsupported file extension: '{extension}'"
    )