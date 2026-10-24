import { describe, it, expect } from "vitest";
import { errorMessage } from "./errorMessage";

describe("errorMessage", () => {
  it("reads a thrown Error", () => {
    expect(errorMessage(new Error("Room already booked"))).toBe("Room already booked");
  });

  it("reads a PostgrestError, which is not an Error", () => {
    // The whole reason this exists: supabase-js rejects with a plain object,
    // so `instanceof Error` is false and the real reason was being dropped.
    const refusal = {
      message: "This is the last admin of this branch. Make somebody else an admin first.",
      details: null,
      hint: null,
      code: "23514",
    };

    expect(errorMessage(refusal)).toMatch(/last admin of this branch/);
  });

  it("keeps a Postgres hint, which is written to be read", () => {
    expect(
      errorMessage({ message: "duplicate key value violates unique constraint", hint: "Use a different email." }),
    ).toBe("duplicate key value violates unique constraint Use a different email.");
  });

  it("accepts a bare string", () => {
    expect(errorMessage("Nothing to record")).toBe("Nothing to record");
  });

  it("falls back rather than showing empty space", () => {
    expect(errorMessage(null)).toBe("An error occurred");
    expect(errorMessage({})).toBe("An error occurred");
    expect(errorMessage({ message: "   " })).toBe("An error occurred");
    expect(errorMessage(new Error(""))).toBe("An error occurred");
    expect(errorMessage(undefined, "Could not save")).toBe("Could not save");
  });
});
