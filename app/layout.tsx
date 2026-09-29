import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";
import "./globals.css";
import { SITE_URL as SITE } from "@/lib/site";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-archivo",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});


const TITLE = "Office Hours — Forge Summit 2026";
const DESCRIPTION =
  "Book thirty minutes with a startup founder or a support agency in Ballroom C, North Little Rock — October 13–14, 2026.";

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
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#041C2C",
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
    <html lang="en-US" className={`${archivo.variable} ${inter.variable} h-full antialiased`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }}
        />
      </head>
      <body className={`${inter.className} min-h-full`}>{children}</body>
    </html>
  );
}
