import { BookingApp } from "./components/BookingApp";
import { VENUE_ROOM } from "@/lib/venue";

export default function HomePage() {
  return (
    <div className="wrap">
      <header className="ssr-landing" style={{ padding: "1.25rem 1.25rem 0" }}>
        <p className="eyebrow" style={{ margin: 0, opacity: 0.75, fontSize: "0.8rem", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Forge Summit 2026
        </p>
        <h1 style={{ margin: "0.35rem 0 0.5rem", fontSize: "1.65rem", lineHeight: 1.2 }}>
          Office Hours
        </h1>
        <p style={{ margin: "0 0 0.35rem", fontWeight: 600 }}>
          October 13–14, 2026
        </p>
        <p style={{ margin: "0 0 0.75rem", opacity: 0.9 }}>
          {VENUE_ROOM}, Downtown North Little Rock
        </p>
        <p className="lede" style={{ margin: "0 0 1rem" }}>
          Book thirty minutes with a Phoenix 2026 startup or a support agency
          (SBA, AEDC, ASBTDC). Phone-first booking — pick a host, then a time.
        </p>
      </header>
      <BookingApp embed />
    </div>
  );
}
