export const HOST_LOGOS: Record<string, string> = {
  "August Interactive": "/logos/august-interactive.png",
  "DBT Aero": "/logos/dbt-aero.png",
  "Field Viewers": "/logos/field-viewers.png",
  "Makers Equipment": "/logos/makers-equipment.png",
  "Mod Tech Labs": "/logos/mod-tech-labs.png",
  nKode: "/logos/nkode.png",
  "NTS Innovations": "/logos/nts-innovations.png",
  "Rook Armor": "/logos/rook-armor.png",
};

export const SUMMIT_LOCKUP = "/brand/summit-lockup.png";
export const CURTAIN = "/brand/curtain.jpg";

export function logoFor(name: string): string | null {
  return HOST_LOGOS[name] ?? null;
}
