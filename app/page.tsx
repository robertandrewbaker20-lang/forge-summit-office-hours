import { BookingApp } from "./components/BookingApp";
import { CURTAIN, SUMMIT_LOCKUP } from "@/lib/logos";

export default function HomePage() {
  return (
    <div className="wrap">
      <header
        className="mast ssr-landing"
        style={{ backgroundImage: `url(${CURTAIN})` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="lockup"
          src={SUMMIT_LOCKUP}
          alt="Forge Summit 2026"
          width={300}
          height={166}
        />
        <h1>Office hours</h1>
        <p className="mast-meta">Oct 13–14 · Ballroom C · North Little Rock</p>
        <p className="lede lede-on-dark">
          Book thirty minutes with a startup founder or a support agency.
        </p>
        <p className="lede-on-dark mast-hint">
          Choose who you meet, then pick a time.
        </p>
      </header>
      <BookingApp embed />
    </div>
  );
}
