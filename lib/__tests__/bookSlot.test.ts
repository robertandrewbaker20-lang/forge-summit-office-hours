import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookSlot } from "../booking";
import type { BookSlotInput } from "../types";

type Handler = {
  settings?: { key: string; value: string }[];
  slot?: Record<string, unknown> | null;
  emailCount?: number;
  updateRowCount?: number;
};

function fakePool(h: Handler) {
  const client = {
    async query(sql: string, _params?: unknown[]) {
      const q = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (q === "begin" || q === "commit" || q === "rollback") {
        return { rows: [], rowCount: 0 };
      }
      if (q.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 };
      if (q.includes("from settings")) {
        return { rows: h.settings ?? [{ key: "Booking Open", value: "true" }, { key: "Max Bookings Per Email", value: "2" }, { key: "Room", value: "Ballroom C" }], rowCount: 3 };
      }
      if (q.includes("from slots s") && q.includes("left join agencies")) {
        return { rows: h.slot ? [h.slot] : [], rowCount: h.slot ? 1 : 0 };
      }
      if (q.includes("count(*)") && q.includes("attendee_email")) {
        return { rows: [{ n: String(h.emailCount ?? 0) }], rowCount: 1 };
      }
      if (q.startsWith("update slots") || q.includes("update slots")) {
        const count = h.updateRowCount ?? 0;
        return {
          rows:
            count > 0
              ? [
                  {
                    agency_name: "nKode",
                    day_label: "Tuesday, Oct 13",
                    time_label: "9:00 AM",
                    confirmation: "ABCDEF",
                  },
                ]
              : [],
          rowCount: count,
        };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  return {
    connect: async () => client,
  } as unknown as import("@neondatabase/serverless").Pool;
}

const baseInput: BookSlotInput = {
  slotId: "nkode-20261013-0900",
  name: "Robert Baker",
  email: "robert@example.com",
  org: "Forge",
  topic: "Intros",
};

const futureSlot = {
  id: "nkode-20261013-0900",
  status: "Open",
  start_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
  agency_id: 1,
  agency_name: "nKode",
  day_label: "Tuesday, Oct 13",
  time_label: "9:00 AM",
  agency_active: true,
};

describe("bookSlot critical paths", () => {
  it("returns TAKEN when update races (rowCount 0)", async () => {
    const result = await bookSlot(baseInput, {
      pool: fakePool({ slot: futureSlot, updateRowCount: 0 }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "TAKEN");
  });

  it("returns LIMIT when email cap reached", async () => {
    const result = await bookSlot(baseInput, {
      pool: fakePool({
        slot: futureSlot,
        emailCount: 2,
        settings: [
          { key: "Booking Open", value: "true" },
          { key: "Max Bookings Per Email", value: "2" },
          { key: "Room", value: "Ballroom C" },
        ],
      }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "LIMIT");
      assert.equal(result.limit, 2);
    }
  });

  it("returns CLOSED when booking disabled", async () => {
    const result = await bookSlot(baseInput, {
      pool: fakePool({
        settings: [
          { key: "Booking Open", value: "false" },
          { key: "Max Bookings Per Email", value: "2" },
        ],
      }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "CLOSED");
  });

  it("returns INACTIVE when host agency is inactive", async () => {
    const result = await bookSlot(baseInput, {
      pool: fakePool({
        slot: { ...futureSlot, agency_active: false },
      }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "INACTIVE");
  });

  it("returns PAST when start_at is in the past", async () => {
    const result = await bookSlot(baseInput, {
      pool: fakePool({
        slot: {
          ...futureSlot,
          start_at: new Date(Date.now() - 3600_000).toISOString(),
        },
      }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "PAST");
  });

  it("returns INVALID for bad email", async () => {
    const result = await bookSlot(
      { ...baseInput, email: "not-an-email" },
      { pool: fakePool({}) },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "INVALID");
  });
});
