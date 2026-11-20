import { describe, expect, it } from "vitest";
import {
  formatSprintLabel,
  listSprintOptions,
  manilaToday,
  resolveSprintWrite,
  resolveStoredSprint,
  sprintEndDateFor,
  sprintForDate,
  sprintFromKey,
} from "./sprint";

describe("sprint utility", () => {
  it("ends every sprint on a Sunday", () => {
    expect(sprintEndDateFor("2026-11-16")).toBe("2026-11-22"); // Monday
    expect(sprintEndDateFor("2026-11-22")).toBe("2026-11-22"); // Sunday
    expect(sprintEndDateFor("2026-11-21")).toBe("2026-11-22"); // Saturday
  });

  it("numbers sprints by Sunday-of-year and round-trips the key", () => {
    const s = sprintForDate("2026-11-20");
    expect(s).toMatchObject({
      key: "2026-S47",
      number: 47,
      endDate: "2026-11-22",
      startDate: "2026-11-16",
    });
    expect(sprintFromKey("2026-S47")?.endDate).toBe("2026-11-22");
    expect(sprintFromKey("2026-S01")?.endDate).toBe("2026-01-04");
  });

  it("handles year boundaries and monotonic numbering", () => {
    expect(sprintForDate("2026-12-28")).toMatchObject({ key: "2027-S01", endDate: "2027-01-03" });
    expect(sprintForDate("2026-12-27")).toMatchObject({ year: 2026, number: 52 });
    const opts = listSprintOptions({ today: "2026-11-20", weeksAhead: 60 });
    for (let i = 1; i < opts.length; i++) {
      expect(opts[i]!.endDate > opts[i - 1]!.endDate).toBe(true);
    }
    expect(opts.find((o) => o.endDate === "2027-01-03")?.number).toBe(1);
  });

  it("rejects keys that do not exist", () => {
    expect(sprintFromKey("2026-S00")).toBeNull();
    expect(sprintFromKey("2026-S54")).toBeNull();
    expect(sprintFromKey("bogus")).toBeNull();
  });

  it("uses Asia/Manila calendar dates", () => {
    // 17:00 UTC Sunday = 01:00 Monday in Manila.
    expect(manilaToday(new Date("2026-11-22T17:00:00Z"))).toBe("2026-11-23");
    expect(manilaToday(new Date("2026-11-22T15:59:00Z"))).toBe("2026-11-22");
    const opts = listSprintOptions({ today: manilaToday(new Date("2026-11-22T17:00:00Z")) });
    expect(opts[0]!.endDate).toBe("2026-11-29");
  });

  it("formats labels with number and Sunday end date", () => {
    expect(formatSprintLabel({ number: 47, endDate: "2026-11-22" })).toBe(
      "Sprint 47 — Ends Sun, Nov 22, 2026",
    );
  });

  it("lists current + upcoming sprints and keeps past assigned ones", () => {
    const opts = listSprintOptions({
      today: "2026-11-20",
      weeksAhead: 16,
      keep: ["2026-03-10", "2026-S47"],
    });
    expect(opts).toHaveLength(18);
    expect(opts[0]!.endDate).toBe("2026-03-15");
    expect(opts[1]!.key).toBe("2026-S47");
  });

  it("maps legacy mid-week dates to the containing sprint", () => {
    expect(resolveStoredSprint(null, "2026-11-18")?.label).toBe(
      "Sprint 47 — Ends Sun, Nov 22, 2026",
    );
    expect(resolveStoredSprint("2026-S48", "2026-11-18")?.endDate).toBe("2026-11-29");
    expect(resolveStoredSprint(null, null)).toBeNull();
  });

  it("derives the date column from the sprint on write", () => {
    expect(resolveSprintWrite({ sprintKey: "2026-S47", targetDate: "2026-01-01" })).toEqual({
      sprintKey: "2026-S47",
      targetDate: "2026-11-22",
    });
    expect(resolveSprintWrite({ sprintKey: null })).toEqual({ sprintKey: null, targetDate: null });
    expect(resolveSprintWrite({ targetDate: "2026-11-18" })).toEqual({
      sprintKey: null,
      targetDate: "2026-11-18",
    });
    expect(resolveSprintWrite({})).toBeUndefined();
    expect(resolveSprintWrite({ sprintKey: "2026-S99" })).toHaveProperty("error");
  });
});
