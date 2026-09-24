"""
Password reset email — inline-styled HTML + plain-text fallback.

Inline styles only (many email clients strip <style> blocks).
Neutral background, brand accent on the button. Works in Gmail, Outlook,
Apple Mail, and every webmail.
"""
from __future__ import annotations

from html import escape


def password_reset_email(
    *,
    username: str,
    reset_url: str,
    expires_minutes: int,
) -> tuple[str, str]:
    """
    Return (html, text) for the password reset email.
    """
    safe_user = escape(username or "there")
    safe_url = escape(reset_url, quote=True)

    html = f"""<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f5f7;padding:40px 20px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;background:#ffffff;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,.04);overflow:hidden;">
            <!-- Brand bar -->
            <tr>
              <td style="padding:28px 32px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#22D3EE,#8B5CF6);text-align:center;vertical-align:middle;color:#04121A;font-weight:700;font-size:16px;">A</td>
                    <td style="padding-left:10px;font-weight:600;font-size:15px;color:#0B1020;">Glassbox</td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:24px 32px 8px;">
                <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#0B1020;">Reset your password</h1>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#4b5563;">
                  Hi {safe_user}, we received a request to reset your password.
                  Click the button below to choose a new one.
                </p>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td style="padding:8px 32px 8px;">
                <a href="{safe_url}" style="display:inline-block;padding:12px 22px;background:#0B1020;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">
                  Set new password
                </a>
              </td>
            </tr>

            <!-- Fallback URL -->
            <tr>
              <td style="padding:16px 32px 8px;">
                <p style="margin:0 0 8px;font-size:12.5px;color:#6b7280;">
                  Or paste this link into your browser:
                </p>
                <p style="margin:0;font-size:12px;color:#4b5563;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f3f4f6;padding:10px 12px;border-radius:8px;">
                  {safe_url}
                </p>
              </td>
            </tr>

            <!-- Expiry -->
            <tr>
              <td style="padding:20px 32px 8px;">
                <p style="margin:0;font-size:12.5px;color:#9ca3af;">
                  This link expires in {expires_minutes} minutes and can only be used once.
                  If you didn't request a password reset, you can safely ignore this email.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:24px 32px 28px;border-top:1px solid #e5e7eb;margin-top:20px;">
                <p style="margin:0;font-size:11.5px;color:#9ca3af;line-height:1.5;">
                  You're receiving this email because someone requested a password reset for your
                  Glassbox account. If this wasn't you, no action is needed — your
                  password won't change until you click the link above.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""

    text = f"""Reset your password

Hi {username or "there"},

We received a request to reset your Glassbox password.

Open this link to choose a new password:
{reset_url}

This link expires in {expires_minutes} minutes and can only be used once.

If you didn't request a password reset, you can safely ignore this email.
Your password won't change until you click the link above.
"""

    return html, text