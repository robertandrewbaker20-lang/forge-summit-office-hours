import { eventFromSettings, getSettingsMap, listOpsBookings } from "@/lib/booking";
import { CURTAIN, SUMMIT_LOCKUP } from "@/lib/logos";
import type { OpsBooking } from "@/lib/types";
import { VENUE_ROOM } from "@/lib/venue";

function blank(value: string): string {
  return value.trim() || "—";
}

export async function OpsList() {
  const [bookings, cfg] = await Promise.all([
    listOpsBookings(),
    getSettingsMap(),
  ]);
  const event = eventFromSettings(cfg);
  const room = event.room || VENUE_ROOM;

  return (
    <div className="ops-wrap">
      <div className="mast" style={{ backgroundImage: `url(${CURTAIN})` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="lockup"
          src={event.logo || SUMMIT_LOCKUP}
          alt="Forge Summit 2026"
        />
        <h1>Booked slots</h1>
        <p>
          {event.location || event.name} · {room}
        </p>
      </div>
      <div className="ops-body">
        <p className="ops-lede">
          {bookings.length === 1
            ? "1 booked meeting."
            : `${bookings.length} booked meetings.`}{" "}
          Unlisted ops page — bookmark this full URL. Do not post it publicly.
        </p>
        {bookings.length === 0 ? (
          <p className="ops-empty">No booked slots yet.</p>
        ) : (
          <>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Attendee</th>
                    <th>Email</th>
                    <th>Org</th>
                    <th>Topic</th>
                    <th>Host</th>
                    <th>When</th>
                    <th>Code</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((row) => (
                    <tr key={row.id}>
                      <td>{blank(row.attendeeName)}</td>
                      <td>
                        {row.attendeeEmail ? (
                          <a href={`mailto:${row.attendeeEmail}`}>
                            {row.attendeeEmail}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{blank(row.organization)}</td>
                      <td>{blank(row.topic)}</td>
                      <td>
                        <span className="ops-host">{row.hostName}</span>
                        <span className="ops-type">
                          {row.hostType === "Cohort"
                            ? "Startup"
                            : "Support agency"}
                        </span>
                      </td>
                      <td>
                        {row.day}, {row.time}
                      </td>
                      <td className="ops-code">{blank(row.confirmation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="ops-cards">
              {bookings.map((row) => (
                <OpsCard key={row.id} row={row} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function OpsCard({ row }: { row: OpsBooking }) {
  return (
    <li className={`ops-card${row.hostType === "Cohort" ? " cohort" : ""}`}>
      <div className="ops-card-top">
        <strong>{blank(row.attendeeName)}</strong>
        <span className="ops-code">{blank(row.confirmation)}</span>
      </div>
      <dl>
        <dt>Email</dt>
        <dd>
          {row.attendeeEmail ? (
            <a href={`mailto:${row.attendeeEmail}`}>{row.attendeeEmail}</a>
          ) : (
            "—"
          )}
        </dd>
        <dt>Org</dt>
        <dd>{blank(row.organization)}</dd>
        <dt>Topic</dt>
        <dd>{blank(row.topic)}</dd>
        <dt>Host</dt>
        <dd>
          {row.hostName} ·{" "}
          {row.hostType === "Cohort" ? "Startup" : "Support agency"}
        </dd>
        <dt>When</dt>
        <dd>
          {row.day}, {row.time}
        </dd>
      </dl>
    </li>
  );
}
