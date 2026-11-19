import { describe, expect, it } from "vitest";
import { personOrigins, type OriginActor, type OriginAuditRow } from "../lib/person-origin";

const actors = new Map<string, OriginActor>([
  ["plat", { name: "My Care Academy", role: "platform_admin" }],
  ["saj", { name: "Saj Ahmed", role: "platform_admin" }],
  ["gavin", { name: "Gavin Chilcott", role: "org_admin" }],
]);

const row = (r: Partial<OriginAuditRow> & Pick<OriginAuditRow, "action" | "created_at">): OriginAuditRow => ({
  entity_id: null,
  actor_id: null,
  actor_email: null,
  detail: null,
  ...r,
});

describe("who added a company's people", () => {
  it("matches a platform invite by email, whatever the case", () => {
    const o = personOrigins(
      [{ id: "u1", email: "A.Marshall@groupbureau.co.uk" }],
      [row({ action: "org.admin_invited", created_at: "2026-11-05T13:15:05Z", actor_id: "plat", detail: { email: "a.marshall@groupbureau.co.uk" } })],
      actors,
    ).get("u1")!;
    expect(o.added).toEqual({ at: "2026-11-05T13:15:05Z", by: "My Care Academy" });
    expect(o.roleChange).toBeNull();
  });

  it("names the platform person when it isn't the shared account", () => {
    const o = personOrigins(
      [{ id: "u1", email: "x@y.co" }],
      [row({ action: "organisation.invited", created_at: "2026-11-01T09:00:00Z", actor_id: "saj", detail: { people: [{ email: "x@y.co", ok: true }] } })],
      actors,
    ).get("u1")!;
    expect(o.added?.by).toBe("My Care Academy (Saj Ahmed)");
  });

  it("knows a free-trial sign-up, and a manager adding their own office worker", () => {
    const o = personOrigins(
      [{ id: "m", email: "m@y.co" }, { id: "o", email: "o@y.co" }],
      [
        row({ action: "organisation.signed_up", created_at: "2026-11-01T09:00:00Z", detail: { manager: { email: "m@y.co" } } }),
        row({ action: "user.invited", created_at: "2026-11-02T09:00:00Z", actor_id: "gavin", detail: { email: "o@y.co" } }),
      ],
      actors,
    );
    expect(o.get("m")!.added?.by).toBe("themselves, on the free-trial page");
    expect(o.get("o")!.added?.by).toBe("Gavin Chilcott");
  });

  it("takes the first add and the latest role change", () => {
    const o = personOrigins(
      [{ id: "u1", email: "x@y.co" }],
      [
        row({ action: "org.user_role_changed", created_at: "2026-11-03T09:00:00Z", entity_id: "u1", actor_id: "gavin", detail: { from: "learner", to: "org_office" } }),
        row({ action: "user.invited", created_at: "2026-11-02T09:00:00Z", actor_id: "gavin", detail: { email: "x@y.co" } }),
        row({ action: "org.user_role_changed", created_at: "2026-11-04T09:00:00Z", entity_id: "u1", actor_id: "plat", detail: { from: "org_office", to: "org_admin" } }),
        row({ action: "user.invited", created_at: "2026-11-05T09:00:00Z", actor_id: "plat", detail: { email: "x@y.co" } }),
      ],
      actors,
    ).get("u1")!;
    expect(o.added).toEqual({ at: "2026-11-02T09:00:00Z", by: "Gavin Chilcott" });
    expect(o.roleChange).toMatchObject({ at: "2026-11-04T09:00:00Z", by: "My Care Academy", to: "org_admin" });
  });

  it("returns nothing it can't find, and skips people who couldn't be added", () => {
    const o = personOrigins(
      [{ id: "u1", email: "x@y.co" }],
      [row({ action: "organisation.invited", created_at: "2026-11-01T09:00:00Z", detail: { people: [{ email: "x@y.co", ok: false }] } })],
      actors,
    ).get("u1")!;
    expect(o).toEqual({ added: null, roleChange: null });
  });
});
