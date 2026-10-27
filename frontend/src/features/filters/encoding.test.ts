import { describe, expect, it } from "vitest";
import { decodeFilters, encodeFilters } from "./encoding";
import type { FilterCondition } from "./types";

const f = (column: string, operator: string, value: unknown) =>
  ({ column, operator, value }) as unknown as FilterCondition;

describe("encoding", () => {
  describe("encodeFilters", () => {
    it("returns empty string for empty array", () => {
      expect(encodeFilters([])).toBe("");
    });

    it("returns empty string for null/undefined", () => {
      // @ts-expect-error — defensive guard test
      expect(encodeFilters(null)).toBe("");
      // @ts-expect-error
      expect(encodeFilters(undefined)).toBe("");
    });

    it("strips base64 padding", () => {
      const out = encodeFilters([f("region", "=", "APAC")]);
      expect(out).not.toContain("=");
    });
  });

  describe("decodeFilters", () => {
    it("round-trips a single filter", () => {
      const input = [f("region", "=", "APAC")];
      expect(decodeFilters(encodeFilters(input))).toEqual(input);
    });

    it("round-trips multiple filters", () => {
      const input = [
        f("region", "=", "APAC"),
        f("revenue", ">", 1000),
        f("status", "in", ["active", "pending"]),
      ];
      expect(decodeFilters(encodeFilters(input))).toEqual(input);
    });

    it("round-trips unicode values", () => {
      const input = [f("name", "=", "café — 中文 — 😀")];
      expect(decodeFilters(encodeFilters(input))).toEqual(input);
    });

    it("returns [] for empty / null / undefined input", () => {
      expect(decodeFilters("")).toEqual([]);
      expect(decodeFilters(null)).toEqual([]);
      expect(decodeFilters(undefined)).toEqual([]);
    });

    it("returns [] for malformed base64", () => {
      expect(decodeFilters("not-valid-base64!!!")).toEqual([]);
    });

    it("returns [] for valid base64 of non-array JSON", () => {
      const b64 = btoa(JSON.stringify({ not: "an array" })).replace(
        /=+$/,
        "",
      );
      expect(decodeFilters(b64)).toEqual([]);
    });

    it("filters out entries missing column/operator", () => {
      const mixed = [
        { column: "region", operator: "=", value: "APAC" }, // ok
        { column: "valid", operator: ">" },                 // ok
        { column: "no-op", value: "x" },                    // missing operator
        { operator: "=", value: "x" },                      // missing column
        { column: "x", operator: "=" },                     // ok
      ];
      const b64 = btoa(JSON.stringify(mixed)).replace(/=+$/, "");
      const decoded = decodeFilters(b64);
      expect(decoded).toHaveLength(3);
      expect(decoded.map((d) => d.column)).toEqual([
        "region",
        "valid",
        "x",
      ]);
    });

    it("accepts already-padded base64", () => {
      const input = [f("a", "=", "b")];
      const padded = btoa(JSON.stringify(input)); // no strip
      expect(decodeFilters(padded)).toEqual(input);
    });
  });
});