/**
 * Serialize/deserialize filter arrays into a URL-safe base64 string.
 * Used in the workspace URL so filters survive refresh + are shareable.
 */
import type { FilterCondition } from "./types";

export function encodeFilters(filters: FilterCondition[]): string {
  if (!filters || filters.length === 0) return "";
  try {
    const json = JSON.stringify(filters);
    // Base64 in the browser
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/=+$/, "");
  } catch {
    return "";
  }
}

export function decodeFilters(raw: string | null | undefined): FilterCondition[] {
  if (!raw) return [];
  try {
    // Restore padding
    const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (f): f is FilterCondition =>
          typeof f === "object" &&
          f !== null &&
          typeof f.column === "string" &&
          typeof f.operator === "string",
      );
    }
    return [];
  } catch {
    return [];
  }
}