import { describe, it, expect } from "vitest";
import { changedFields, isEmptyPatch } from "./formPatch";

describe("changedFields", () => {
  it("sends nothing when nothing moved", () => {
    const same = { first_name: "Selam", city: "Silver Spring" };
    expect(changedFields(same, { ...same })).toEqual({});
    expect(isEmptyPatch(changedFields(same, { ...same }))).toBe(true);
  });

  it("sends only the fields that moved", () => {
    expect(
      changedFields(
        { first_name: "Selam", city: "Silver Spring" },
        { first_name: "Selam", city: "Wheaton" }
      )
    ).toEqual({ city: "Wheaton" });
  });

  it("turns an emptied field into null, so the column is cleared", () => {
    expect(changedFields({ address_line2: "Apt 4" }, { address_line2: "" })).toEqual({
      address_line2: null,
    });
  });

  it("treats a field of spaces as emptied, not as a value", () => {
    expect(changedFields({ preferred_name: "Sela" }, { preferred_name: "   " })).toEqual({
      preferred_name: null,
    });
  });

  it("coerces the columns that are numbers in the database", () => {
    expect(
      changedFields({ birth_year: "", birth_month: "" }, { birth_year: "2017", birth_month: "4" }, [
        "birth_year",
        "birth_month",
      ])
    ).toEqual({ birth_year: 2017, birth_month: 4 });
  });

  it("leaves a numeric field that was cleared as null, not as NaN", () => {
    expect(changedFields({ birth_year: "2017" }, { birth_year: "" }, ["birth_year"])).toEqual({
      birth_year: null,
    });
  });

  it("never invents a key the form did not carry", () => {
    // The household form renders no `notes`, so a patch must not mention one
    // even though the row has the column.
    expect(Object.keys(changedFields({ city: "A" }, { city: "B" }))).toEqual(["city"]);
  });
});
