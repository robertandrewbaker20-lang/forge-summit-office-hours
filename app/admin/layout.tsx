import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin — Office Hours",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <meta name="referrer" content="no-referrer" />
      {children}
    </>
  );
}
