/**
 * Idempotent schema + seed matching the Apps Script export (Code.gs).
 * Runs in one transaction.
 * - Booked and Blocked rows are preserved.
 * - Open slots are rebuilt to the 15-minute America/Chicago grid (lib/regrid.ts).
 * - Bootstrap only: inserts hosts that do not exist yet. Existing agencies are
 *   never modified (manage them at /admin). Deleted agencies would be re-added,
 *   so do not re-run this against production after the admin page is in use.
 */
import { Pool } from "@neondatabase/serverless";
import { VENUE_ROOM } from "../lib/venue";
import { regridAll, type Queryable } from "../lib/regrid";

const SLOT_MINUTES = 15;

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
  ["Slot Minutes", String(SLOT_MINUTES)],
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
        // The DB (edited via /admin) is the source of truth; only insert missing hosts.
        `INSERT INTO agencies
           (name, type, blurb, location, website, rep_name, rep_emails, calendar_id, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '', $8)
         ON CONFLICT (name) DO NOTHING`,
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

    await client.query(`ALTER TABLE slots ADD COLUMN IF NOT EXISTS covered_by TEXT`);
    // Shared with the admin regrid: bookings are never touched; grid slots
    // overlapping a booking are kept as covered (Blocked) rows.
    const report = await regridAll(client as unknown as Queryable, SLOT_MINUTES);
    const keptBooked = report.after.Booked || 0;
    const keptBlocked = (report.after.Blocked || 0) - report.covered;
    console.log(
      `Rebuilt ${SLOT_MINUTES}-minute grid (kept ${keptBooked} booked, inserted ${report.inserted}, covered ${report.covered})`,
    );

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
