import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { KanoDto } from "@myapp/shared";
import { createApp } from "../app";
import { approveAll, createFixture, type Fixture } from "../test/helpers";

type Agent = ReturnType<typeof request.agent>;
const json = <T>(res: { body: unknown }): T => res.body as T;

const app = createApp();
let f: Fixture;
let pm: Agent;
let member: Agent;
let anon: Agent;

async function loginAs(email: string) {
  const agent = request.agent(app);
  expect((await agent.post("/api/auth/login").send({ email, password: f.password })).status).toBe(
    200,
  );
  return agent;
}

beforeAll(async () => {
  f = await createFixture();
  pm = await loginAs(f.pm.email);
  member = await loginAs(f.m1.email);
  anon = request.agent(app);
});
afterAll(async () => {
  await f.cleanup();
});

const base = () => `/api/projects/${f.project.id}/kano`;
const submit = async (extra: Record<string, unknown> = {}) =>
  json<KanoDto>(
    await member.post(base()).send({
      revisionRequest: "Export engagement data to CSV",
      ...extra,
    }),
  );

describe("Kano API", () => {
  it("requires sign in", async () => {
    expect((await anon.get(base())).status).toBe(401);
    expect((await anon.post(base()).send({})).status).toBe(401);
  });

  it("lets a team member submit an unevaluated request with a REQ code", async () => {
    const r = await submit();
    expect(r.code).toMatch(/^REQ-\d{3,}$/);
    expect(r.kanoCategory).toBeNull();
    // The scoring, decision and story fields no longer exist on the resource.
    for (const gone of [
      "decision",
      "wsjfScore",
      "riceScore",
      "promotedStoryId",
      "promotedStoryCode",
    ]) {
      expect(r).not.toHaveProperty(gone);
    }
  });

  it("lets a team member edit a request, but only the PM can categorize or delete", async () => {
    const mine = await submit();
    const edited = await member
      .patch(`/api/kano/${mine.id}`)
      .send({ revisionRequest: "Edited by member" });
    expect(edited.status).toBe(200);
    expect(json<KanoDto>(edited).revisionRequest).toBe("Edited by member");
    expect((await member.patch(`/api/kano/${mine.id}`).send({ kanoCategory: null })).status).toBe(
      403,
    );

    const r = await submit();
    for (const res of [
      await member.patch(`/api/kano/${r.id}`).send({ kanoCategory: "must_be" }),
      await member.delete(`/api/kano/${r.id}`),
    ]) {
      expect(res.status).toBe(403);
    }
  });

  it("updates category and plan, and ignores the removed fields", async () => {
    const r = await submit();
    const updated = json<KanoDto>(
      await pm.patch(`/api/kano/${r.id}`).send({
        kanoCategory: "performance",
        targetDate: "2026-12-31",
        decision: "approve_mvp",
        wsjfBusinessValue: 8,
        riceReach: 1000,
      }),
    );
    expect(updated.kanoCategory).toBe("performance");
    expect(updated.targetDate).toBe("2026-12-31");
    expect(updated).not.toHaveProperty("decision");
    expect(updated).not.toHaveProperty("wsjfBusinessValue");
    expect(updated).not.toHaveProperty("riceReach");
  });

  it("accepts a target date on submit and rejects a malformed one", async () => {
    const r = await submit({ targetDate: "2026-11-30" });
    expect(r.targetDate).toBe("2026-11-30");
    expect(
      (await member.post(base()).send({ revisionRequest: "x", targetDate: "30/11/2026" })).status,
    ).toBe(400);
  });

  it("stores and returns the person responsible for a PM or a team member", async () => {
    const created = await submit({ responsibleId: f.m1.id });
    expect(created).toMatchObject({ responsibleId: f.m1.id, responsibleName: f.m1.fullName });
    const reassigned = json<KanoDto>(
      await pm.patch(`/api/kano/${created.id}`).send({ responsibleId: f.pm.id }),
    );
    expect(reassigned).toMatchObject({ responsibleId: f.pm.id, responsibleName: f.pm.fullName });
    const listed = json<{ items: KanoDto[] }>(await pm.get(base())).items;
    expect(listed.find((i) => i.id === created.id)?.responsibleName).toBe(f.pm.fullName);
    const cleared = json<KanoDto>(
      await pm.patch(`/api/kano/${created.id}`).send({ responsibleId: null }),
    );
    expect(cleared.responsibleId).toBeNull();
    expect(cleared.responsibleName).toBeNull();
  });

  it("rejects a malformed or unknown person responsible", async () => {
    const r = await submit();
    expect((await pm.patch(`/api/kano/${r.id}`).send({ responsibleId: "nope" })).status).toBe(400);
    const ghost = "00000000-0000-4000-8000-000000000000";
    expect((await pm.patch(`/api/kano/${r.id}`).send({ responsibleId: ghost })).status).toBe(422);
    expect(
      (await member.post(base()).send({ revisionRequest: "x", responsibleId: ghost })).status,
    ).toBe(422);
  });

  it("rejects an unknown category", async () => {
    const r = await submit();
    expect((await pm.patch(`/api/kano/${r.id}`).send({ kanoCategory: "nope" })).status).toBe(400);
  });

  it("lists newest first by default, supports sort=code, and filters by category", async () => {
    const first = await submit({ revisionRequest: "Older request" });
    const second = await submit({ revisionRequest: "Newer request" });
    await pm.patch(`/api/kano/${second.id}`).send({ kanoCategory: "attractive" });
    const list = json<{ items: KanoDto[] }>(await pm.get(base()));
    const ids = list.items.map((i) => i.id);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
    const times = list.items.map((i) => Date.parse(i.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));

    const byCode = json<{ items: KanoDto[] }>(await pm.get(`${base()}?sort=code`));
    const seqs = byCode.items.map((i) => Number(i.code.replace("REQ-", "")));
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect((await pm.get(`${base()}?sort=wsjf`)).status).toBe(400);

    const only = json<{ items: KanoDto[] }>(await pm.get(`${base()}?kanoCategory=attractive`));
    expect(only.items.length).toBeGreaterThan(0);
    expect(only.items.every((i) => i.kanoCategory === "attractive")).toBe(true);
    const un = json<{ items: KanoDto[] }>(await pm.get(`${base()}?unevaluated=true`));
    expect(un.items.every((i) => i.kanoCategory === null)).toBe(true);
  });

  it("no longer exposes the promote endpoint", async () => {
    const r = await submit();
    expect(
      (await pm.post(`/api/kano/${r.id}/promote`).send({ subprojectId: f.subA.id })).status,
    ).toBe(404);
  });

  it("reports the project name and moves a request to another project with a new code", async () => {
    const r = await submit();
    expect(r.projectId).toBe(f.project.id);
    expect(r.projectName).toBeTruthy();
    const moved = json<KanoDto>(
      await pm.patch(`/api/kano/${r.id}`).send({ projectId: f.otherProject.id }),
    );
    expect(moved.projectId).toBe(f.otherProject.id);
    expect(moved.targetDate).toBeNull();
    const all = json<{ items: KanoDto[] }>(await pm.get("/api/kano"));
    expect(all.items.some((i) => i.id === r.id)).toBe(true);
  });

  it("creates a request in the project chosen in the form", async () => {
    // Members are scoped to their own project, so the PM submits into the other one.
    const r = json<KanoDto>(
      await pm
        .post(base())
        .send({ revisionRequest: "Chosen project", projectId: f.otherProject.id }),
    );
    expect(r.projectId).toBe(f.otherProject.id);
  });

  describe("revision specs", () => {
    it("starts with no specs: 0% and not complete", async () => {
      const r = await submit();
      expect(r.specs).toEqual([]);
      expect(r.completionPercent).toBe(0);
      expect(r.isComplete).toBe(false); // zero specs is never complete
    });

    it("saves specs on create, in order, and rejects a blank label", async () => {
      const r = await submit({
        specs: [{ label: "Add CSV button" }, { label: "Include headers" }],
      });
      expect(r.specs.map((s) => s.label)).toEqual(["Add CSV button", "Include headers"]);
      expect(r.specsTotal).toBe(2);
      expect(r.specsCompleted).toBe(0);
      const bad = await member
        .post(base())
        .send({ revisionRequest: "x", specs: [{ label: "  " }] });
      expect(bad.status).toBe(400);
      const old = await member.post(base()).send({ description: "x" });
      expect(old.status).toBe(400); // the old field name is gone
    });

    it("is complete only when every spec is checked (100% rule)", async () => {
      const r = await submit({ specs: [{ label: "a" }, { label: "b" }, { label: "c" }] });
      const [a, b, c] = r.specs;
      await approveAll(f.project.id);
      const toggle = async (id: string | undefined, isCompleted: boolean) =>
        json<KanoDto>(await pm.patch(`/api/kano/${r.id}/specs/${id}`).send({ isCompleted }));
      let cur = await toggle(a?.id, true);
      expect(cur.completionPercent).toBe(33);
      expect(cur.isComplete).toBe(false);
      cur = await toggle(b?.id, true);
      expect(cur.completionPercent).toBe(67);
      expect(cur.isComplete).toBe(false);
      cur = await toggle(c?.id, true);
      expect(cur.completionPercent).toBe(100);
      expect(cur.isComplete).toBe(true);
      expect(cur.specs.every((s) => s.completedAt !== null)).toBe(true);
      cur = await toggle(c?.id, false);
      expect(cur.isComplete).toBe(false);
      expect(cur.specs.find((s) => s.id === c?.id)?.completedAt).toBeNull();
    });

    it("syncs the list on update: keeps, edits, adds and removes", async () => {
      const r = await submit({ specs: [{ label: "keep" }, { label: "drop" }] });
      const keep = r.specs[0];
      await approveAll(f.project.id);
      const updated = json<KanoDto>(
        await pm.patch(`/api/kano/${r.id}`).send({
          specs: [{ id: keep?.id, label: "kept", isCompleted: true }, { label: "new" }],
        }),
      );
      expect(updated.specs.map((s) => s.label)).toEqual(["kept", "new"]);
      expect(updated.specs[0]?.id).toBe(keep?.id);
      expect(updated.specsCompleted).toBe(1);
      const cleared = json<KanoDto>(await pm.patch(`/api/kano/${r.id}`).send({ specs: [] }));
      expect(cleared.specs).toEqual([]);
      expect(cleared.isComplete).toBe(false);
    });

    it("stores a target date and person responsible per spec, on create and update", async () => {
      const r = await submit({
        specs: [
          { label: "dated", targetDate: "2026-12-01", responsibleId: f.m2.id },
          { label: "untagged" },
        ],
      });
      expect(r.specs[0]).toMatchObject({
        targetDate: "2026-12-01",
        responsibleId: f.m2.id,
        responsibleName: f.m2.fullName,
      });
      expect(r.specs[1]).toMatchObject({
        targetDate: null,
        responsibleId: null,
        responsibleName: null,
      });
      const [a, b] = r.specs;
      const updated = json<KanoDto>(
        await pm.patch(`/api/kano/${r.id}`).send({
          specs: [
            { id: a?.id, label: "dated", targetDate: null, responsibleId: null },
            { id: b?.id, label: "untagged", targetDate: "2027-01-15", responsibleId: f.m1.id },
            { label: "added", targetDate: "2027-02-01" },
          ],
        }),
      );
      expect(updated.specs.map((s) => [s.targetDate, s.responsibleId])).toEqual([
        [null, null],
        ["2027-01-15", f.m1.id],
        ["2027-02-01", null],
      ]);
      // Reloading returns the same values.
      const reread = json<{ items: KanoDto[] }>(await pm.get(`/api/projects/${f.project.id}/kano`));
      expect(reread.items.find((k) => k.id === r.id)?.specs[1]?.targetDate).toBe("2027-01-15");
    });

    it("validates per-spec fields and keeps legacy request-level dates readable", async () => {
      const bad = await member
        .post(base())
        .send({ revisionRequest: "x", specs: [{ label: "a", targetDate: "1/2/2026" }] });
      expect(bad.status).toBe(400);
      const ghost = await member.post(base()).send({
        revisionRequest: "x",
        specs: [{ label: "a", responsibleId: "00000000-0000-4000-8000-000000000000" }],
      });
      expect(ghost.status).toBe(422);
      // The request-level date is no longer required, and a legacy one still round-trips.
      const legacy = await submit({ targetDate: "2026-11-30", specs: [{ label: "a" }] });
      expect(legacy.targetDate).toBe("2026-11-30");
      expect(legacy.specs[0]?.targetDate).toBeNull();
      expect((await submit({ specs: [{ label: "a" }] })).targetDate).toBeNull();
    });

    it("rejects unknown spec ids and toggling a spec of another request", async () => {
      const r = await submit({ specs: [{ label: "a" }] });
      const other = await submit({ specs: [{ label: "z" }] });
      const bad = await pm
        .patch(`/api/kano/${r.id}`)
        .send({ specs: [{ id: other.specs[0]?.id, label: "stolen" }] });
      expect(bad.status).toBe(422);
      const cross = await pm
        .patch(`/api/kano/${r.id}/specs/${other.specs[0]?.id}`)
        .send({ isCompleted: true });
      expect(cross.status).toBe(404);
      const memberTick = () =>
        member.patch(`/api/kano/${r.id}/specs/${r.specs[0]?.id}`).send({ isCompleted: true });
      // A team member is blocked by the PM approval gate, then allowed once approved.
      expect((await memberTick()).status).toBe(403);
      await approveAll(f.project.id);
      expect((await memberTick()).status).toBe(200);
    });
  });
});
