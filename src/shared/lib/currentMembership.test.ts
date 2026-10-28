import { describe, it, expect } from "vitest";
import { pickCurrentMembership } from "./currentMembership";

const MD = "md";
const VA = "va";

const m = (organization_id: string, role: string, is_primary = false) => ({
  organization_id,
  role,
  is_primary,
});

describe("pickCurrentMembership", () => {
  it("opens on the profile's default branch", () => {
    const picked = pickCurrentMembership([m(MD, "admin", true), m(VA, "contributor")], VA);
    expect(picked?.organization_id).toBe(VA);
  });

  it("does not open on a branch where the login is only a member, if it works in another", () => {
    // board@alic.org: Board in MD, a stray VA member row, default VA.
    const picked = pickCurrentMembership(
      [m(MD, "board", true), m(VA, "member", true)],
      VA,
    );
    expect(picked?.organization_id).toBe(MD);
  });

  it("is the mirror image for a VA contributor whose default is MD", () => {
    const picked = pickCurrentMembership(
      [m(MD, "member"), m(VA, "contributor", true)],
      MD,
    );
    expect(picked?.organization_id).toBe(VA);
  });

  it("prefers the primary of the staff branches, then the first", () => {
    const rows = [m("a", "admin"), m("b", "finance", true), m("c", "member", true)];
    expect(pickCurrentMembership(rows, "c")?.organization_id).toBe("b");
    expect(pickCurrentMembership([m("a", "admin"), m("b", "finance")], "z")?.organization_id).toBe("a");
  });

  it("keeps the default for someone who is only ever a member", () => {
    const rows = [m(MD, "member", true), m(VA, "member")];
    expect(pickCurrentMembership(rows, VA)?.organization_id).toBe(VA);
    expect(pickCurrentMembership(rows, null)?.organization_id).toBe(MD);
  });

  it("falls back to primary, then first, with no default or an unknown one", () => {
    const rows = [m(MD, "contributor"), m(VA, "contributor", true)];
    expect(pickCurrentMembership(rows, null)?.organization_id).toBe(VA);
    expect(pickCurrentMembership(rows, "nowhere")?.organization_id).toBe(VA);
    expect(pickCurrentMembership([m(MD, "contributor"), m(VA, "contributor")], undefined)?.organization_id).toBe(MD);
  });

  it("has nothing to pick for nobody", () => {
    expect(pickCurrentMembership([], MD)).toBeNull();
  });
});
