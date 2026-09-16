/**
 * The two pure decisions in the photo feature: what a face falls back to, and
 * which files are turned away before they reach the bucket.
 *
 * Both are small, and both are the sort of thing that is wrong in a way nobody
 * notices until a member with one name or an iPhone tries to use them.
 */

import { describe, it, expect } from "vitest";
import { personInitials } from "../components/PersonAvatar";
import { describeFileProblem } from "../services/photoService";

const file = (name: string, type: string, bytes = 1000) =>
  new File([new Uint8Array(bytes)], name, { type });

describe("personInitials", () => {
  it("takes the first and last of a full name", () => {
    expect(personInitials("Selam Abebe")).toBe("SA");
  });

  it("skips the middle name rather than showing three letters", () => {
    expect(personInitials("Selam Ruth Abebe")).toBe("SA");
  });

  it("uses two letters of a single name", () => {
    // Ethiopian records in this directory are not all two-part names.
    expect(personInitials("Selam")).toBe("SE");
  });

  it("copes with the spacing an import leaves behind", () => {
    expect(personInitials("  Selam   Abebe  ")).toBe("SA");
  });

  it("has something to show for a nameless row", () => {
    expect(personInitials("")).toBe("?");
    expect(personInitials(null)).toBe("?");
    expect(personInitials(undefined)).toBe("?");
  });
});

describe("describeFileProblem", () => {
  it("passes the four formats the bucket accepts", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      expect(describeFileProblem(file("a.jpg", type))).toBeNull();
    }
  });

  it("names HEIC specifically, because that is what an iPhone sends", () => {
    const problem = describeFileProblem(file("IMG_0042.HEIC", "image/heic"));
    expect(problem).toMatch(/HEIC/);
    expect(problem).toMatch(/Most Compatible/);
  });

  it("catches a HEIC the browser could not put a type on", () => {
    expect(describeFileProblem(file("IMG_0042.heic", ""))).toMatch(/HEIC/);
  });

  it("turns away a document without pretending it is a format problem", () => {
    expect(describeFileProblem(file("scan.pdf", "application/pdf"))).toMatch(/not a photo/);
  });

  it("says how big the file actually was", () => {
    const problem = describeFileProblem(file("huge.jpg", "image/jpeg", 6 * 1024 * 1024));
    expect(problem).toMatch(/6\.0 MB/);
    expect(problem).toMatch(/limit is 5 MB/);
  });

  it("allows a file exactly on the limit", () => {
    expect(describeFileProblem(file("edge.jpg", "image/jpeg", 5 * 1024 * 1024))).toBeNull();
  });
});
