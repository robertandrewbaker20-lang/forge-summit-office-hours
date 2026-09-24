/**
 * Idempotent schema + seed matching the Apps Script export (Code.gs).
 * Runs in one transaction.
 * - Booked and Blocked rows are preserved.
 * - Open slots are cleared and rebuilt to the 30-minute America/Chicago grid.
 * - Agency upserts refresh blurb/type/location/website but do NOT overwrite
 *   active, rep_name, or rep_emails on existing rows (mid-event safe).
 */
import { Pool } from "@neondatabase/serverless";
import { VENUE_ROOM } from "../lib/venue";

const TZ_OFFSET = "-05:00"; // America/Chicago, CDT (Oct 2026)

type HostType = "Partner" | "Cohort";

type AgencySeed = {
  name: string;
  type: HostType;
  blurb: string;
  location: string;
  website: string;
  repName: string;
  repEmails: string;
  active: boolean;
};

const AGENCIES: AgencySeed[] = [
  {
    name: "SBA",
    type: "Partner",
    blurb: "Capital access, 8(a) and HUBZone certification, surety bonding.",
    location: "",
    website: "",
    repName: "TBC",
    repEmails: "",
    active: true,
  },
  {
    name: "AEDC",
    type: "Partner",
    blurb: "Arkansas site selection, incentives, and state-level introductions.",
    location: "",
    website: "",
    repName: "TBC",
    repEmails: "",
    active: true,
  },
  {
    name: "ASBTDC",
    type: "Partner",
    blurb: "Market research, financial projections, and government contracting.",
    location: "",
    website: "",
    repName: "TBC",
    repEmails: "",
    active: true,
  },
  {
    name: "August Interactive",
    type: "Cohort",
    blurb:
      "Master Command, a performance intelligence layer for competitive gaming that turns real play into coachable signals: decisions, timing and consistency under pressure. Led by Kristin Wood, twenty years at CIA across analysis, operations and digital innovation, with Emmy-winning executive producer Sarah Kneller.",
    location: "Reston, VA",
    website: "augustinteractive.gg",
    repName: "Kristin Wood",
    repEmails: "kristin@augustinteractive.gg",
    active: true,
  },
  {
    name: "DBT Aero",
    type: "Cohort",
    blurb:
      "The DBT-2LX Autonomous Logistics UAS: a hybrid-electric, optionally piloted fixed-wing platform with HaloDrive multi-fuel propulsion, built on a patented Double Box Tail airframe. Founder Michael Duke is two decades into ultra-efficient aircraft design and flight test, and was named Innovator of the Year by the Utah Aeronautics Division.",
    location: "Riverton, UT",
    website: "dbt.aero",
    repName: "Michael Duke",
    repEmails: "michael.duke@dbt.aero",
    active: true,
  },
  {
    name: "Field Viewers",
    type: "Cohort",
    blurb:
      "A vertically integrated AI stack for radiation detection: detectors, readout ASICs, FPGA and DAQ, data infrastructure and deployed software, so models train on real sensor physics. Founder Sachin Junnarkar brings twenty-five years in radiation detection and medical imaging, with engineering leadership at Philips, Indev-ACT and SureScan.",
    location: "Austin, TX",
    website: "fieldviewers.com",
    repName: "Sachin Junnarkar",
    repEmails: "junnarkar@fieldviewers.com",
    active: true,
  },
  {
    name: "Makers Equipment",
    type: "Cohort",
    blurb:
      "A Containerized Advanced Manufacturing System for metallic monocoque UAS airframes, plus CNC hydroform presses, press brakes and heat treatment for expeditionary shops. Founder Rusty Rainbolt is an Oklahoma State-trained aerospace manufacturing engineer with deep experience in sheet metal, machined and composite aerostructures, composite tooling and AS9100 implementation.",
    location: "Winslow, AR",
    website: "makersequipment.com",
    repName: "Rusty Rainbolt",
    repEmails: "rusty@makersequipment.com",
    active: true,
  },
  {
    name: "Mod Tech Labs",
    type: "Cohort",
    blurb:
      "CMMC-aligned Manufacturing Intelligence and a Sovereign AI operating system. The MOD Engine runs 3D spatial and AI workloads on-prem, at the edge or air-gapped, with a cryptographic audit ledger. Co-founder Alex Porter built the company's GPU orchestration platform for clients including NBCUniversal and Dell before turning it toward defense.",
    location: "Austin, TX",
    website: "modtechlabs.com",
    repName: "Alex Porter",
    repEmails: "alex@modtechlabs.com",
    active: true,
  },
  {
    name: "nKode",
    type: "Cohort",
    blurb:
      "Graphical multi-factor authentication built on a shuffling virtual keypad and a tokenized cypher, so a user's passcode is never exposed during login. Deploys by widget or API. CEO David DePoyster spent two decades building medical companies out of central Arkansas, including MedSource and US Compounding.",
    location: "Little Rock, AR",
    website: "nkode.tech",
    repName: "David DePoyster",
    repEmails: "depoyster1@me.com",
    active: true,
  },
  {
    name: "NTS Innovations",
    type: "Cohort",
    blurb:
      "Nanoscale Energy Harvesting, licensed exclusively worldwide from the University of Arkansas: graphene semiconductor chips that power IoT devices and microelectronics without batteries. Donald Meyer leads from material science through silicon fabrication, Ryan McCoy drives commercialization. Advisors include Dr. Art Morrish, formerly of DARPA, Raytheon and L3Harris.",
    location: "Fayetteville, AR & E. Peoria, IL",
    website: "ntsinnovations.com",
    repName: "Ryan McCoy",
    repEmails: "rmccoy@ntsinnovations.com",
    active: true,
  },
  {
    name: "Rook Armor",
    type: "Cohort",
    blurb:
      "Advanced ceramic and composite manufacturing for next-generation body armor, hypersonic thermal protection and micro-nuclear shielding, licensed from Idaho National Laboratory. NIJ III to IV, US-made. Founder Anire Okpaku, MD, FACS is a practicing surgeon bringing a clinician's view of survivability to armor design.",
    location: "Leander, TX",
    website: "rookarmor.com",
    repName: "Anire Okpaku",
    repEmails: "ao@rookarmor.com",
    active: true,
  },
];

const SETTINGS: [string, string][] = [
  ["Event Name", "2026 Forge Summit"],
  ["Tagline", "Linking the Industrial Heartland to the Irregular Front"],
  ["Location", "Downtown North Little Rock, Arkansas"],
  ["Room", VENUE_ROOM],
  ["Logo URL", ""],
  ["Slot Minutes", "30"],
  ["Buffer Minutes", "0"],
  ["Max Bookings Per Email", "2"],
  ["Admin Email", "Robertandrewbaker20@gmail.com"],
  ["Send Calendar Invites", "false"],
  ["Booking Open", "true"],
];

const SCHEDULE = [
  {
    date: "2026-10-13",
    start: "08:00",
    end: "16:00",
    label: "Tuesday, Oct 13",
  },
  {
    date: "2026-10-14",
    start: "08:00",
    end: "16:00",
    label: "Wednesday, Oct 14",
  },
];

function slug(name: string): string {
  const raw = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "");
  // Live Neon IDs use Apps Script slice(0, 14) except NTS (full 15-char slug).
  if (raw === "ntsinnovations") return raw;
  return raw.slice(0, 14) || "x";
}

function timeLabel(hours: number, minutes: number): string {
  const period = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  return `${h}:${String(minutes).padStart(2, "0")} ${period}`;
}

function parseHm(value: string): [number, number] {
  const [h, m] = value.split(":").map(Number);
  return [h, m];
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS agencies (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        blurb TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        website TEXT NOT NULL DEFAULT '',
        rep_name TEXT NOT NULL DEFAULT '',
        rep_emails TEXT NOT NULL DEFAULT '',
        calendar_id TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT true
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schedule (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        day_label TEXT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS slots (
        id TEXT PRIMARY KEY,
        agency_id INTEGER NOT NULL REFERENCES agencies(id),
        agency_name TEXT NOT NULL,
        start_at TIMESTAMPTZ NOT NULL,
        end_at TIMESTAMPTZ NOT NULL,
        time_label TEXT NOT NULL,
        day_label TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Open',
        attendee_name TEXT,
        attendee_email TEXT,
        organization TEXT,
        topic TEXT,
        booked_at TIMESTAMPTZ,
        confirmation TEXT,
        calendar_event_id TEXT
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS slots_status_start_idx ON slots (status, start_at)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS slots_attendee_email_idx ON slots (attendee_email)`,
    );

    const forceSettings = new Set(["Slot Minutes", "Buffer Minutes", "Room"]);
    for (const [key, value] of SETTINGS) {
      if (forceSettings.has(key)) {
        await client.query(
          `INSERT INTO settings (key, value)
           VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [key, value],
        );
      } else {
        await client.query(
          `INSERT INTO settings (key, value)
           VALUES ($1, $2)
           ON CONFLICT (key) DO NOTHING`,
          [key, value],
        );
      }
    }

    const schedCount = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM schedule`,
    );
    if (Number(schedCount.rows[0]?.n || 0) === 0) {
      for (const day of SCHEDULE) {
        await client.query(
          `INSERT INTO schedule (date, start_time, end_time, day_label)
           VALUES ($1, $2, $3, $4)`,
          [day.date, day.start, day.end, day.label],
        );
      }
    }

    for (const ag of AGENCIES) {
      await client.query(
        // preserve active, rep_name, rep_emails on existing agency rows
        `INSERT INTO agencies
           (name, type, blurb, location, website, rep_name, rep_emails, calendar_id, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '', $8)
         ON CONFLICT (name) DO UPDATE SET
           type = EXCLUDED.type,
           blurb = EXCLUDED.blurb,
           location = EXCLUDED.location,
           website = EXCLUDED.website`,
        [
          ag.name,
          ag.type,
          ag.blurb,
          ag.location,
          ag.website,
          ag.repName,
          ag.repEmails,
          ag.active,
        ],
      );
    }

    // Do not mass-deactivate agencies mid-event; only insert/update listed hosts.

    const booked = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM slots WHERE status = 'Booked'`,
    );
    const blocked = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM slots WHERE status = 'Blocked'`,
    );
    const keptBooked = Number(booked.rows[0]?.n || 0);
    const keptBlocked = Number(blocked.rows[0]?.n || 0);
    const cleared = await client.query(
      `DELETE FROM slots WHERE status = 'Open'`,
    );
    console.log(
      `Rebuilding 30-minute grid (kept ${keptBooked} booked, ${keptBlocked} blocked, cleared ${cleared.rowCount || 0} open)`,
    );

    const agencyRows = await client.query<{ id: number; name: string }>(
      `SELECT id, name FROM agencies ORDER BY id`,
    );
    const slotMinutes = 30;
    const stepMinutes = 30;

    for (const day of SCHEDULE) {
      const [endH, endM] = parseHm(day.end);
      const endTotal = endH * 60 + endM;

      for (const ag of agencyRows.rows) {
        const [startH, startM] = parseHm(day.start);
        let cursor = startH * 60 + startM;
        while (cursor + slotMinutes <= endTotal) {
          const hours = Math.floor(cursor / 60);
          const minutes = cursor % 60;
          const hh = String(hours).padStart(2, "0");
          const mm = String(minutes).padStart(2, "0");
          const stamp = `${day.date.replace(/-/g, "")}-${hh}${mm}`;
          const id = `${slug(ag.name)}-${stamp}`;
          const startAt = `${day.date}T${hh}:${mm}:00${TZ_OFFSET}`;
          const endMinutes = cursor + slotMinutes;
          const endHours = Math.floor(endMinutes / 60);
          const endMins = endMinutes % 60;
          const endAt = `${day.date}T${String(endHours).padStart(2, "0")}:${String(endMins).padStart(2, "0")}:00${TZ_OFFSET}`;

          await client.query(
            `INSERT INTO slots
               (id, agency_id, agency_name, start_at, end_at, time_label, day_label, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'Open')
             ON CONFLICT (id) DO NOTHING`,
            [
              id,
              ag.id,
              ag.name,
              startAt,
              endAt,
              timeLabel(hours, minutes),
              day.label,
            ],
          );
          cursor += stepMinutes;
        }
      }
    }

    const after = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM slots`,
    );
    console.log(
      `Seed complete (${after.rows[0]?.n || 0} slots, ${keptBooked} booked + ${keptBlocked} blocked kept)`,
    );
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
