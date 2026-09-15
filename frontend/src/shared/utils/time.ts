/**
 * Time utilities.
 *
 * The backend emits ISO 8601 strings in UTC. Modern backends add a `Z`
 * or `+00:00` suffix; older rows might not. `parseServerDate` handles both
 * by assuming UTC when no timezone marker is present — this prevents the
 * "+5h ago" bug on IST machines reading naive timestamps.
 */

const TZ_SUFFIX_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export function parseServerDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  const hasTz = TZ_SUFFIX_RE.test(s);
  return new Date(hasTz ? s : `${s}Z`);
}

export function formatRelative(
  input: string | Date | null | undefined,
): string {
  const d = input instanceof Date ? input : parseServerDate(input);
  if (!d || Number.isNaN(d.getTime())) return "—";

  const diff = Date.now() - d.getTime();
  const sec = Math.round(diff / 1000);

  if (sec < 30) return "just now";
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;

  return d.toLocaleDateString();
}

export function formatAbsolute(
  input: string | Date | null | undefined,
): string {
  const d = input instanceof Date ? input : parseServerDate(input);
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}