import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RaidItemDto } from "@myapp/shared";
import { createApp } from "../app";
import { createFixture, type Fixture } from "../test/helpers";

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

const base = () => `/api/projects/${f.project.id}/raid`;
const body = {
  itemType: "risk",
  description: "Vendor may miss the integration date",
  impact: 3,
  likelihood: 2,
};

describe("RAID API", () => {
  it("requires sign in", async () => {
    expect((await anon.get(base())).status).toBe(401);
    expect((await anon.post(base()).send(body)).status).toBe(401);
  });

  it("lets a team member submit an item and computes code and severity", async () => {
    const res = await member.post(base()).send({ ...body, subprojectId: f.subA.id });
    expect(res.status).toBe(201);
    const item = json<RaidItemDto>(res);
    expect(item.code).toMatch(/^RAID-\d{2,}$/);
    expect(item.severityScore).toBe(6);
    expect(item.status).toBe("open");
    expect(item.raisedById).toBe(f.m1.id);
    expect(item.subprojectCode).toBe("SUB-A");
  });

  it("gives each item a unique, increasing code", async () => {
    const a = json<RaidItemDto>(await member.post(base()).send(body));
    const b = json<RaidItemDto>(await member.post(base()).send(body));
    expect(a.code).not.toBe(b.code);
  });

  it("rejects bad input", async () => {
    expect((await member.post(base()).send({ ...body, impact: 4 })).status).toBe(400);
    expect((await member.post(base()).send({ ...body, description: " " })).status).toBe(400);
    expect((await member.post(base()).send({ ...body, itemType: "nope" })).status).toBe(400);
  });

  it("rejects a subproject from another project", async () => {
    const res = await member.post(base()).send({ ...body, subprojectId: f.otherSub.id });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("only the PM can edit, resolve or delete", async () => {
    const item = json<RaidItemDto>(await member.post(base()).send(body));
    expect((await member.patch(`/api/raid/${item.id}`).send({ status: "closed" })).status).toBe(
      403,
    );
    expect((await member.delete(`/api/raid/${item.id}`)).status).toBe(403);

    const closed = json<RaidItemDto>(
      await pm.patch(`/api/raid/${item.id}`).send({ status: "closed", ownerId: f.pm.id }),
    );
    expect(closed.status).toBe("closed");
    expect(closed.closedAt).not.toBeNull();
    expect(closed.ownerName).toBe("Test PM");

    const reopened = json<RaidItemDto>(
      await pm.patch(`/api/raid/${item.id}`).send({ status: "open" }),
    );
    expect(reopened.closedAt).toBeNull();

    expect((await pm.delete(`/api/raid/${item.id}`)).status).toBe(204);
    expect((await pm.delete(`/api/raid/${item.id}`)).status).toBe(404);
  });

  it("filters by type, status and open only, and flags overdue items", async () => {
    const issue = json<RaidItemDto>(
      await member.post(base()).send({
        itemType: "issue",
        description: "Build is red",
        impact: 2,
        targetDate: "2020-01-01",
      }),
    );
    expect(issue.isOverdue).toBe(true);
    const onlyIssues = json<{ items: RaidItemDto[] }>(await pm.get(`${base()}?itemType=issue`));
    expect(onlyIssues.items.every((i) => i.itemType === "issue")).toBe(true);
    expect(onlyIssues.items.some((i) => i.id === issue.id)).toBe(true);

    await pm.patch(`/api/raid/${issue.id}`).send({ status: "closed" });
    const open = json<{ items: RaidItemDto[] }>(await pm.get(`${base()}?openOnly=true`));
    expect(open.items.some((i) => i.id === issue.id)).toBe(false);
  });

  describe("mitigating actions", () => {
    const create = async (actions: unknown[]) =>
      json<RaidItemDto>(await member.post(base()).send({ ...body, mitigatingActions: actions }));

    it("creates an item with an ordered checklist", async () => {
      const item = await create([
        { description: "Escalate to vendor" },
        { description: "Build a stub", isCompleted: true },
      ]);
      expect(item.mitigatingActions.map((a) => a.description)).toEqual([
        "Escalate to vendor",
        "Build a stub",
      ]);
      expect(item.mitigatingActions.map((a) => a.sortOrder)).toEqual([0, 1]);
      expect(item.mitigatingActions[0]?.isCompleted).toBe(false);
      expect(item.mitigatingActions[1]?.completedAt).not.toBeNull();
    });

    it("syncs additions, edits, removals and reordering on update", async () => {
      const item = await create([{ description: "A" }, { description: "B" }, { description: "C" }]);
      const [a, , c] = item.mitigatingActions;
      const res = await pm.patch(`/api/raid/${item.id}`).send({
        mitigatingActions: [
          { id: c?.id, description: "C edited", isCompleted: true },
          { id: a?.id, description: "A", isCompleted: false },
          { description: "D new" },
        ],
      });
      expect(res.status).toBe(200);
      const next = json<RaidItemDto>(res).mitigatingActions;
      expect(next.map((x) => x.description)).toEqual(["C edited", "A", "D new"]);
      expect(next[0]?.id).toBe(c?.id);
      expect(next[0]?.isCompleted).toBe(true);
      expect(next[0]?.completedAt).not.toBeNull();
      expect(next.some((x) => x.description === "B")).toBe(false);
    });

    it("leaves the checklist alone when the patch omits it, and clears it with an empty array", async () => {
      const item = await create([{ description: "Keep me" }]);
      const kept = json<RaidItemDto>(
        await pm.patch(`/api/raid/${item.id}`).send({ description: "New text" }),
      );
      expect(kept.mitigatingActions).toHaveLength(1);
      const cleared = json<RaidItemDto>(
        await pm.patch(`/api/raid/${item.id}`).send({ mitigatingActions: [] }),
      );
      expect(cleared.mitigatingActions).toHaveLength(0);
    });

    it("rejects an action id that belongs to another item", async () => {
      const one = await create([{ description: "Mine" }]);
      const two = await create([{ description: "Theirs" }]);
      const res = await pm.patch(`/api/raid/${two.id}`).send({
        mitigatingActions: [{ id: one.mitigatingActions[0]?.id, description: "Hijack" }],
      });
      expect(res.status).toBe(422);
    });

    it("rejects blank text and more than 20 actions", async () => {
      expect(
        (await member.post(base()).send({ ...body, mitigatingActions: [{ description: " " }] }))
          .status,
      ).toBe(400);
      const many = Array.from({ length: 21 }, (_, i) => ({ description: `a${i}` }));
      expect((await member.post(base()).send({ ...body, mitigatingActions: many })).status).toBe(
        400,
      );
    });

    it("toggles one action through the dedicated endpoint, PM only", async () => {
      const item = await create([{ description: "Do it" }]);
      const action = item.mitigatingActions[0];
      const url = `/api/raid/${item.id}/mitigating-actions/${action?.id}`;
      expect((await member.patch(url).send({ isCompleted: true })).status).toBe(403);
      const done = await pm.patch(url).send({ isCompleted: true });
      expect(done.status).toBe(200);
      expect(
        json<{ isCompleted: boolean; completedAt: string | null }>(done).completedAt,
      ).not.toBeNull();
      const undone = json<{ isCompleted: boolean; completedAt: string | null }>(
        await pm.patch(url).send({ isCompleted: false }),
      );
      expect(undone).toMatchObject({ isCompleted: false, completedAt: null });
      expect((await pm.patch(url).send({ isCompleted: "yes" })).status).toBe(400);
    });

    it("returns 404 when the action is not on that item", async () => {
      const one = await create([{ description: "Mine" }]);
      const two = await create([]);
      const res = await pm
        .patch(`/api/raid/${two.id}/mitigating-actions/${one.mitigatingActions[0]?.id}`)
        .send({ isCompleted: true });
      expect(res.status).toBe(404);
    });

    it("lists actions with their items", async () => {
      const item = await create([{ description: "Listed" }]);
      const list = json<{ items: RaidItemDto[] }>(await pm.get(base())).items;
      expect(list.find((i) => i.id === item.id)?.mitigatingActions[0]?.description).toBe("Listed");
    });
  });
});
