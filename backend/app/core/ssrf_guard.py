"""
SSRF guard for user-supplied database hosts.

The `/sources/test` and `/sources` endpoints accept an arbitrary host and
port. Without a guard, an authenticated user could:

  - Reach cloud metadata services (169.254.169.254, etc.)
  - Port-scan the internal network
  - Hit local-only services (localhost:6379 redis, localhost:9200 elastic)

This module resolves the host to all its IPs and rejects anything that
falls in the private / loopback / link-local / multicast / reserved ranges
unless `CONNECTOR_ALLOW_PRIVATE_HOSTS=true`.

Public API:

    assert_safe_host(host, port)   →  raises SsrfError on rejection

Called from `ConnectorService.attach()` before DuckDB does the ATTACH.
"""
from __future__ import annotations

import ipaddress
import socket

import structlog

from app.config import get_settings

log = structlog.get_logger()
settings = get_settings()

# Always-blocked host names (case-insensitive), even if they somehow
# resolve to a public IP.
_HARD_BLOCKED_NAMES = {
    "metadata.google.internal",
    "metadata.azure.com",
    "metadata.azure.internal",
    "metadata",
    "instance-data",
}


class SsrfError(ValueError):
    """Raised when a host fails the SSRF check."""


def _parse_csv(value: str) -> list[str]:
    return [x.strip().lower() for x in (value or "").split(",") if x.strip()]


def _is_ip_allowed(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """
    Return True only if the IP is a globally-routable public address.

    Rejects: private, loopback, link-local, multicast, reserved,
    unspecified, and IPv6 unique-local.
    """
    if ip.is_private or ip.is_loopback or ip.is_link_local:
        return False
    if ip.is_multicast or ip.is_reserved or ip.is_unspecified:
        return False
    # IPv6 unique-local (fc00::/7) is covered by is_private in modern Python,
    # but guard anyway.
    if isinstance(ip, ipaddress.IPv6Address) and ip.is_private:
        return False
    return True


def _in_cidr_list(
    ip: ipaddress.IPv4Address | ipaddress.IPv6Address,
    cidrs: list[str],
) -> bool:
    """Return True if `ip` matches any CIDR or exact-IP entry in the list."""
    for entry in cidrs:
        try:
            # Exact IP match
            candidate = ipaddress.ip_address(entry)
            if candidate == ip:
                return True
        except ValueError:
            # Not a bare IP — try CIDR
            try:
                net = ipaddress.ip_network(entry, strict=False)
                if ip in net:
                    return True
            except ValueError:
                continue
    return False


def _resolve(host: str) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    """
    Resolve a hostname to a list of IPs. Returns an empty list on failure.
    Also handles the case where the host is already a literal IP.
    """
    # Literal IP?
    try:
        return [ipaddress.ip_address(host)]
    except ValueError:
        pass

    try:
        info = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return []

    out: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    seen: set[str] = set()
    for entry in info:
        addr = entry[4][0]
        if addr in seen:
            continue
        seen.add(addr)
        try:
            out.append(ipaddress.ip_address(addr))
        except ValueError:
            continue
    return out


def assert_safe_host(host: str, port: int) -> None:
    """
    Raise SsrfError if the host/port pair is not allowed.

    Order of checks:
      1. Port must be 1..65535 (rejects 0 and negative).
      2. Hard-blocked names (case-insensitive).
      3. Explicit blocklist (CIDR or host).
      4. Explicit allowlist — if configured, host MUST match one of these.
      5. Private-IP policy — unless `connector_allow_private_hosts` is True,
         every resolved IP must be a public, globally routable address.
    """
    h = (host or "").strip().lower()
    if not h:
        raise SsrfError("Host is required.")

    if not (1 <= port <= 65535):
        raise SsrfError(f"Port must be between 1 and 65535 (got {port}).")

    if h in _HARD_BLOCKED_NAMES:
        log.warning("ssrf_hard_blocked_name", host=h)
        raise SsrfError(f"Host '{host}' is not allowed.")

    blocklist = _parse_csv(settings.connector_blocklist)
    if h in {b for b in blocklist if not _looks_like_cidr(b)}:
        log.warning("ssrf_blocklist_host", host=h)
        raise SsrfError(f"Host '{host}' is not allowed.")

    allowlist = _parse_csv(settings.connector_allowlist)

    ips = _resolve(h)
    if not ips:
        raise SsrfError(f"Could not resolve host '{host}'.")

    # Allowlist takes precedence if configured
    if allowlist:
        allowlist_hostnames = [a for a in allowlist if not _looks_like_cidr(a)]
        allowlist_cidrs = [a for a in allowlist if _looks_like_cidr(a)]
        # A hostname match passes outright
        if h in allowlist_hostnames:
            return
        # Otherwise every resolved IP must be in the CIDR allowlist
        for ip in ips:
            if not _in_cidr_list(ip, allowlist_cidrs):
                log.warning("ssrf_not_in_allowlist", host=h, ip=str(ip))
                raise SsrfError(
                    f"Host '{host}' is not in CONNECTOR_ALLOWLIST."
                )
        return

    # Blocklist by CIDR
    for ip in ips:
        if _in_cidr_list(ip, blocklist):
            log.warning("ssrf_blocklist_cidr", host=h, ip=str(ip))
            raise SsrfError(f"Host '{host}' is not allowed.")

    # Private-host policy
    if not settings.connector_allow_private_hosts:
        for ip in ips:
            if not _is_ip_allowed(ip):
                log.warning("ssrf_private_ip", host=h, ip=str(ip))
                raise SsrfError(
                    f"Host '{host}' resolves to a private or reserved IP "
                    f"({ip}). To allow this, set "
                    f"CONNECTOR_ALLOW_PRIVATE_HOSTS=true or add the host "
                    f"to CONNECTOR_ALLOWLIST."
                )


def _looks_like_cidr(entry: str) -> bool:
    """True if the entry parses as an IP or CIDR (not a hostname)."""
    if "/" in entry:
        try:
            ipaddress.ip_network(entry, strict=False)
            return True
        except ValueError:
            return False
    try:
        ipaddress.ip_address(entry)
        return True
    except ValueError:
        return False