import { describe, expect, it } from "vitest";
import { DEFAULT_SYNC_SETTINGS, compileSyncRules } from "@keeper.sh/data-schemas";
import {
  excludeWithdrawnInstances,
  isEventInDestinationReconciliationWindow,
  projectSyncableEvent,
  shouldExcludeSyncEvent,
} from "../../../src/core/events/events";
import { materializeRecurrenceEvents } from "../../../src/core/events/recurrence-materializer";
import type { SyncableEvent } from "../../../src/core/types";

const createEvent = (overrides: Partial<{
  excludeAllDayEvents: boolean;
  excludeFocusTime: boolean;
  excludeOutOfOffice: boolean;
  availability: string | null;
  isAllDay: boolean | null;
  sourceEventType: string | null;
}> = {}) => ({
  availability: "busy",
  excludeAllDayEvents: false,
  excludeFocusTime: false,
  excludeOutOfOffice: false,
  isAllDay: false,
  sourceEventType: "default",
  ...overrides,
});

describe("shouldExcludeSyncEvent", () => {
  it("always excludes working location events", () => {
    expect(
      shouldExcludeSyncEvent(
        createEvent({
          sourceEventType: "workingLocation",
        }),
      ),
    ).toBe(true);
  });

  it("excludes focus time events when configured", () => {
    expect(
      shouldExcludeSyncEvent(
        createEvent({
          excludeFocusTime: true,
          sourceEventType: "focusTime",
        }),
      ),
    ).toBe(true);
  });

  it("excludes out of office events when configured", () => {
    expect(
      shouldExcludeSyncEvent(
        createEvent({
          excludeOutOfOffice: true,
          sourceEventType: "outOfOffice",
        }),
      ),
    ).toBe(true);
  });

  it("excludes all-day events when configured", () => {
    expect(
      shouldExcludeSyncEvent(
        createEvent({
          excludeAllDayEvents: true,
          isAllDay: true,
        }),
      ),
    ).toBe(true);
  });

  it("keeps default events in sync", () => {
    expect(shouldExcludeSyncEvent(createEvent())).toBe(false);
  });

  it("treats legacy workingElsewhere rows as working location", () => {
    expect(
      shouldExcludeSyncEvent(
        createEvent({
          availability: "workingElsewhere",
          sourceEventType: null,
        }),
      ),
    ).toBe(true);
  });

  it("treats legacy oof rows as out of office", () => {
    expect(
      shouldExcludeSyncEvent(
        createEvent({
          availability: "oof",
          excludeOutOfOffice: true,
          sourceEventType: null,
        }),
      ),
    ).toBe(true);
  });
});

describe("isEventInDestinationReconciliationWindow", () => {
  const timeMin = new Date("2026-07-10T00:00:00.000Z");

  it("includes an event that starts before the boundary but overlaps it", () => {
    expect(isEventInDestinationReconciliationWindow({
      endTime: new Date("2026-07-10T01:00:00.000Z"),
      startTime: new Date("2026-07-09T23:00:00.000Z"),
    }, timeMin)).toBe(true);
  });

  it("includes ordinary events arbitrarily far in the future", () => {
    expect(isEventInDestinationReconciliationWindow({
      endTime: new Date("2040-03-15T10:00:00.000Z"),
      startTime: new Date("2040-03-15T09:00:00.000Z"),
    }, timeMin)).toBe(true);
  });

  it("excludes events that ended before the boundary", () => {
    expect(isEventInDestinationReconciliationWindow({
      endTime: new Date("2026-07-09T23:59:59.999Z"),
      startTime: new Date("2026-07-09T22:00:00.000Z"),
    }, timeMin)).toBe(false);
  });

  it("includes an inverted event whose start is past the boundary but whose end is not", () => {
    expect(isEventInDestinationReconciliationWindow({
      endTime: new Date("2026-01-01T00:00:00.000Z"),
      startTime: new Date("2026-08-01T00:00:00.000Z"),
    }, timeMin)).toBe(true);
  });

  it("excludes an inverted event whose start is also before the boundary", () => {
    expect(isEventInDestinationReconciliationWindow({
      endTime: new Date("2026-01-01T00:00:00.000Z"),
      startTime: new Date("2026-02-01T00:00:00.000Z"),
    }, timeMin)).toBe(false);
  });
});

describe("destination reconciliation source selection", () => {
  it("never narrows the mapped source calendars by availability", async () => {
    const source = await Bun.file(
      `${import.meta.dirname}/../../../src/core/events/events.ts`,
    ).text();

    expect(source).toContain("getMappedSourceCalendarIds");
    expect(source).not.toContain("unavailableSince");
  });
});

const busyOnly = compileSyncRules(DEFAULT_SYNC_SETTINGS).at(-1);
if (!busyOnly) {
  throw new Error("compileSyncRules always ends with Share As");
}

const createRow = (overrides: Partial<Parameters<typeof projectSyncableEvent>[0]> = {}) => ({
  availability: "busy",
  calendarName: "Work",
  description: "Agenda",
  isAllDay: false,
  location: "Room 4",
  sourceEventType: "default",
  title: "Daily Standup",
  ...overrides,
});

describe("projectSyncableEvent", () => {

  it("copies nothing when no rule is assigned to the source", () => {
    expect(projectSyncableEvent(createRow(), [])).toEqual({ outcome: "unmatched" });
  });

  it("still drops working location events before consulting rules", () => {
    expect(projectSyncableEvent(createRow({ sourceEventType: "workingLocation" }), [busyOnly]))
      .toEqual({ outcome: "working_location" });
  });

  it("reproduces the legacy default projection with the default rule", () => {
    expect(projectSyncableEvent(createRow(), [busyOnly])).toEqual({
      outcome: "copy",
      summary: "Work",
    });
  });

  it("applies the first matching rule and reports skips", () => {
    const rules = [
      { actions: [{ kind: "skip" as const }], conditions: [{ kind: "focus_time" as const }], id: "rule-skip", match: "all" as const, name: "Skip focus time" },
      {
        actions: [{ kind: "rename" as const, template: "OOO" }, { kind: "mark_private" as const }],
        conditions: [{ kind: "title_contains" as const, value: "standup" }],
        id: "rule-ooo",
        match: "all" as const,
        name: "Standup to OOO",
      },
      busyOnly,
    ];

    expect(projectSyncableEvent(createRow({ sourceEventType: "focusTime" }), rules)).toEqual({ outcome: "skipped", ruleId: "rule-skip" });
    expect(projectSyncableEvent(createRow(), rules)).toEqual({
      description: "Agenda",
      isPrivate: true,
      location: "Room 4",
      outcome: "copy",
      summary: "OOO",
    });
    expect(projectSyncableEvent(createRow({ title: "Lunch" }), rules)).toEqual({ outcome: "copy", summary: "Work" });
  });
});

describe("excludeWithdrawnInstances", () => {
  const window = { end: new Date("2026-02-01T00:00:00.000Z"), start: new Date("2026-01-01T00:00:00.000Z") };
  const master: SyncableEvent = {
    calendarId: "calendar-1",
    calendarName: "Work",
    calendarUrl: null,
    endTime: new Date("2026-01-05T10:00:00.000Z"),
    id: "master",
    recurrenceRule: { count: 4, frequency: "WEEKLY" },
    sourceEventUid: "team-sync",
    startTime: new Date("2026-01-05T09:00:00.000Z"),
    summary: "Team sync",
  };
  // The edited 12 January instance ("Team sync – HR review") was skipped by a title rule.
  const skippedEdit = { calendarId: "calendar-1", recurrenceId: new Date("2026-01-12T09:00:00.000Z"), sourceEventUid: "team-sync" };
  const starts = (events: SyncableEvent[]) =>
    materializeRecurrenceEvents(events, window).map((event) => event.startTime.toISOString());

  it("keeps the series from filling a skipped edit's slot with its original occurrence", () => {
    expect(starts([master])).toContain("2026-01-12T09:00:00.000Z");
    expect(starts(excludeWithdrawnInstances([master], [skippedEdit]))).toEqual([
      "2026-01-05T09:00:00.000Z",
      "2026-01-19T09:00:00.000Z",
      "2026-01-26T09:00:00.000Z",
    ]);
  });

  it("leaves other series and other calendars' series alone", () => {
    const otherSeries = { ...master, id: "other", sourceEventUid: "standup" };
    const otherCalendar = { ...master, calendarId: "calendar-2", id: "elsewhere" };
    const [, untouchedSeries, untouchedCalendar] = excludeWithdrawnInstances([master, otherSeries, otherCalendar], [skippedEdit]);

    expect(untouchedSeries).toBe(otherSeries);
    expect(untouchedCalendar).toBe(otherCalendar);
  });
});
