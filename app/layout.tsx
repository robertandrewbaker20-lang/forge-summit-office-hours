import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-archivo",
  display: "swap",
});

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://forge-summit-oh-robert-baker-s-projects.vercel.app";

const TITLE = "Office Hours — Forge Summit 2026";
const DESCRIPTION =
  "Book thirty minutes with Phoenix 2026 startups and partner agencies (SBA, AEDC, ASBTDC) in Ballroom C, Downtown North Little Rock — October 13–14, 2026.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Forge Summit",
    locale: "en_US",
    images: [{ url: "/brand/summit-lockup.png", alt: "Forge Summit" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/brand/summit-lockup.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#060B14",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const eventJsonLd = {
  "@context": "https://schema.org",
  "@type": "Event",
  name: "Forge Summit 2026 Office Hours",
  description: DESCRIPTION,
  startDate: "2026-10-13",
  endDate: "2026-10-14",
  eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  eventStatus: "https://schema.org/EventScheduled",
  location: {
    "@type": "Place",
    name: "Ballroom C",
    address: {
      "@type": "PostalAddress",
      addressLocality: "North Little Rock",
      addressRegion: "AR",
      addressCountry: "US",
    },
  },
  organizer: {
    "@type": "Organization",
    name: "Forge",
    url: "https://www.forge.institute/summit",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} h-full antialiased`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }}
        />
      </head>
      <body className={`${archivo.className} min-h-full`}>{children}</body>
    </html>
  );
}
