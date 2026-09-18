"""
Async SMTP sender.

Fails soft: every send returns a bool, never raises into the request path.
If SMTP is disabled or unconfigured, sends are no-ops that log the intent.

The raw password is never logged. The raw email body is never logged.
"""
from __future__ import annotations

import structlog
from email.message import EmailMessage
from email.utils import formataddr

import aiosmtplib

from app.config import get_settings

log = structlog.get_logger()
settings = get_settings()


class EmailSender:
    def __init__(self) -> None:
        self.enabled = settings.email_delivery_active

    async def send(
        self,
        *,
        to: str,
        subject: str,
        html: str,
        text: str,
    ) -> bool:
        """
        Send an HTML+text email. Returns True on success, False otherwise.

        Never raises.
        """
        if not self.enabled:
            log.info(
                "email_skipped_smtp_disabled",
                to_domain=_domain(to),
                subject=subject,
            )
            return False

        message = EmailMessage()
        message["From"] = formataddr(
            (settings.smtp_from_name, settings.smtp_from_email)
        )
        message["To"] = to
        message["Subject"] = subject
        # Plain-text first, then HTML alternative (RFC 2046 ordering)
        message.set_content(text)
        message.add_alternative(html, subtype="html")

        try:
            await aiosmtplib.send(
                message,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_username or None,
                password=settings.smtp_password or None,
                start_tls=settings.smtp_use_tls and not settings.smtp_use_ssl,
                use_tls=settings.smtp_use_ssl,
                timeout=settings.smtp_timeout_seconds,
            )
            log.info(
                "email_sent",
                to_domain=_domain(to),
                subject=subject,
            )
            return True
        except Exception as e:
            # Never log the message body — it may contain a reset link
            log.warning(
                "email_send_failed",
                to_domain=_domain(to),
                subject=subject,
                error=str(e)[:200],
            )
            return False


def _domain(email: str) -> str:
    """Return the domain of an email address for logging. Never the local part."""
    if "@" not in email:
        return "unknown"
    return email.rsplit("@", 1)[1].lower()


# ── Singleton ───────────────────────────────────────────────

_sender: EmailSender | None = None


def get_email_sender() -> EmailSender:
    global _sender
    if _sender is None:
        _sender = EmailSender()
    return _sender