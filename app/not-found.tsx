import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold">Page not found</h1>
      <p className="mb-6 text-slate-600">That page does not exist.</p>
      <Link className="back" href="/" style={{ textDecoration: "none" }}>
        <span className="back-arrow" aria-hidden="true">←</span>
        Back to booking
      </Link>
    </main>
  );
}
