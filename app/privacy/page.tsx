import type { Metadata } from "next";
import Link from "next/link";
import { PRIVACY_TEXT } from "../components/SiteFooter";

export const metadata: Metadata = {
  title: "Privacy — Forge Summit 2026 Office Hours",
  description: PRIVACY_TEXT,
  alternates: { canonical: "/privacy" },
};

// TODO(Robert): add a privacy contact email here once one is chosen
// (e.g. "Questions: privacy@forge.institute"). Intentionally not shown yet.

export default function PrivacyPage() {
  return (
    <main className="wrap privacy-page">
      <div className="body">
        <Link className="back" href="/" style={{ textDecoration: "none" }}>
          <span className="back-arrow" aria-hidden="true">←</span>
          Back to booking
        </Link>
        <h1 className="privacy-title">Privacy</h1>
        <p>{PRIVACY_TEXT}</p>
        <p>
          We use what you enter to book your meeting, send your confirmation, and let the host
          you choose prepare for it. We do not sell it or use it for advertising.
        </p>
      </div>
    </main>
  );
}
