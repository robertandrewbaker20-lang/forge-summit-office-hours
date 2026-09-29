"use client";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Helvetica, Arial, sans-serif", textAlign: "center", padding: "64px 24px" }}>
        <h1>Something went wrong</h1>
        <p>Try again, or ask at the registration desk.</p>
        <button onClick={() => retry()}>Try again</button>
      </body>
    </html>
  );
}
