import { describe, it, expect } from "vitest";
import {
  appendDigit,
  removeDigit,
  isSearchable,
  formatPhone,
  normalisePhone,
} from "./kioskPhone";

describe("isSearchable", () => {
  it("refuses anything short of ten digits", () => {
    // THE CHILD-SAFETY RULE. The staffed desk searches on three characters;
    // on an unattended lobby tablet that is a browsable directory of the
    // congregation's children.
    for (const n of ["", "3", "301", "301555", "301555012"]) {
      expect(isSearchable(n)).toBe(false);
    }
  });

  it("accepts exactly ten", () => {
    expect(isSearchable("3015550123")).toBe(true);
  });

  it("refuses eleven, rather than searching on a prefix of it", () => {
    expect(isSearchable("13015550123")).toBe(false);
  });

  it("refuses anything that is not digits", () => {
    expect(isSearchable("301-555-01")).toBe(false);
    expect(isSearchable("Abel Yesh")).toBe(false);
  });
});

describe("appendDigit", () => {
  it("builds up to ten and then stops", () => {
    let d = "";
    for (const c of "30155501239999") d = appendDigit(d, c);
    expect(d).toBe("3015550123");
  });

  it("ignores anything that is not a digit", () => {
    expect(appendDigit("301", "x")).toBe("301");
    expect(appendDigit("301", "-")).toBe("301");
  });
});

describe("removeDigit", () => {
  it("removes one, and is safe on empty", () => {
    expect(removeDigit("3015")).toBe("301");
    expect(removeDigit("")).toBe("");
  });
});

describe("formatPhone", () => {
  it("formats as it is typed, so a parent can check their own number", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("30")).toBe("(30");
    expect(formatPhone("301")).toBe("(301");
    expect(formatPhone("3015")).toBe("(301) 5");
    expect(formatPhone("301555")).toBe("(301) 555");
    expect(formatPhone("3015550123")).toBe("(301) 555-0123");
  });
});

describe("normalisePhone", () => {
  it("takes the last ten digits, however the number was written", () => {
    // Must match church.kiosk_find_household_by_phone exactly. If the two
    // disagree, a parent the server WOULD find is told they do not exist,
    // which reads as the church having lost their record.
    for (const raw of [
      "3015550123",
      "301-555-0123",
      "(301) 555-0123",
      "+1 301 555 0123",
      "+13015550123",
      "1 (301) 555.0123",
    ]) {
      expect(normalisePhone(raw)).toBe("3015550123");
    }
  });

  it("leaves a short number short rather than padding it", () => {
    expect(normalisePhone("555-0123")).toBe("5550123");
    expect(isSearchable(normalisePhone("555-0123"))).toBe(false);
  });
});
