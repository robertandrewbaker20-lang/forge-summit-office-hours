import { adminPasswordConfigured } from "@/lib/adminSession";
import {
  listAdminAgencies,
  listAdminBookings,
  listMailLog,
  type AdminAgency,
} from "@/lib/agencies";
import { bookingIsOpen, getSettingsMap } from "@/lib/booking";
import { adminCopyEmail } from "@/lib/mail";
import { ensureSchema } from "@/lib/schema";
import { formatChicago } from "@/lib/time";
import {
  cancelBookingAction,
  createAgencyAction,
  deleteAgencyAction,
  loginAction,
  logoutAction,
  sendTestEmailAction,
  setBookingOpenAction,
  toggleAgencyAction,
  updateAgencyAction,
} from "./actions";
import { ConfirmButton } from "./ConfirmButton";
import { isAdmin } from "./session";

export const dynamic = "force-dynamic";

const input =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-sky-500 focus:outline-none";
const label = "block text-sm font-semibold text-slate-700 mb-1";
const btn =
  "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold min-h-[44px]";
const btnPrimary = `${btn} bg-slate-900 text-white hover:bg-slate-700`;
const btnGhost = `${btn} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;
const btnDanger = `${btn} border border-red-300 bg-white text-red-700 hover:bg-red-50`;
const card = "rounded-lg border border-slate-200 bg-white p-4 shadow-sm";

function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <div
      role="status"
      className={`mb-4 rounded-md border px-4 py-3 text-sm ${
        err ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-900"
      }`}
    >
      {err || ok}
    </div>
  );
}

function AgencyFields({ ag }: { ag?: AdminAgency }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={label}>Name (shown to attendees)</label>
        <input className={input} name="name" required maxLength={80} defaultValue={ag?.name} />
      </div>
      <div>
        <label className={label}>Group</label>
        <select className={input} name="type" defaultValue={ag?.type || "Partner"}>
          <option value="Partner">Support agency</option>
          <option value="Cohort">Startup (Phoenix cohort)</option>
        </select>
      </div>
      <div>
        <label className={label}>Contact name (shown as “You will meet”)</label>
        <input className={input} name="repName" maxLength={120} defaultValue={ag?.repName} placeholder="TBC" />
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Notification emails (private; one per line or comma-separated)</label>
        <textarea
          className={input}
          name="notifyEmails"
          rows={2}
          defaultValue={ag?.notifyEmails.join("\n")}
          placeholder="name@agency.gov"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <p className="mt-1 text-xs text-slate-500">Each new booking with this host is emailed here. Leave empty for no host email.</p>
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Description</label>
        <textarea className={input} name="blurb" rows={2} maxLength={1200} defaultValue={ag?.blurb} />
      </div>
      <div>
        <label className={label}>Location</label>
        <input className={input} name="location" maxLength={120} defaultValue={ag?.location} />
      </div>
      <div>
        <label className={label}>Website</label>
        <input className={input} name="website" maxLength={200} defaultValue={ag?.website} placeholder="example.gov" autoCapitalize="none" />
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Logo (optional: /logos/file.png or https:// URL)</label>
        <input className={input} name="logoUrl" maxLength={500} defaultValue={ag?.logoUrl} autoCapitalize="none" />
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
        <input type="checkbox" name="active" defaultChecked={ag ? ag.active : true} className="h-5 w-5" />
        Active (attendees can book)
      </label>
    </div>
  );
}

function Login({ err }: { err?: string }) {
  const configured = adminPasswordConfigured();
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold">Office hours admin</h1>
      <Flash err={err || (configured ? undefined : "ADMIN_PASSWORD is not set on the server.")} />
      <form action={loginAction} className={`${card} grid gap-4`}>
        <div>
          <label className={label} htmlFor="password">Password</label>
          <input id="password" className={input} type="password" name="password" required autoComplete="current-password" />
        </div>
        <button className={btnPrimary} type="submit" disabled={!configured}>Sign in</button>
      </form>
    </main>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : undefined;
  const err = typeof sp.err === "string" ? sp.err : undefined;
  if (!(await isAdmin())) return <Login err={err} />;

  await ensureSchema();
  const [agencies, bookings, mail, cfg] = await Promise.all([
    listAdminAgencies(),
    listAdminBookings(),
    listMailLog(30),
    getSettingsMap(),
  ]);
  const open = bookingIsOpen(cfg);
  const resendConfigured = Boolean((process.env.RESEND_API_KEY || "").trim());
  const fromEmail = (process.env.FROM_EMAIL || "").trim() || "(default test sender)";

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 text-slate-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Office hours admin</h1>
        <form action={logoutAction}>
          <button className={btnGhost} type="submit">Sign out</button>
        </form>
      </div>
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        <a className="underline" href="#agencies">Agencies ({agencies.length})</a>
        <a className="underline" href="#add">Add agency</a>
        <a className="underline" href="#bookings">Bookings ({bookings.length})</a>
        <a className="underline" href="#mail">Email</a>
        <a className="underline" href="/" target="_blank">Open booking site ↗</a>
      </nav>
      <Flash ok={ok} err={err} />

      <section className={`${card} mb-6 flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <p className="font-semibold">Booking is {open ? "OPEN" : "CLOSED"}</p>
          <p className="text-sm text-slate-600">
            Email: {resendConfigured ? "Resend configured" : "RESEND_API_KEY missing — no emails are sent"} · From {fromEmail} · Admin copy {adminCopyEmail() || "off"}
          </p>
        </div>
        <form action={setBookingOpenAction}>
          <input type="hidden" name="open" value={open ? "false" : "true"} />
          <ConfirmButton className={open ? btnDanger : btnPrimary} message={open ? "Close booking for everyone?" : "Open booking?"}>
            {open ? "Close booking" : "Open booking"}
          </ConfirmButton>
        </form>
      </section>

      <h2 id="agencies" className="mb-3 text-xl font-bold">Agencies &amp; hosts</h2>
      <div className="grid gap-4">
        {agencies.map((ag) => (
          <details key={ag.id} id={`agency-${ag.id}`} className={card}>
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {ag.name}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    {ag.type === "Cohort" ? "Startup" : "Support agency"}
                  </span>
                </span>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${ag.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                  {ag.active ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-1 break-all text-sm text-slate-600">
                {ag.notifyEmails.length ? ag.notifyEmails.join(", ") : <em>No notification email</em>}
              </p>
              <p className="text-xs text-slate-500">
                {ag.booked} booked · {ag.open} open · tap to edit
              </p>
            </summary>
            <form action={updateAgencyAction} className="mt-4 grid gap-3">
              <input type="hidden" name="id" value={ag.id} />
              <AgencyFields ag={ag} />
              <div className="flex flex-wrap gap-2">
                <button className={btnPrimary} type="submit">Save</button>
              </div>
            </form>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              <form action={toggleAgencyAction}>
                <input type="hidden" name="id" value={ag.id} />
                <input type="hidden" name="active" value={ag.active ? "false" : "true"} />
                <button className={btnGhost} type="submit">{ag.active ? "Deactivate" : "Activate"}</button>
              </form>
              {ag.booked === 0 && (
                <form action={deleteAgencyAction}>
                  <input type="hidden" name="id" value={ag.id} />
                  <ConfirmButton className={btnDanger} message={`Permanently delete ${ag.name} and its open slots?`}>
                    Delete
                  </ConfirmButton>
                </form>
              )}
            </div>
          </details>
        ))}
      </div>

      <h2 id="add" className="mb-3 mt-8 text-xl font-bold">Add agency</h2>
      <form action={createAgencyAction} className={`${card} grid gap-3`}>
        <AgencyFields />
        <p className="text-xs text-slate-500">A full 30-minute grid (Oct 13–14, 8:00 AM–4:00 PM CT) is created automatically.</p>
        <button className={btnPrimary} type="submit">Add agency</button>
      </form>

      <h2 id="bookings" className="mb-3 mt-8 text-xl font-bold">Bookings ({bookings.length})</h2>
      {bookings.length === 0 ? (
        <p className="text-sm text-slate-600">No bookings yet.</p>
      ) : (
        <div className="grid gap-3">
          {bookings.map((b) => (
            <div key={b.id} className={card}>
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-semibold">
                  {b.dayLabel} · {b.timeLabel} CT
                </p>
                <p className="font-mono text-sm">{b.confirmation}</p>
              </div>
              <p className="text-sm"><span className="text-slate-500">Host:</span> {b.agencyName}</p>
              <p className="break-all text-sm">
                <span className="text-slate-500">Attendee:</span> {b.attendeeName} ·{" "}
                <a className="underline" href={`mailto:${b.attendeeEmail}`}>{b.attendeeEmail}</a>
              </p>
              {b.organization && <p className="text-sm"><span className="text-slate-500">Org:</span> {b.organization}</p>}
              {b.topic && <p className="whitespace-pre-wrap text-sm"><span className="text-slate-500">Topic:</span> {b.topic}</p>}
              <p className="text-xs text-slate-500">Booked {formatChicago(b.bookedAt)}</p>
              <form action={cancelBookingAction} className="mt-2">
                <input type="hidden" name="slotId" value={b.id} />
                <ConfirmButton className={btnDanger} message={`Cancel ${b.attendeeName}'s booking with ${b.agencyName}? The attendee is not emailed.`}>
                  Cancel booking
                </ConfirmButton>
              </form>
            </div>
          ))}
        </div>
      )}

      <h2 id="mail" className="mb-3 mt-8 text-xl font-bold">Email</h2>
      <form action={sendTestEmailAction} className={`${card} mb-4 grid gap-3`}>
        <div>
          <label className={label}>Send a test email to</label>
          <input className={input} name="to" type="text" placeholder={adminCopyEmail()} autoCapitalize="none" />
        </div>
        <button className={btnGhost} type="submit">Send test</button>
      </form>
      <div className={card}>
        <p className="mb-2 text-sm font-semibold">Recent sends</p>
        {mail.length === 0 ? (
          <p className="text-sm text-slate-600">Nothing yet.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {mail.map((m) => (
              <li key={m.id} className="break-all border-b border-slate-100 pb-2">
                <span className={m.status === "sent" ? "text-emerald-700" : m.status === "failed" ? "text-red-700" : "text-amber-700"}>
                  {m.status}
                </span>{" "}
                · {m.kind} · {m.recipients || "—"} · {formatChicago(m.createdAt)}
                {m.error && <span className="block text-xs text-red-700">{m.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
