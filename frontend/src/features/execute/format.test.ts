import { describe, expect, it } from "vitest";
import { canFormat, formatSql } from "./format";

describe("formatSql", () => {
  it("returns empty input unchanged", () => {
    expect(formatSql("")).toBe("");
  });

  it("returns whitespace-only input unchanged", () => {
    const ws = "   \n\t  ";
    expect(formatSql(ws)).toBe(ws);
  });

  it("uppercases keywords", () => {
    const out = formatSql("select a, b from t where a = 1");
    expect(out).toContain("SELECT");
    expect(out).toContain("FROM");
    expect(out).toContain("WHERE");
  });

  it("preserves identifier case", () => {
    const out = formatSql("SELECT MixedCaseColumn FROM MyTable");
    expect(out).toContain("MixedCaseColumn");
    expect(out).toContain("MyTable");
  });
});

describe("canFormat", () => {
  it("returns false for empty string", () => {
    expect(canFormat("")).toBe(false);
  });

  it("returns false for whitespace-only", () => {
    expect(canFormat("   ")).toBe(false);
  });

  it("returns true for valid SQL", () => {
    expect(canFormat("SELECT 1")).toBe(true);
  });
});