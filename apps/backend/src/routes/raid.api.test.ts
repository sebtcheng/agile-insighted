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
});
