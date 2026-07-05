// Zentrale Link-Konstanten der Menue-Familie. Eine Wahrheit, gegen die der
// Werkzeug-Hebel H25 (tools/menu_ui_check.py) die gerenderten href-Werte prueft.
// Alle externen Links oeffnen in neuem Tab (rel=noopener), nie in der App.

export const LINKS = {
  /** "UNTERSTUETZEN" im Hauptmenue. */
  support: "https://donate.stripe.com/5kQ28r9bzf2n79l3Pn2kw00",
  /** Footer: Sanatorium / Substack. */
  kokos: "https://kokos-und-zitrone.de",
  /** Footer: Hellmuth-Soda-Site. */
  soda: "https://hellmuth-soda.de",
  /** Footer + Buch-Buttons: Amazon-Default (CLAUDE.md). */
  buch: "https://www.amazon.de/dp/B0GT4G61VX",
} as const;

export type LinkKey = keyof typeof LINKS;

/** Externer Link in neuem Tab. Browser-Standard; im Electron-Wrapper spaeter
 *  vom Main-Prozess abgefangen. */
export function openExternal(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
