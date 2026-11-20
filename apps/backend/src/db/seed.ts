import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import type { ActivityPriority, ActivityStatus, Health, Track, WorkType } from "@myapp/shared";
import { env } from "../env";
import { logger } from "../logger";
import type { Actor } from "../permissions";
import * as activityService from "../services/activityService";
import { addComment, createTag } from "../services/activityQueries";
import { addDays, localDate, weekStart } from "../services/dateBuckets";
import { hashPassword } from "../services/authService";
import * as gov from "../services/governanceService";
import { updateSprint } from "../services/projectService";
import { db, pool } from "./client";
import { seedModules } from "./seedModules";
import { activities, codeCounters, projects, sprints, subprojects, users } from "./schema";

const SUBPROJECTS: Array<[code: string, name: string, health: Health, note: string | null]> = [
  ["PRJ-01", "Student Engagement Analytics", "on_track", null],
  ["PRJ-02", "Adaptive Learning Paths", "at_risk", "Content mapping is behind plan"],
  ["PRJ-03", "Early Warning Intervention System", "on_track", null],
  ["PRJ-04", "Automated Formative Feedback", "on_track", null],
  ["PRJ-05", "Educator Command Center", "off_track", "Waiting on identity provider decision"],
  ["PRJ-06", "Parent-Guardian Portal", "on_track", null],
  ["PRJ-07", "LMS Interoperability & LTI 1.3", "at_risk", "Vendor sandbox access is slow"],
  ["PRJ-08", "Competency Assessment Hub", "on_track", null],
  ["PRJ-09", "Mobile Student Companion", "at_risk", "Release signing not set up"],
  ["PRJ-10", "District Executive Reporting", "on_track", null],
  ["PRJ-11", "Accessibility & Universal Design", "on_track", null],
  ["PRJ-12", "Teacher Professional Development", "on_track", null],
  ["PRJ-13", "Content Authoring Studio", "off_track", "Editor spike failed, re-planning"],
  ["PRJ-14", "Notifications & Messaging", "on_track", null],
  ["PRJ-15", "Institutional Data Lake & API", "at_risk", "Schema ownership unresolved"],
];

// Four realistic activity titles per subproject, in the same order as SUBPROJECTS.
const TITLES: string[][] = [
  [
    "Define weekly active learner metric",
    "Build engagement trend chart for a class",
    "Instrument login and session events",
    "Review privacy notes for telemetry",
  ],
  [
    "Map prerequisite graph for Grade 7 math",
    "Prototype next-lesson recommender",
    "Tune difficulty adjustment thresholds",
    "Write adaptive path acceptance tests",
  ],
  [
    "Draft risk indicators with counselors",
    "Build at-risk student list view",
    "Add intervention notes to a student record",
    "Backtest warning model on last term",
  ],
  [
    "Design rubric-based feedback template",
    "Generate draft feedback from quiz answers",
    "Add teacher review step before release",
    "Measure feedback turnaround time",
  ],
  [
    "Sketch the class overview screen",
    "Build attendance and grades summary card",
    "Add single sign-on for teachers",
    "Usability test with five teachers",
  ],
  [
    "Design guardian invite flow",
    "Show child progress in plain language",
    "Add translated notification templates",
    "Review consent and data sharing rules",
  ],
  [
    "Register tool with the LMS sandbox",
    "Implement LTI 1.3 launch handshake",
    "Sync roster through the names service",
    "Document platform onboarding steps",
  ],
  [
    "Define the competency framework model",
    "Build assessment blueprint editor",
    "Map items to competencies",
    "Create mastery report for a learner",
  ],
  [
    "Set up mobile app shell and navigation",
    "Offline cache for assignments",
    "Push token registration",
    "Accessibility pass on onboarding screens",
  ],
  [
    "Choose KPIs for the district dashboard",
    "Build school comparison view",
    "Schedule monthly PDF export",
    "Validate numbers against finance report",
  ],
  [
    "Audit color contrast across main screens",
    "Add keyboard navigation to data tables",
    "Write screen reader test script",
    "Create accessibility statement draft",
  ],
  [
    "Plan the coaching cycle calendar",
    "Build lesson observation form",
    "Link PD courses to competencies",
    "Collect teacher feedback on pilot",
  ],
  [
    "Evaluate rich text editor options",
    "Build lesson block palette",
    "Add draft and publish states",
    "Import existing lesson plans",
  ],
  [
    "Define notification categories and quiet hours",
    "Build in-app notification center",
    "Create message template editor",
    "Load test the delivery queue",
  ],
  [
    "Draft the shared data model",
    "Set up a staging warehouse",
    "Expose read-only API for reports",
    "Write data retention policy",
  ],
];

const PRIORITIES: ActivityPriority[] = ["low", "medium", "high", "urgent", "medium", "high"];
const WORK_TYPES: WorkType[] = ["feature", "feature", "defect", "enabler", "debt", "risk"];
const TRACKS: Track[] = ["delivery", "discovery", "delivery", "delivery"];

const MEMBER_NAMES = [
  "Ana Reyes",
  "Ben Santos",
  "Carla Dizon",
  "Dino Cruz",
  "Elena Tan",
  "Felix Ramos",
  "Grace Lim",
  "Hugo Bautista",
];

export type SeedOptions = {
  memberCount?: number;
  pmPassword: string;
  memberPassword: string;
  now?: Date;
};

const at = (ymd: string, hour = 3): Date => new Date(`${ymd}T0${hour}:00:00Z`);

/** Seeds one project through activityService so every status change has an event. Safe to call on an empty database only. */
export async function seedDatabase(opts: SeedOptions): Promise<{ projectId: string }> {
  const now = opts.now ?? new Date();
  const today = localDate(now, env.APP_TIMEZONE);
  const monday = weekStart(today);
  const memberCount = Math.min(opts.memberCount ?? 6, MEMBER_NAMES.length);

  const [existing] = await db.select({ id: projects.id }).from(projects).limit(1);
  if (existing) throw new Error("Database already has a project; seed expects an empty database");

  const pmHash = await hashPassword(opts.pmPassword);
  const memberHash = await hashPassword(opts.memberPassword);
  const [pm] = await db
    .insert(users)
    .values({
      email: "pm@insighted.local",
      fullName: "Paulo Mendoza",
      role: "pm",
      passwordHash: pmHash,
    })
    .returning();
  if (!pm) throw new Error("PM insert failed");
  const members = await db
    .insert(users)
    .values(
      MEMBER_NAMES.slice(0, memberCount).map((fullName, i) => ({
        email: `member${i + 1}@insighted.local`,
        fullName,
        role: "team_member" as const,
        passwordHash: memberHash,
      })),
    )
    .returning();

  const [project] = await db
    .insert(projects)
    .values({ name: "Student Success Platform", code: "SSP", ownerId: pm.id })
    .returning();
  if (!project) throw new Error("Project insert failed");

  const subs = await db
    .insert(subprojects)
    .values(
      SUBPROJECTS.map(([code, name, health, healthNote], i) => ({
        projectId: project.id,
        code,
        name,
        health,
        healthNote,
        leadId: members[i % members.length]?.id ?? pm.id,
        description: `${name} for the Student Success Platform.`,
      })),
    )
    .returning();
  // The seeded codes are PRJ-01..PRJ-nn; new subprojects continue after them.
  await db
    .insert(codeCounters)
    .values({ projectId: project.id, scope: "sub", lastValue: SUBPROJECTS.length });

  const [completedSprint, activeSprint] = await db
    .insert(sprints)
    .values([
      {
        projectId: project.id,
        name: "Sprint 1",
        goal: "Stand up the core data model and first dashboards",
        startDate: addDays(monday, -28),
        endDate: addDays(monday, -15),
        status: "completed" as const,
      },
      {
        projectId: project.id,
        name: "Sprint 2",
        goal: "Ship the first end-to-end teacher view for early adopters",
        startDate: addDays(monday, -14),
        endDate: addDays(monday, 13),
        // Created as planning so the seed can fill it freely; activated below once it is populated.
        status: "planning" as const,
      },
      {
        projectId: project.id,
        name: "Sprint 3",
        goal: "Open the guardian portal pilot",
        startDate: addDays(monday, 14),
        endDate: addDays(monday, 27),
        status: "planning" as const,
      },
    ])
    .returning();
  if (!completedSprint || !activeSprint) throw new Error("Sprint insert failed");
  const planningSprint = (
    await db.select().from(sprints).where(eq(sprints.name, "Sprint 3")).limit(1)
  )[0];

  const pmActor: Actor = { id: pm.id, role: "pm", fullName: pm.fullName };
  const tagRows = [];
  for (const [name, color] of [
    ["pilot", "#2563EB"],
    ["compliance", "#B45309"],
    ["quick-win", "#15803D"],
  ] as const) {
    tagRows.push(await createTag(name, color));
  }

  // Default checklists and three releases (v1.0 is the MVP).
  const DOR = [
    "Persona and value stated",
    "Acceptance criteria in Given/When/Then",
    "Wireframes attached",
    "Dependencies resolved",
    "Right-sized for one sprint",
  ];
  const DOD = [
    "Code peer-reviewed",
    "Automated tests passing in CI",
    "No high-priority defects",
    "Accessibility checked against WCAG",
    "Documentation updated",
    "Validated in staging by the product owner",
  ];
  for (const label of DOR) await gov.createTemplate(project.id, { kind: "ready", label });
  for (const label of DOD) await gov.createTemplate(project.id, { kind: "done", label });
  const releaseRows = [
    await gov.createRelease(project.id, {
      name: "v1.0 MVP",
      isMvp: true,
      targetDate: addDays(today, 12),
    }),
    await gov.createRelease(project.id, {
      name: "v1.1",
      isMvp: false,
      targetDate: addDays(today, 40),
    }),
    await gov.createRelease(project.id, {
      name: "v1.2",
      isMvp: false,
      targetDate: addDays(today, 75),
    }),
  ];
  const doneTemplates = await gov.getActivityChecklistTemplates(project.id);
  const seeded: Array<{ id: string; sprintId: string | null; status: ActivityStatus }> = [];

  // Deterministic spread so reruns look the same.
  const dueFor = (i: number): string | null => {
    switch (i % 8) {
      case 0:
        return addDays(today, -4); // overdue
      case 1:
      case 2:
        return addDays(monday, 1 + (i % 5)); // this week
      case 3:
      case 4:
        return addDays(monday, 8 + (i % 5)); // next week
      case 5:
        return addDays(monday, 14 + (i % 10)); // later (month or beyond)
      case 6:
        return addDays(today, 3 + (i % 20));
      default:
        return null; // no due date
    }
  };

  let index = 0;
  for (const [subIdx, sub] of subs.entries()) {
    for (const [titleIdx, title] of (TITLES[subIdx] ?? []).entries()) {
      const i = index;
      index += 1;
      const assignee = members[(i + (i % 3 === 0 ? 1 : 0)) % members.length] ?? null;
      const roll = i % 10;
      const finalStatus: ActivityStatus =
        roll < 3 ? "todo" : roll < 6 ? "in_progress" : roll < 8 ? "in_review" : "done";
      const sprintId =
        i % 5 === 4
          ? (planningSprint?.id ?? null)
          : i % 5 === 3
            ? null
            : i < 8
              ? completedSprint.id
              : activeSprint.id;
      const createdAt = addDays(today, -20 + (i % 10));

      const created = await activityService.create(
        { actor: pmActor, now: at(createdAt) },
        project.id,
        {
          subprojectId: sub.id,
          sprintId,
          assigneeId: assignee?.id ?? null,
          title,
          description: `${title}. Part of ${sub.name}.`,
          status: "todo",
          priority: PRIORITIES[i % PRIORITIES.length] ?? "medium",
          workType: WORK_TYPES[(i + titleIdx) % WORK_TYPES.length] ?? "feature",
          track: TRACKS[titleIdx % TRACKS.length] ?? "delivery",
          percentComplete: 0,
          dueDate: dueFor(i),
          releaseId: i % 4 === 3 ? null : (releaseRows[i % 3]?.id ?? null),
          tagIds:
            i % 6 === 0 && tagRows[0]
              ? [tagRows[0].id]
              : i % 9 === 0 && tagRows[1]
                ? [tagRows[1].id]
                : [],
        },
      );
      const id = created.activity.id;
      const progressAt = addDays(createdAt, 2);
      if (finalStatus !== "todo") {
        await activityService.update({ actor: pmActor, now: at(progressAt) }, id, {
          status: "in_progress",
          percentComplete: 30,
        });
      }
      if (finalStatus === "in_review") {
        await activityService.update({ actor: pmActor, now: at(addDays(progressAt, 3)) }, id, {
          status: "in_review",
          percentComplete: 80,
        });
        // Some items in review have only part of the Definition of Done ticked.
        for (const tpl of doneTemplates.slice(0, i % (doneTemplates.length - 1))) {
          await gov.setChecklistCheck(pmActor, id, tpl.id, true);
        }
      }
      if (finalStatus === "done") {
        // The Definition of Done gate needs every item ticked before an activity can be done.
        for (const tpl of doneTemplates) await gov.setChecklistCheck(pmActor, id, tpl.id, true);
        // Alternate between completed this week (shows on Home) and completed earlier.
        const completedOn = i % 2 === 0 ? addDays(monday, i % 3) : addDays(progressAt, 4);
        const doneDate = completedOn > today ? today : completedOn;
        // Seeded finished work counts as PM approved.
        await db.update(activities).set({ pmApproval: "APPROVED" }).where(eq(activities.id, id));
        await activityService.update({ actor: pmActor, now: at(doneDate, 6) }, id, {
          status: "done",
          percentComplete: 100,
        });
      }
      // A few blocked items, with a block and (sometimes) an unblock in the history.
      if (finalStatus === "in_progress" && i % 7 === 0) {
        await activityService.update({ actor: pmActor, now: at(addDays(today, -2)) }, id, {
          isBlocked: true,
          blockedReason: "Waiting on another team",
        });
      }
      if (i % 4 === 1 && assignee) {
        await addComment(id, assignee.id, "Picked this up, will post progress here.");
      }
      seeded.push({ id, sprintId, status: finalStatus });
    }
  }

  // One heavily loaded person: four more in-progress items for the first member.
  const overloaded = members[0];
  if (overloaded) {
    const extraSubs = subs.slice(0, 4);
    for (const [n, sub] of extraSubs.entries()) {
      await activityService.create({ actor: pmActor, now }, project.id, {
        subprojectId: sub.id,
        sprintId: activeSprint.id,
        assigneeId: overloaded.id,
        title: `Overload demo task ${n + 1} for ${sub.code}`,
        status: "in_progress",
        priority: "medium",
        workType: "feature",
        track: "delivery",
        percentComplete: 20,
        dueDate: addDays(monday, 2 + n),
      });
    }
  }

  // Everything is in place: activate the sprint, then the one-in-one-out rule applies from here on.
  await updateSprint(activeSprint.id, { status: "active" });
  await gov.setSprintCapacity(
    activeSprint.id,
    members.map((m, n) => ({ userId: m.id, capacityItems: n === 0 ? 3 : 4 + (n % 3) })),
  );

  // About ten dependencies: several across subprojects, including a chain of three.
  const ids = seeded.map((s) => s.id);
  const edges: Array<[blocked: number, blocking: number]> = [
    [0, 5],
    [5, 10],
    [10, 15], // chain of three: 0 waits on 5, 5 waits on 10, 10 waits on 15
    [8, 21],
    [14, 30],
    [20, 41],
    [26, 52],
    [33, 3],
    [37, 49],
    [44, 12],
  ];
  for (const [blocked, blocking] of edges) {
    const a = ids[blocked];
    const b = ids[blocking];
    if (a && b) await gov.addDependency(pmActor, a, b);
  }

  // Two traded scope changes and one PM override on the now-active sprint.
  const inSprint = seeded.filter((s) => s.sprintId === activeSprint.id && s.status !== "done");
  const backlog = seeded.filter((s) => s.sprintId === null && s.status !== "done");
  for (const n of [0, 1]) {
    const add = backlog[n];
    const remove = inSprint[n + 3];
    if (add && remove) {
      await activityService.update({ actor: pmActor }, add.id, {
        sprintId: activeSprint.id,
        removeActivityId: remove.id,
        tradeReason: n === 0 ? "Pilot school escalation" : "Regulatory deadline moved up",
      });
    }
  }
  const forced = backlog[2];
  if (forced) {
    await activityService.update({ actor: pmActor }, forced.id, {
      sprintId: activeSprint.id,
      overrideReason: "Sponsor asked for this in the current sprint",
    });
  }

  // Discovery modules: OST, story map, Kano requests, RAID log.
  const mvp = releaseRows[0];
  const later = releaseRows[1];
  if (mvp && later && planningSprint) {
    await seedModules({
      projectId: project.id,
      pmId: pm.id,
      memberIds: members.map((x) => x.id),
      subprojectIds: subs.map((s) => s.id),
      mvpReleaseId: mvp.id,
      laterReleaseId: later.id,
      planningSprintId: planningSprint.id,
      activeSprintId: activeSprint.id,
      seededActivityIds: seeded.map((s) => s.id),
      today,
    });
  }

  const total = index + 4;
  logger.info(
    { users: memberCount + 1, subprojects: subs.length, activities: total },
    "seed complete",
  );
  return { projectId: project.id };
}

async function main(): Promise<void> {
  if (env.NODE_ENV === "production") throw new Error("Refusing to seed in production");
  const pmPassword = process.env.SEED_PM_PASSWORD;
  const memberPassword = process.env.SEED_MEMBER_PASSWORD;
  if (!pmPassword || !memberPassword) {
    throw new Error("Set SEED_PM_PASSWORD and SEED_MEMBER_PASSWORD in .env before seeding");
  }
  const memberCount = process.env.SEED_MEMBER_COUNT ? Number(process.env.SEED_MEMBER_COUNT) : 6;
  if (process.env.SEED_RESET === "1") {
    // Explicit opt-in: wipes every application table before reseeding (local development only).
    await db.execute(sql`TRUNCATE TABLE users, projects, tags CASCADE`);
    logger.warn("all application tables truncated (SEED_RESET=1)");
  }
  await seedDatabase({ pmPassword, memberPassword, memberCount });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .catch((err: unknown) => {
      logger.error({ err }, "seed failed");
      process.exitCode = 1;
    })
    .finally(() => {
      void pool.end();
    });
}
