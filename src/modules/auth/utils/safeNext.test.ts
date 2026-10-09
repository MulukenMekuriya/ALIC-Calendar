import { describe, it, expect } from "vitest";
import { safeNext, signInFor } from "./safeNext";

describe("safeNext", () => {
  it("returns a parent to the page their email link opened", () => {
    expect(safeNext("/my?tab=children&consent=1")).toBe("/my?tab=children&consent=1");
  });

  it("never sends anyone off the site", () => {
    for (const bad of ["https://evil.com", "//evil.com/my", "/\\evil.com", "evil.com", "javascript:alert(1)"]) {
      expect(safeNext(bad)).toBe("/dashboard");
    }
  });

  it("falls back to the dashboard, as sign-in always did", () => {
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
    expect(safeNext("/auth?next=/my")).toBe("/dashboard");
  });
});

describe("signInFor", () => {
  it("carries the page through sign-in, and round-trips", () => {
    const to = signInFor("/my?tab=children&consent=1");
    expect(to).toBe("/auth?next=%2Fmy%3Ftab%3Dchildren%26consent%3D1");
    const next = new URLSearchParams(to.split("?")[1]).get("next");
    expect(safeNext(next)).toBe("/my?tab=children&consent=1");
  });

  it("keeps the plain sign-in page for the front door", () => {
    expect(signInFor("/")).toBe("/auth");
    expect(signInFor("/dashboard")).toBe("/auth");
  });
});
