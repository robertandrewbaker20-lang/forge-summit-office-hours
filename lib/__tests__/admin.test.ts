import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkPassword, createSessionToken, verifySessionToken } from "../adminSession";
import { normalizeAgencyInput, ValidationError } from "../agencies";
import { parseEmailList } from "../emails";
import { sendBookingEmails, type SendFn } from "../mail";
import { chicagoWallTimeToDate, timeLabel } from "../time";

const PW = "correct-horse-battery-staple";

describe("admin session", () => {
  it("accepts a fresh token and rejects tampered / expired / other-password tokens", () => {
    const now = 1_790_000_000_000;
    const token = createSessionToken(now, PW);
    assert.equal(verifySessionToken(token, now + 1000, PW), true);
    assert.equal(verifySessionToken(token + "x", now + 1000, PW), false);
    assert.equal(verifySessionToken(token, now + 8 * 24 * 3600 * 1000, PW), false);
    assert.equal(verifySessionToken(token, now + 1000, PW + "2"), false);
    assert.equal(verifySessionToken("", now, PW), false);
    const [, mac] = token.split(".");
    assert.equal(verifySessionToken(`${now + 999_999_999}.${mac}`, now, PW), false);
  });
  it("checks passwords and refuses short configured passwords", () => {
    assert.equal(checkPassword(PW, PW), true);
    assert.equal(checkPassword("nope", PW), false);
    assert.equal(checkPassword("short", "short"), false);
  });
});

describe("email lists", () => {
  it("parses commas, semicolons and new lines; dedupes; flags invalid", () => {
    const r = parseEmailList("A@x.gov, b@y.org;\nA@x.gov  bad@ c@sub.agency.gov");
    assert.deepEqual(r.emails, ["a@x.gov", "b@y.org", "c@sub.agency.gov"]);
    assert.deepEqual(r.invalid, ["bad@"]);
  });
});

describe("agency validation", () => {
  it("normalizes and rejects bad input", () => {
    const ok = normalizeAgencyInput({ name: "  New  Agency ", type: "Partner", notifyEmails: "x@y.gov\nz@y.gov", website: "https://y.gov/", active: "on" });
    assert.equal(ok.name, "New Agency");
    assert.equal(ok.notifyEmails, "x@y.gov, z@y.gov");
    assert.equal(ok.website, "y.gov");
    assert.equal(ok.active, true);
    assert.throws(() => normalizeAgencyInput({ name: "", type: "Partner" }), ValidationError);
    assert.throws(() => normalizeAgencyInput({ name: "A", type: "Other" }), ValidationError);
    assert.throws(() => normalizeAgencyInput({ name: "A", type: "Partner", notifyEmails: "nope" }), ValidationError);
    assert.throws(() => normalizeAgencyInput({ name: "A", type: "Partner", logoUrl: "javascript:alert(1)" }), ValidationError);
  });
});

describe("America/Chicago time", () => {
  it("maps summit wall time to CDT (UTC-5) and post-DST dates to CST (UTC-6)", () => {
    assert.equal(chicagoWallTimeToDate("2026-10-13", 8 * 60).toISOString(), "2026-10-13T13:00:00.000Z");
    assert.equal(chicagoWallTimeToDate("2026-10-14", 15 * 60 + 30).toISOString(), "2026-10-14T20:30:00.000Z");
    assert.equal(chicagoWallTimeToDate("2026-11-02", 8 * 60).toISOString(), "2026-11-02T14:00:00.000Z");
    assert.equal(timeLabel(8 * 60), "8:00 AM");
    assert.equal(timeLabel(12 * 60 + 30), "12:30 PM");
  });
});

const booking = {
  name: "Test Attendee",
  email: "attendee@example.com",
  org: "Org",
  topic: "Topic",
  agency: "Test Agency",
  day: "Tuesday, Oct 13",
  time: "9:00 AM",
  room: "Ballroom C",
  confirmation: "ABC123",
};

describe("booking mail", () => {
  it("emails attendee, all host notification emails, and admin copy", async () => {
    const sent: { to: string[]; subject: string; replyTo?: string; from: string }[] = [];
    process.env.GMAIL_USER = "sender@gmail.com";
    const send: SendFn = async (m) => {
      sent.push({ to: m.to, subject: m.subject, replyTo: m.replyTo, from: m.from });
      return { id: `id-${sent.length}` };
    };
    process.env.NOTIFY_EMAIL = "admin@example.com";
    const results = await sendBookingEmails(booking, { slotId: "s1", hostEmails: ["h1@agency.gov", "h2@agency.gov"], deps: { send } });
    assert.deepEqual(results.map((r) => [r.kind, r.status]), [["attendee", "sent"], ["host", "sent"], ["admin", "sent"]]);
    assert.deepEqual(sent[1].to, ["h1@agency.gov", "h2@agency.gov"]);
    assert.equal(sent[1].replyTo, "attendee@example.com");
    assert.deepEqual(sent[2].to, ["admin@example.com"]);
    assert.equal(sent[0].from, '"Forge Summit Office Hours" <sender@gmail.com>');
  });

  it("never throws when the provider fails, and keeps sending the rest", async () => {
    let calls = 0;
    const recorded: string[] = [];
    const send: SendFn = async () => {
      calls += 1;
      if (calls === 1) throw new Error("domain not verified");
      return { id: "ok" };
    };
    const results = await sendBookingEmails(booking, {
      hostEmails: ["h@agency.gov"],
      deps: { send, record: async (_s, r) => void recorded.push(`${r.kind}:${r.status}`) },
    });
    assert.equal(results[0].status, "failed");
    assert.equal(results[1].status, "sent");
    assert.deepEqual(recorded.slice(0, 2), ["attendee:failed", "host:sent"]);
  });

  it("skips all mail (no throw) when Gmail credentials are missing", async () => {
    delete process.env.GMAIL_APP_PASSWORD;
    const results = await sendBookingEmails(booking, { hostEmails: ["h@agency.gov"] });
    assert.ok(results.length >= 2 && results.every((r) => r.status === "skipped"));
  });

  it("sends only the requested parts (attendee first, host+admin later)", async () => {
    const kinds: string[] = [];
    const send: SendFn = async (m) => (kinds.push(m.subject.split(" ")[0]), { id: "x" });
    process.env.NOTIFY_EMAIL = "admin@example.com";
    const a = await sendBookingEmails(booking, { hostEmails: ["h@agency.gov"], parts: ["attendee"], deps: { send } });
    assert.deepEqual(a.map((r) => r.kind), ["attendee"]);
    const b = await sendBookingEmails(booking, { hostEmails: ["h@agency.gov"], parts: ["host", "admin"], deps: { send } });
    assert.deepEqual(b.map((r) => r.kind), ["host", "admin"]);
  });

  it("skips host mail cleanly when the agency has no notification email", async () => {
    const results = await sendBookingEmails(booking, { hostEmails: [], deps: { send: async () => ({ id: "x" }) } });
    assert.equal(results.find((r) => r.kind === "host")?.status, "skipped");
  });
});
