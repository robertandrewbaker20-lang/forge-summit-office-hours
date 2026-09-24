"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CURTAIN, SUMMIT_LOCKUP, logoFor } from "@/lib/logos";
import { VENUE_ROOM } from "@/lib/venue";
import type {
  Availability,
  AvailabilityAgency,
  BookSlotResult,
  HostType,
} from "@/lib/types";

type View = "groups" | "list" | "host" | "done";

const FAIL: Record<string, string> = {
  TAKEN: "Someone just took that time. Pick another.",
  LIMIT:
    "You already hold the maximum number of meetings. Leave some room for other attendees.",
  CLOSED: "Booking has closed. Try a walk-up at the table.",
  INVALID: "Check your name and email, then try again.",
  INACTIVE: "That host is not taking bookings right now. Pick another.",
  PAST: "That time has already started. Pick another.",
  RATE: "Too many tries from this device. Wait a minute and try again.",
};

const CONF_KEY = "oh-confirmation";

export function BookingApp({ embed = false }: { embed?: boolean } = { embed: false }) {
  const [data, setData] = useState<Availability | null>(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("groups");
  const [group, setGroup] = useState<HostType | null>(null);
  const [hostName, setHostName] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [slotTime, setSlotTime] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<BookSlotResult, { ok: true }> | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    org: "",
    topic: "",
  });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CONF_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as BookSlotResult;
      if (saved && saved.ok) {
        setResult(saved);
        setView("done");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/getAvailability", { cache: "no-store" });
      if (!res.ok) throw new Error("bad status");
      const next = (await res.json()) as Availability;
      setData(next);
      setActiveDay((current) => current || next.days[0] || null);
    } catch {
      setLoadError(
        "Could not load availability. Try again, or ask at the registration desk.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onVis() {
      if (!document.hidden && !slotId && view !== "done") void load();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load, slotId, view]);

  const hostsIn = useCallback(
    (type: HostType) => (data?.agencies || []).filter((a) => a.type === type),
    [data],
  );
  const openIn = useCallback(
    (type: HostType) => hostsIn(type).reduce((n, a) => n + a.open, 0),
    [hostsIn],
  );
  const current = useMemo(
    () => data?.agencies.find((a) => a.name === hostName) || null,
    [data, hostName],
  );

  function goGroups() {
    setGroup(null);
    setHostName(null);
    setSlotId(null);
    setView("groups");
    window.scrollTo(0, 0);
  }

  function pickGroup(type: HostType) {
    setGroup(type);
    setHostName(null);
    setSlotId(null);
    setView("list");
    window.scrollTo(0, 0);
  }

  function pickHost(name: string | null) {
    setHostName(name);
    setSlotId(null);
    setView(name ? "host" : "list");
    window.scrollTo(0, 0);
  }

  function pickSlot(slot: { id: string; time: string; day: string }) {
    setSlotId((current) => (current === slot.id ? null : slot.id));
    setSlotTime(slot.time);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!slotId || !slotTime) return;
    const name = form.name.trim();
    const email = form.email.trim();
    if (!name) {
      setError("Add your name so they know who to expect.");
      return;
    }
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) {
      setError("That email does not look right. Your confirmation goes there.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/bookSlot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId,
          name,
          email,
          org: form.org.trim(),
          topic: form.topic.trim(),
        }),
      });
      const payload = (await res.json()) as BookSlotResult;
      if (payload.ok) {
        setResult(payload);
        setView("done");
        try {
          sessionStorage.setItem(CONF_KEY, JSON.stringify(payload));
        } catch {
          /* ignore */
        }
        window.scrollTo(0, 0);
        return;
      }
      setError(FAIL[payload.code] || "Something went wrong. Try again.");
      if (payload.code === "TAKEN") {
        setSlotId(null);
        void load();
      }
    } catch {
      setError("Lost the connection. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setView("groups");
    setGroup(null);
    setHostName(null);
    setSlotId(null);
    setResult(null);
    setForm({ name: "", email: "", org: "", topic: "" });
    setData(null);
    try {
      sessionStorage.removeItem(CONF_KEY);
    } catch {
      /* ignore */
    }
    await load();
  }

  if (loadError) {
    return <p className="msg">{loadError}</p>;
  }
  if (!data) {
    return <p className="msg">Loading availability…</p>;
  }

  const body = (
      <div className="body">
        {!data.open && view !== "done" ? (
          <div className="msg" style={{ padding: 0 }}>
            Booking is closed. Open times are still available as walk-ups at each
            table in {data.event.room || VENUE_ROOM}. Each group has a table
            sign.
          </div>
        ) : view === "done" && result ? (
          <Done result={result} onAgain={() => void reset()} />
        ) : view === "host" && current ? (
          <HostScreen
            agency={current}
            days={data.days}
            activeDay={activeDay}
            slotId={slotId}
            slotTime={slotTime}
            form={form}
            error={error}
            busy={busy}
            onBack={() => pickHost(null)}
            onDay={(d) => {
              setActiveDay(d);
              setSlotId(null);
            }}
            onSlot={pickSlot}
            onForm={setForm}
            onSubmit={submit}
          />
        ) : view === "list" && group ? (
          <ListScreen
            type={group}
            hosts={hostsIn(group)}
            onBack={goGroups}
            onHost={pickHost}
          />
        ) : (
          <GroupsScreen
            room={data.event.room}
            cohortCount={hostsIn("Cohort").length}
            partnerOpen={openIn("Partner")}
            cohortOpen={openIn("Cohort")}
            cohortHosts={hostsIn("Cohort")}
            partnerHosts={hostsIn("Partner")}
            onGroup={pickGroup}
          />
        )}
      </div>
  );

  if (embed) {
    return (
      <>
        <Masthead event={data.event} compact />
        {body}
      </>
    );
  }

  return (
    <div className="wrap">
      <Masthead event={data.event} />
      {body}
    </div>
  );
}

function Masthead({
  event,
  compact = false,
}: {
  event: Availability["event"];
  compact?: boolean;
}) {
  return (
    <div
      className="mast"
      style={{ backgroundImage: `url(${CURTAIN})` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="lockup"
        src={event.logo || SUMMIT_LOCKUP}
        alt="Forge Summit 2026"
      />
      {compact ? (
        <p className="mast-title" style={{ fontSize: "1.35rem", fontWeight: 700, margin: "0.5rem 0 0" }}>
          Book a meeting
        </p>
      ) : (
        <h1>Office hours</h1>
      )}
      <p>{event.location || event.name}</p>
    </div>
  );
}

function VenueNote({ room }: { room?: string }) {
  const hall = room || VENUE_ROOM;
  return (
    <p className="venue">
      Meetings are in <strong>{hall}</strong>. Each group has a table sign.
    </p>
  );
}

function GroupsScreen({
  room,
  cohortCount,
  partnerOpen,
  cohortOpen,
  cohortHosts,
  partnerHosts,
  onGroup,
}: {
  room: string;
  cohortCount: number;
  partnerOpen: number;
  cohortOpen: number;
  cohortHosts: AvailabilityAgency[];
  partnerHosts: AvailabilityAgency[];
  onGroup: (type: HostType) => void;
}) {
  return (
    <>
      <p className="lede">
        Book thirty minutes with a Phoenix 2026 startup or a partner agency.
        Choose who you want to meet, then pick a time.
      </p>
      <VenueNote room={room} />
      {cohortHosts.length > 0 && (
        <GroupTile
          type="Cohort"
          title="Startups"
          sub={`${cohortCount} defense technology companies. Sit down with a founder.`}
          open={cohortOpen}
          onPick={onGroup}
        />
      )}
      {partnerHosts.length > 0 && (
        <GroupTile
          type="Partner"
          title="Support agencies"
          sub="SBA, ASBTDC, AEDC — funding, certification, contracting and site selection."
          open={partnerOpen}
          onPick={onGroup}
        />
      )}
    </>
  );
}

function GroupTile({
  type,
  title,
  sub,
  open,
  onPick,
}: {
  type: HostType;
  title: string;
  sub: string;
  open: number;
  onPick: (type: HostType) => void;
}) {
  return (
    <button
      className={`group${type === "Cohort" ? " cohort" : ""}`}
      disabled={!open}
      onClick={() => onPick(type)}
    >
      <span className="group-top">
        <span className="group-name">{title}</span>
        <span className="group-n">
          {open || "0"}
          <small>{open === 1 ? "time open" : "times open"}</small>
        </span>
      </span>
      <span className="group-sub">{sub}</span>
    </button>
  );
}

function ListScreen({
  type,
  hosts,
  onBack,
  onHost,
}: {
  type: HostType;
  hosts: AvailabilityAgency[];
  onBack: () => void;
  onHost: (name: string) => void;
}) {
  const isCohort = type === "Cohort";
  return (
    <>
      <button className="back" onClick={onBack}>
        Back
      </button>
      <h2>{isCohort ? "Startups" : "Support agencies"}</h2>
      <p className="h2-sub">The number on the right is how many times are still open.</p>
      <VenueNote />
      {hosts.map((a) => {
        const mark = a.logo || logoFor(a.name);
        return (
          <button
            key={a.name}
            className={`row${isCohort ? " cohort" : ""}`}
            disabled={!a.open}
            onClick={() => onHost(a.name)}
          >
            {mark ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mark} alt={a.name} />
            ) : null}
            <span className="row-text">
              <span className="row-name">{a.name}</span>
              {a.location ? <span className="row-where">{a.location}</span> : null}
            </span>
            <span className={`row-n${a.open ? "" : " zero"}`}>
              {a.open || "Full"}
            </span>
          </button>
        );
      })}
    </>
  );
}

function HostScreen({
  agency,
  days,
  activeDay,
  slotId,
  slotTime,
  form,
  error,
  busy,
  onBack,
  onDay,
  onSlot,
  onForm,
  onSubmit,
}: {
  agency: AvailabilityAgency;
  days: string[];
  activeDay: string | null;
  slotId: string | null;
  slotTime: string | null;
  form: { name: string; email: string; org: string; topic: string };
  error: string;
  busy: boolean;
  onBack: () => void;
  onDay: (day: string) => void;
  onSlot: (slot: { id: string; time: string; day: string }) => void;
  onForm: (next: { name: string; email: string; org: string; topic: string }) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const isCohort = agency.type === "Cohort";
  const mark = agency.logo || logoFor(agency.name);
  const slots = agency.slots.filter((s) => !activeDay || s.day === activeDay);
  const anyOpen = slots.some((s) => s.open);

  return (
    <>
      <button className="back" onClick={onBack}>
        Back to {isCohort ? "startups" : "support agencies"}
      </button>
      <div className={`detail${isCohort ? " cohort" : ""}`}>
        <div className="d-head">
          {mark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mark} alt={agency.name} />
          ) : null}
          <div>
            <h2>{agency.name}</h2>
            {agency.location ? <span className="where">{agency.location}</span> : null}
          </div>
        </div>
        {agency.blurb ? <p className="summary">{agency.blurb}</p> : null}
        {((agency.website && agency.website.trim()) || (agency.rep && agency.rep.trim() && agency.rep.trim().toUpperCase() !== "TBC")) && (
          <dl className="meta">
            {agency.website && agency.website.trim() ? (
              <>
                <dt>Website</dt>
                <dd>
                  <a
                    href={`https://${agency.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {agency.website}
                  </a>
                </dd>
              </>
            ) : null}
            {agency.rep && agency.rep.trim() && agency.rep.trim().toUpperCase() !== "TBC" ? (
              <>
                <dt>You will meet</dt>
                <dd>{agency.rep}</dd>
              </>
            ) : null}
          </dl>
        )}
      </div>

      <VenueNote />
      <h3>Available times</h3>
      {days.length > 1 && (
        <div className="days">
          {days.map((d) => (
            <button
              key={d}
              className="day"
              aria-pressed={d === activeDay}
              onClick={() => onDay(d)}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {!anyOpen ? (
        <p className="note">
          Nothing open on this day. Try the other day, or stop by the table for a
          walk-up.
        </p>
      ) : (
        <>
          <div className="slots">
            {slots.map((s) => (
              <button
                key={s.id}
                className="slot"
                disabled={!s.open}
                aria-pressed={slotId === s.id}
                onClick={() => onSlot(s)}
              >
                {s.time}
              </button>
            ))}
          </div>
          {slotId ? (
            <form className="form" id="form" onSubmit={onSubmit}>
              <label htmlFor="f-name">Your name</label>
              <input
                id="f-name"
                autoComplete="name"
                maxLength={80}
                value={form.name}
                onChange={(e) => onForm({ ...form, name: e.target.value })}
              />
              <label htmlFor="f-email">Email</label>
              <input
                id="f-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                spellCheck={false}
                value={form.email}
                onChange={(e) => onForm({ ...form, email: e.target.value })}
              />
              <label htmlFor="f-org">Organization</label>
              <input
                id="f-org"
                autoComplete="organization"
                maxLength={100}
                value={form.org}
                onChange={(e) => onForm({ ...form, org: e.target.value })}
              />
              <label htmlFor="f-topic">
                What do you want to talk about?{" "}
                <span className="optional">
                  Optional, but it helps them prepare.
                </span>
              </label>
              <textarea
                id="f-topic"
                maxLength={500}
                value={form.topic}
                onChange={(e) => onForm({ ...form, topic: e.target.value })}
              />
              <button
                className={`book${isCohort ? " cohort" : ""}`}
                disabled={busy}
              >
                {busy ? "Booking…" : `Book ${slotTime}`}
              </button>
              {error ? <div className="err">{error}</div> : null}
            </form>
          ) : (
            <p className="note">Struck-through times are already taken.</p>
          )}
        </>
      )}
    </>
  );
}

function Done({
  result,
  onAgain,
}: {
  result: Extract<BookSlotResult, { ok: true }>;
  onAgain: () => void;
}) {
  return (
    <div className="done">
      <h2>You are booked.</h2>
      <dl>
        <dt>Who</dt>
        <dd>{result.agency}</dd>
        <dt>When</dt>
        <dd>
          {result.day}, {result.time}
        </dd>
        <dt>Where</dt>
        <dd>
          {result.room || VENUE_ROOM}
          <span className="where-extra">Each group has a table sign.</span>
        </dd>
        <dt>Code</dt>
        <dd className="code">{result.confirmation}</dd>
      </dl>
      <p className="venue">
        Meetings are in <strong>{result.room || VENUE_ROOM}</strong>. Look for
        this group&apos;s table sign.
      </p>
      <p>
        Arrive a couple of minutes early and give your name at the table. If you
        can no longer make it, tell the host so the slot can go to someone else.
      </p>
      <p className="mail-note">
        If email is configured for this event, a confirmation will also be sent
        to the address you provided. Keep your code above either way.
      </p>
      <button className="again" onClick={onAgain}>
        Book another meeting
      </button>
    </div>
  );
}
