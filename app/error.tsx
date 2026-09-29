"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold">Something went wrong</h1>
      <p className="mb-6 text-slate-600">
        Try again. If it keeps happening, ask at the registration desk — walk-ups are welcome at every table.
      </p>
      <button
        className="rounded-md bg-slate-900 px-4 py-2 font-semibold text-white"
        onClick={() => retry()}
      >
        Try again
      </button>
    </main>
  );
}
