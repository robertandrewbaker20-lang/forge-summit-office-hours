import Link from "next/link";

export const PRIVACY_TEXT =
  "Organized by Forge Institute. Your name, email and organization are shared only with the host you book.";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        {PRIVACY_TEXT} <Link href="/privacy">Privacy</Link>
      </p>
    </footer>
  );
}
