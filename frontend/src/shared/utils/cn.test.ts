import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });

  it("joins simple class names", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("ignores falsy values", () => {
    expect(cn("a", false, null, undefined, "", 0, "b")).toBe("a b");
  });

  it("evaluates conditional classes", () => {
    const active = true;
    const inactive = false;
    expect(cn("base", active && "active", inactive && "inactive")).toBe(
      "base active",
    );
  });

  it("resolves Tailwind conflicts — later wins", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("accepts array inputs", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c");
  });

  it("accepts object inputs", () => {
    expect(cn({ a: true, b: false, c: true })).toBe("a c");
  });
});