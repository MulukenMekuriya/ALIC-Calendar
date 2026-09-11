/**
 * Tests for capability resolution.
 *
 * The cases that matter most are the negative ones: a check-in volunteer must
 * not be able to read the member directory, and a grant at one branch must not
 * leak to the other.
 */

import { describe, it, expect } from "vitest";
import {
  resolveCapabilities,
  can,
  canAny,
  canAll,
  CAPABILITIES,
  type ModuleGrant,
} from "./capabilities";

const MD = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VA = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

const grant = (organization_id: string, role: ModuleGrant["role"]): ModuleGrant => ({
  organization_id,
  role,
});

describe("resolveCapabilities", () => {
  it("grants an org admin every capability", () => {
    const caps = resolveCapabilities({ isOrgAdmin: true, grants: [], organizationId: MD });
    expect(caps.size).toBe(CAPABILITIES.length);
    for (const capability of CAPABILITIES) {
      expect(caps.has(capability)).toBe(true);
    }
  });

  it("grants nothing when there is no organization in context", () => {
    expect(
      resolveCapabilities({ isOrgAdmin: true, grants: [], organizationId: null }).size
    ).toBe(0);
    expect(
      resolveCapabilities({ isOrgAdmin: true, grants: [], organizationId: undefined }).size
    ).toBe(0);
  });

  it("grants nothing to a user with no grants", () => {
    expect(
      resolveCapabilities({ isOrgAdmin: false, grants: [], organizationId: MD }).size
    ).toBe(0);
  });

  it("does not leak grants across organizations", () => {
    const caps = resolveCapabilities({
      isOrgAdmin: false,
      grants: [grant(MD, "kids_admin")],
      organizationId: VA,
    });
    expect(caps.size).toBe(0);
  });

  it("resolves a grant for the organization in context", () => {
    const caps = resolveCapabilities({
      isOrgAdmin: false,
      grants: [grant(MD, "kids_admin"), grant(VA, "members_viewer")],
      organizationId: VA,
    });
    expect(can(caps, "members.read")).toBe(true);
    expect(can(caps, "kids.write")).toBe(false);
  });

  describe("kids_volunteer", () => {
    const caps = resolveCapabilities({
      isOrgAdmin: false,
      grants: [grant(MD, "kids_volunteer")],
      organizationId: MD,
    });

    it("can check children in and out", () => {
      expect(can(caps, "kids.checkin")).toBe(true);
    });

    it("CANNOT read the member directory", () => {
      expect(can(caps, "members.read")).toBe(false);
      expect(can(caps, "members.write")).toBe(false);
    });

    it("CANNOT reach kids admin screens", () => {
      expect(can(caps, "kids.read")).toBe(false);
      expect(can(caps, "kids.write")).toBe(false);
    });

    it("CANNOT authorize a checkout override — that is the two-person rule", () => {
      expect(can(caps, "kids.override")).toBe(false);
    });
  });

  describe("kids_admin", () => {
    const caps = resolveCapabilities({
      isOrgAdmin: false,
      grants: [grant(MD, "kids_admin")],
      organizationId: MD,
    });

    it("runs the whole kids ministry, override included", () => {
      expect(can(caps, "kids.read")).toBe(true);
      expect(can(caps, "kids.write")).toBe(true);
      expect(can(caps, "kids.checkin")).toBe(true);
      expect(can(caps, "kids.override")).toBe(true);
    });

    /**
     * Regression: this grant used to bundle members.read, which put Members
     * and Families in the sidebar and handed a kids leader the entire
     * directory through an unaudited table read. The kids module reads no
     * directory table — every name it shows comes from a SECURITY DEFINER RPC
     * that logs the access.
     */
    it("CANNOT read the member directory", () => {
      expect(can(caps, "members.read")).toBe(false);
      expect(can(caps, "members.write")).toBe(false);
      expect(can(caps, "members.import")).toBe(false);
    });
  });

  describe("kids_leader", () => {
    const caps = resolveCapabilities({
      isOrgAdmin: false,
      grants: [grant(MD, "kids_leader")],
      organizationId: MD,
    });

    it("runs their own grades but cannot authorize an override", () => {
      expect(can(caps, "kids.read")).toBe(true);
      expect(can(caps, "kids.write")).toBe(true);
      expect(can(caps, "kids.checkin")).toBe(true);
      expect(can(caps, "kids.override")).toBe(false);
    });

    it("CANNOT read the member directory", () => {
      expect(can(caps, "members.read")).toBe(false);
      expect(can(caps, "members.write")).toBe(false);
    });
  });

  /**
   * Grants are additive, so a kids leader who genuinely needs the directory is
   * given the directory grant rather than having it smuggled in with kids.
   */
  it("stacks kids_admin with members_viewer when someone holds both", () => {
    const caps = resolveCapabilities({
      isOrgAdmin: false,
      grants: [grant(MD, "kids_admin"), grant(MD, "members_viewer")],
      organizationId: MD,
    });
    expect(can(caps, "kids.override")).toBe(true);
    expect(can(caps, "members.read")).toBe(true);
    expect(can(caps, "members.write")).toBe(false);
  });

  describe("leadership_viewer", () => {
    const caps = resolveCapabilities({
      isOrgAdmin: false,
      grants: [grant(MD, "leadership_viewer")],
      organizationId: MD,
    });

    it("is read-only across both modules", () => {
      expect(can(caps, "members.read")).toBe(true);
      expect(can(caps, "kids.read")).toBe(true);
      expect(can(caps, "members.write")).toBe(false);
      expect(can(caps, "kids.write")).toBe(false);
      expect(can(caps, "members.import")).toBe(false);
      expect(can(caps, "kids.checkin")).toBe(false);
    });
  });

  describe("members roles", () => {
    it("members_viewer is read-only", () => {
      const caps = resolveCapabilities({
        isOrgAdmin: false,
        grants: [grant(MD, "members_viewer")],
        organizationId: MD,
      });
      expect(can(caps, "members.read")).toBe(true);
      expect(can(caps, "members.write")).toBe(false);
    });

    it("members_admin can write but not bulk-import", () => {
      const caps = resolveCapabilities({
        isOrgAdmin: false,
        grants: [grant(MD, "members_admin")],
        organizationId: MD,
      });
      expect(can(caps, "members.write")).toBe(true);
      expect(can(caps, "members.import")).toBe(false);
    });

    it("unions multiple grants in the same organization", () => {
      const caps = resolveCapabilities({
        isOrgAdmin: false,
        grants: [grant(MD, "members_admin"), grant(MD, "members_import")],
        organizationId: MD,
      });
      expect(can(caps, "members.write")).toBe(true);
      expect(can(caps, "members.import")).toBe(true);
    });
  });

  it("ignores an unknown role rather than throwing", () => {
    const caps = resolveCapabilities({
      isOrgAdmin: false,
      // Simulates a role added to the database ahead of a frontend deploy.
      grants: [{ organization_id: MD, role: "future_role" as ModuleGrant["role"] }],
      organizationId: MD,
    });
    expect(caps.size).toBe(0);
  });
});

describe("canAny / canAll", () => {
  const caps = resolveCapabilities({
    isOrgAdmin: false,
    grants: [grant(MD, "members_viewer")],
    organizationId: MD,
  });

  it("canAny passes when one requirement is met", () => {
    expect(canAny(caps, ["members.read", "kids.write"])).toBe(true);
    expect(canAny(caps, ["kids.write", "kids.read"])).toBe(false);
  });

  it("canAny treats an empty requirement as no gate", () => {
    expect(canAny(caps, [])).toBe(true);
  });

  it("canAll requires every capability", () => {
    expect(canAll(caps, ["members.read"])).toBe(true);
    expect(canAll(caps, ["members.read", "members.write"])).toBe(false);
  });
});

describe("the giving pair", () => {
  it("gives a giving_admin the ledger and nothing else", () => {
    const caps = resolveCapabilities({
      isOrgAdmin: false,
      grants: [grant(MD, "giving_admin")],
      organizationId: MD,
    });
    expect(can(caps, "giving.read")).toBe(true);
    expect(can(caps, "giving.write")).toBe(true);
    // A treasurer is not a directory user. The giving screens get donor names
    // from SECURITY DEFINER functions precisely so this stays false.
    expect(can(caps, "members.read")).toBe(false);
    expect(can(caps, "kids.read")).toBe(false);
  });

  it("gives a giving_viewer read but not write", () => {
    const caps = resolveCapabilities({
      isOrgAdmin: false,
      grants: [grant(MD, "giving_viewer")],
      organizationId: MD,
    });
    expect(can(caps, "giving.read")).toBe(true);
    expect(can(caps, "giving.write")).toBe(false);
  });

  it("does not let a members or leadership role reach the ledger", () => {
    for (const role of ["members_admin", "members_viewer", "leadership_viewer"] as const) {
      const caps = resolveCapabilities({
        isOrgAdmin: false,
        grants: [grant(MD, role)],
        organizationId: MD,
      });
      expect(can(caps, "giving.read")).toBe(false);
      expect(can(caps, "giving.write")).toBe(false);
    }
  });

  it("does not leak a giving grant across branches", () => {
    const caps = resolveCapabilities({
      isOrgAdmin: false,
      grants: [grant(MD, "giving_admin")],
      organizationId: VA,
    });
    expect(caps.size).toBe(0);
  });
});
