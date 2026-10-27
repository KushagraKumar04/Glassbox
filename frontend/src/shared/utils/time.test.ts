import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatAbsolute,
  formatRelative,
  parseServerDate,
} from "./time";

describe("time", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("parseServerDate", () => {
    it("parses ISO with Z suffix", () => {
      const d = parseServerDate("2026-01-15T12:00:00Z");
      expect(d?.toISOString()).toBe("2026-01-15T12:00:00.000Z");
    });

    it("parses ISO with timezone offset", () => {
      const d = parseServerDate("2026-01-15T17:30:00+05:30");
      expect(d?.toISOString()).toBe("2026-01-15T12:00:00.000Z");
    });

    it("treats naive string as UTC (appends Z)", () => {
      const d = parseServerDate("2026-01-15T12:00:00");
      expect(d?.toISOString()).toBe("2026-01-15T12:00:00.000Z");
    });

    it("returns null for null / undefined / empty / whitespace", () => {
      expect(parseServerDate(null)).toBeNull();
      expect(parseServerDate(undefined)).toBeNull();
      expect(parseServerDate("")).toBeNull();
      expect(parseServerDate("   ")).toBeNull();
    });
  });

  describe("formatRelative", () => {
    it("'just now' for < 30 seconds", () => {
      expect(formatRelative(new Date(Date.now() - 10_000))).toBe(
        "just now",
      );
    });

    it("Xs ago for 30–59 seconds", () => {
      expect(formatRelative(new Date(Date.now() - 45_000))).toBe(
        "45s ago",
      );
    });

    it("Xm ago for 1–59 minutes", () => {
      expect(formatRelative(new Date(Date.now() - 5 * 60_000))).toBe(
        "5m ago",
      );
    });

    it("Xh ago for 1–23 hours", () => {
      expect(
        formatRelative(new Date(Date.now() - 3 * 3_600_000)),
      ).toBe("3h ago");
    });

    it("Xd ago for 1–6 days", () => {
      expect(
        formatRelative(new Date(Date.now() - 3 * 86_400_000)),
      ).toBe("3d ago");
    });

    it("returns '—' for null input", () => {
      expect(formatRelative(null)).toBe("—");
    });

    it("returns '—' for invalid input", () => {
      expect(formatRelative("not-a-date")).toBe("—");
    });
  });

  describe("formatAbsolute", () => {
    it("returns '—' for null", () => {
      expect(formatAbsolute(null)).toBe("—");
    });

    it("formats a valid date (contains year)", () => {
      const out = formatAbsolute("2026-01-15T12:00:00Z");
      expect(out).not.toBe("—");
      expect(out).toMatch(/2026/);
    });
  });
});