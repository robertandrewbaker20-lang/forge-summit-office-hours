/** Host marks and brand assets from /public. Keep out of client JS bundles. */

export const SUMMIT_LOCKUP = "/brand/summit-lockup.png";
export const CURTAIN = "/brand/curtain.jpg";

export const HOST_LOGO_PATHS: Record<string, string> = {
  "August Interactive": "/logos/august-interactive.png",
  "DBT Aero": "/logos/dbt-aero.png",
  "Field Viewers": "/logos/field-viewers.png",
  "Makers Equipment": "/logos/makers-equipment.png",
  "Mod Tech Labs": "/logos/mod-tech-labs.png",
  nKode: "/logos/nkode.png",
  "NTS Innovations": "/logos/nts-innovations.png",
  "Rook Armor": "/logos/rook-armor.png",
  ASBTDC: "/logos/asbtdc.png",
  SBA: "/logos/sba.svg",
  AEDC: "/logos/aedc.png",
};

export function logoFor(name: string): string | null {
  return HOST_LOGO_PATHS[name] ?? null;
}

export function logoPath(name: string): string | null {
  return HOST_LOGO_PATHS[name] ?? null;
}
