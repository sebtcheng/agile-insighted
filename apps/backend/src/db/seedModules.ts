import { eq } from "drizzle-orm";
import { addDays } from "../services/dateBuckets";
import * as m from "../services/moduleService";
import { activities, ostSolutions, raidMitigatingActions, storyActionSteps } from "./schema";
import { db } from "./client";

export type ModuleSeedContext = {
  projectId: string;
  pmId: string;
  memberIds: string[];
  subprojectIds: string[]; // PRJ-01 .. PRJ-15 in order
  mvpReleaseId: string;
  laterReleaseId: string;
  planningSprintId: string;
  activeSprintId: string;
  seededActivityIds: string[];
  today: string;
};

/** Seeds the four discovery modules through the normal transaction paths (nextSeq, roll-up). Domain-realistic, spread over the 15 subprojects. */
export async function seedModules(c: ModuleSeedContext): Promise<void> {
  const k = { projectId: c.projectId, createdById: c.pmId };
  const member = (i: number) => c.memberIds[i % c.memberIds.length] ?? null;

  // ---------------------------------------------------------------- Opportunity Solution Tree
  const OST = [
    [
      "Reduce course dropouts in first 4 weeks by 20%",
      "Weekly dropout rate",
      "14",
      "11.2",
      "Students feel overwhelmed by multi-portal navigation",
      "Unified onboarding checklist with real-time milestone telemetry",
      "Students who finish a week-one checklist stay enrolled at a higher rate",
      "desirability",
    ],
    [
      "Raise on-time assignment submission to 85%",
      "On-time submission rate",
      "68",
      "85",
      "Learners miss deadlines they never see",
      "Deadline digest in the student companion app",
      "Learners will act on a morning digest within the same day",
      "usability",
    ],
    [
      "Cut counselor triage time per at-risk student by 40%",
      "Minutes per triage",
      "25",
      "15",
      "Counselors hunt across systems to see why a student is flagged",
      "One-page student risk summary with the top three drivers",
      "The top three drivers explain most flags well enough to act on",
      "feasibility",
    ],
    [
      "Give teachers actionable feedback on 90% of formative quizzes within a day",
      "Quizzes with feedback in 24h",
      "40",
      "90",
      "Teachers cannot keep up with hand-written feedback",
      "Draft feedback from rubric and answers, teacher approves",
      "Teachers will edit rather than rewrite a generated draft",
      "viability",
    ],
    [
      "Increase guardian portal weekly active use to 50%",
      "Weekly active guardians",
      "18",
      "50",
      "Guardians only hear about problems after grades post",
      "Plain-language weekly progress note",
      "Guardians open a weekly note without a login prompt",
      "desirability",
    ],
    [
      "Make every core screen WCAG 2.2 AA conformant",
      "Screens passing AA audit",
      "35",
      "100",
      "Keyboard users cannot reach filters in data tables",
      "Keyboard-first table component with roving focus",
      "One shared table component can replace the ad hoc ones",
      "feasibility",
    ],
    [
      "Cut LMS onboarding time for a new school to under 2 days",
      "Days to onboard",
      "9",
      "2",
      "Each school needs hand-mapped course and roster data",
      "Self-service LTI registration wizard",
      "School admins can complete registration without our help",
      "usability",
    ],
    [
      "Raise lesson-plan reuse across teachers to 30%",
      "Reused lesson share",
      "9",
      "30",
      "Teachers cannot find lessons that match their class",
      "Search by competency with preview",
      "Competency tags are accurate enough to search on",
      "viability",
    ],
  ] as const;
  const solutions: Array<{ id: string }> = [];
  for (const [i, o] of OST.entries()) {
    const outcome = await m.createOutcome({
      ...k,
      title: o[0],
      targetDate: addDays(c.today, 60 + i * 7),
    });
    const opportunity = await m.createOpportunity({
      ...k,
      outcomeId: outcome.id,
      title: o[4],
      isTargeted: true,
    });
    const solution = await m.createSolution({
      ...k,
      opportunityId: opportunity.id,
      title: o[5],
      ownerId: member(i),
    });
    solutions.push(solution);
    // Vary solution states so progress is visible: validated, in progress, planned, invalidated.
    const state = (["validated", "in_progress", "planned", "invalidated"] as const)[i % 4];
    if (state && state !== "planned") {
      await db
        .update(ostSolutions)
        .set({ validationStatus: state })
        .where(eq(ostSolutions.id, solution.id));
    }
  }

  // ---------------------------------------------------------------- User Story Mapping
  const PERSONAS = [
    ["Teacher", "Plans lessons and monitors a class through the day"],
    ["Student", "Learns on a phone or school laptop, often between classes"],
    ["Guardian", "Wants to know how their child is doing without logging in daily"],
    ["School Counselor", "Triages students who may need support"],
    ["School Administrator", "Oversees a school's data, rosters and compliance"],
    ["District Executive", "Compares schools and reports to the board"],
    ["Content Author", "Builds and maintains lesson content"],
    ["LMS Administrator", "Connects the platform to the school's learning system"],
  ] as const;
  const personaIds: string[] = [];
  for (const p of PERSONAS) {
    personaIds.push(
      (
        await m.createPersona({
          ...k,
          name: p[0],
          description: p[1],
        })
      ).id,
    );
  }

  const BACKBONE = [
    ["Understand engagement", ["Open class overview", "Spot disengaged students"]],
    ["Follow a learning path", ["See next recommended lesson", "Retry a missed concept"]],
    ["Intervene early", ["Review a risk flag", "Log an intervention"]],
    ["Give feedback", ["Review draft feedback", "Release feedback to students"]],
    ["Check in on my child", ["Read the weekly note", "Message the teacher"]],
    ["Connect the LMS", ["Register the tool", "Map a course"]],
    ["Report to the board", ["Compare schools", "Export the monthly pack"]],
    ["Author a lesson", ["Start from a template", "Publish a draft"]],
  ] as const;
  const stepIds: string[] = [];
  for (const [i, b] of BACKBONE.entries()) {
    const parent = await m.createJourneyStep({ ...k, name: b[0], position: i });
    for (const [j, name] of b[1].entries()) {
      stepIds.push(
        (
          await m.createJourneyStep({
            ...k,
            parentStepId: parent.id,
            name,
            position: j,
          })
        ).id,
      );
    }
  }

  const STORIES = [
    [
      "As a teacher, I want to view a real-time engagement indicator for my class so that I can identify disengaged students during lectures",
      "Given a live class, When I open the overview, Then I see an engagement indicator per student updated within 30 seconds",
      5,
      "mvp",
      "planning",
    ],
    [
      "As a student, I want a checklist of my first-week tasks so that I know what to do next",
      "Given I am newly enrolled, When I open the app, Then I see my week-one checklist with progress",
      3,
      "mvp",
      "backlog",
    ],
    [
      "As a school counselor, I want a one-page risk summary so that I can decide whether to intervene without opening five tools",
      "Given a flagged student, When I open the summary, Then I see the top three drivers and recent activity",
      8,
      "mvp",
      "backlog",
    ],
    [
      "As a teacher, I want to approve generated feedback before it is sent so that students only receive feedback I trust",
      "Given a draft, When I approve it, Then the student sees it; When I reject it, Then nothing is sent",
      5,
      "later",
      "backlog",
    ],
    [
      "As a guardian, I want a plain-language weekly note so that I understand my child's progress",
      "Given a week of activity, When the note is generated, Then it avoids jargon and links to detail",
      3,
      "later",
      "backlog",
    ],
    [
      "As a school administrator, I want to register our LMS without help so that onboarding takes days, not weeks",
      "Given LTI credentials, When I complete the wizard, Then a test launch succeeds",
      13,
      "mvp",
      "planning",
    ],
    [
      "As a keyboard user, I want to move through table filters with the arrow keys so that I can use every screen without a mouse",
      "Given a data table, When I press Tab then arrows, Then focus moves predictably and is announced",
      5,
      "mvp",
      "backlog",
    ],
    [
      "As a district executive, I want to compare schools on one chart so that I can spot outliers quickly",
      "Given selected schools, When I open the comparison, Then I see the same metric side by side",
      8,
      "later",
      "backlog",
    ],
    [
      "As a content author, I want to save a lesson as a draft so that I do not lose work in progress",
      "Given an edited lesson, When I leave the page, Then a draft is kept and restorable",
      2,
      "mvp",
      "in_progress",
    ],
    [
      "As a student, I want a deadline digest each morning so that I do not miss submissions",
      "Given due work, When it is 7am, Then I receive one digest listing what is due",
      3,
      "later",
      "backlog",
    ],
    [
      "As a teacher, I want to filter students by risk level so that I can focus my attention",
      "Given a class list, When I filter by high risk, Then only those students show",
      3,
      "mvp",
      "backlog",
    ],
    [
      "As a counselor, I want to log an intervention in two taps so that records stay current",
      "Given a student, When I choose an intervention type, Then it is saved with a timestamp",
      2,
      "later",
      "completed",
    ],
  ] as const;
  const storyIds: string[] = [];
  for (const [i, s] of STORIES.entries()) {
    const story = await m.createStory({
      ...k,
      responsibleId: member(i),
      targetDate: addDays(c.today, 14 + i * 7),
      personaId: personaIds[i % personaIds.length] ?? null,
      journeyStepId: stepIds[(i * 2) % Math.max(stepIds.length, 1)] ?? null,
      story: s[0],
      acceptanceCriteria: s[1],
      storyPoints: s[2],
      releaseId: s[3] === "mvp" ? c.mvpReleaseId : c.laterReleaseId,
      sprintId: i === 0 || i === 5 ? c.planningSprintId : null,
      status: s[4],
      position: i,
    });
    storyIds.push(story.id);
  }

  // Action steps: who does what by when. Completed stories have every step done (the 100% rule).
  const STEP_LABELS = [
    "Confirm acceptance criteria",
    "Build and unit test",
    "Demo to the product owner",
  ];
  for (const [i, storyId] of storyIds.entries()) {
    const done = STORIES[i]?.[4] === "completed" ? STEP_LABELS.length : i % STEP_LABELS.length;
    await db.insert(storyActionSteps).values(
      STEP_LABELS.map((label, j) => ({
        storyId,
        label,
        isCompleted: j < done,
        completedAt: j < done ? new Date() : null,
        responsibleId: member(i + j),
        targetDate: addDays(c.today, 7 + i * 7 + j * 2),
        sortOrder: j,
      })),
    );
  }

  // ---------------------------------------------------------------- Kano Request Tracker
  const KANO = [
    [
      "Export engagement data to CSV with student anonymization",
      "Maria Lopez",
      "District Data Officer",
      "must_be",
      "approve_mvp",
    ],
    [
      "Dark mode for the student app",
      "Jun Ocampo",
      "Student council",
      "attractive",
      "schedule_release",
    ],
    [
      "Bulk upload of student rosters from Excel",
      "Teresa Villanueva",
      "School Administrator",
      "must_be",
      "prioritize_sprint",
    ],
    [
      "Emoji reactions on teacher feedback",
      "Pia Navarro",
      "Teacher",
      "indifferent",
      "deprioritize",
    ],
    [
      "Parent notifications in Filipino and English",
      "Ramon Dela Cruz",
      "Guardian",
      "performance",
      "approve_mvp",
    ],
    [
      "Offline mode for the mobile companion",
      "Aileen Bautista",
      "Student",
      "performance",
      "research_spike",
    ],
    [
      "Gamified badges for completing modules",
      "Leo Garcia",
      "Teacher",
      "attractive",
      "schedule_release",
    ],
    [
      "Automatic rostering from the SIS",
      "Dennis Cruz",
      "LMS Administrator",
      "must_be",
      "approve_mvp",
    ],
    ["Hide the risk score from guardians", "Corazon Reyes", "Counselor", "reverse", "deprioritize"],
    ["Voice notes on student records", "Edgar Santos", "Counselor", null, null],
    ["Printable class engagement report", "Nina Flores", "Teacher", null, null],
    [
      "Single sign-on with the school's identity provider",
      "Ricardo Tan",
      "School Administrator",
      "must_be",
      "prioritize_sprint",
    ],
  ] as const;
  for (const q of KANO) {
    await m.createKanoRequest({
      ...k,
      revisionRequest: q[0],
      kanoCategory: q[3] ?? undefined,
    });
  }

  // ---------------------------------------------------------------- RAID Log
  const RAID = [
    [
      "risk",
      "Student privacy concerns regarding continuous telemetry tracking",
      3,
      2,
      "mitigated",
      "Aggregate by class by default; opt-in for per-student view; legal review done",
    ],
    [
      "risk",
      "Vendor LMS sandbox access arrives after the integration deadline",
      2,
      3,
      "open",
      "Escalate through the account manager; build against a recorded stub",
    ],
    [
      "issue",
      "Roster imports fail for names with special characters",
      2,
      null,
      "in_progress",
      "Normalize to UTF-8 at the boundary; add regression tests",
    ],
    [
      "assumption",
      "Every pilot school has at least one tablet per classroom",
      2,
      2,
      "open",
      "Confirm with the five pilot schools this month",
    ],
    [
      "dependency",
      "Notifications depend on the identity provider decision",
      3,
      3,
      "open",
      "Decision owner named; weekly check until resolved",
    ],
    [
      "risk",
      "Key engineer leaves before the mobile release",
      3,
      1,
      "open",
      "Document the release process; pair on signing",
    ],
    [
      "issue",
      "Accessibility audit found 14 failing screens",
      2,
      null,
      "in_progress",
      "Fix by priority; retest in two weeks",
    ],
    [
      "risk",
      "Data lake costs exceed budget at full district load",
      2,
      2,
      "open",
      "Set cost alerts; evaluate tiered storage",
    ],
    [
      "assumption",
      "Teachers will edit generated feedback instead of rewriting it",
      1,
      2,
      "closed",
      "Validated in the pilot; closing",
    ],
    [
      "dependency",
      "Executive reporting needs finance data feed",
      2,
      2,
      "mitigated",
      "Feed agreed; first export scheduled",
    ],
    [
      "risk",
      "Low guardian adoption of the portal",
      1,
      3,
      "open",
      "Run an awareness campaign with the pilot schools",
    ],
    [
      "issue",
      "Editor loses work on flaky school Wi-Fi",
      3,
      null,
      "open",
      "Local draft saving; reproduce on throttled network",
    ],
  ] as const;
  for (const [i, r] of RAID.entries()) {
    const item = await m.createRaidItem({
      ...k,
      itemType: r[0],
      description: r[1],
      impact: r[2],
      likelihood: r[3],
      status: r[4],
      ownerId: member(i),
      targetDate: r[4] === "closed" ? null : addDays(c.today, 7 + i * 6),
    });
    if (r[5]) {
      const done = r[4] === "mitigated" || r[4] === "closed";
      await db.insert(raidMitigatingActions).values({
        raidItemId: item.id,
        description: r[5],
        isCompleted: done,
        completedAt: done ? new Date() : null,
      });
    }
  }

  // ---------------------------------------------------------------- Link a few activities to stories
  const linkIds = c.seededActivityIds.slice(0, 6);
  for (const [i, activityId] of linkIds.slice(0, 3).entries()) {
    const storyId = storyIds[i];
    if (storyId)
      await db
        .update(activities)
        .set({ userStoryId: storyId })
        .where(eq(activities.id, activityId));
  }
}
