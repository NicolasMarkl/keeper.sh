import { describe, expect, it } from "vitest";

import { decodeActivityCursor } from "@/utils/syncs";

describe("decodeActivityCursor", () => {
  it("keeps the timestamp's microseconds as Postgres printed them", () => {
    expect(decodeActivityCursor("2026-10-06T09:00:00.123456Z_row-1")).toEqual({
      createdAt: "2026-10-06T09:00:00.123456Z",
      id: "row-1",
    });
  });

  it("ignores cursors that aren't a UTC timestamp and an id", () => {
    expect(decodeActivityCursor(null)).toBeNull();
    expect(decodeActivityCursor("row-1")).toBeNull();
    expect(decodeActivityCursor("2026-10-06T09:00:00.123456Z_")).toBeNull();
    expect(decodeActivityCursor("yesterday_row-1")).toBeNull();
    expect(decodeActivityCursor("2026-10-06 09:00:00'; drop table syncs;--_row-1")).toBeNull();
  });
});
