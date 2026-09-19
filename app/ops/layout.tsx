import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bookings — Office Hours ops",
  robots: { index: false, follow: false, nocache: true },
};

export default function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
