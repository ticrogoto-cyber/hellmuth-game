// Aktive Audiosprache aus der Registry: ?lang=... gewinnt, sonst die zuletzt
// gewaehlte (localStorage), sonst der Default. Gemeinsam von main.ts
// (Manager-Startsprache) und preload_scene.ts (initiales Sprach-Paket) genutzt.

import type { Sprache } from "./audio_manifest";

const GUELTIG: readonly Sprache[] = ["de", "en", "ko", "zh", "ja"];

function gueltig(s: string | null): s is Sprache {
  return s !== null && (GUELTIG as readonly string[]).includes(s);
}

export function aktiveSprache(standard: Sprache): Sprache {
  const q = new URLSearchParams(location.search).get("lang");
  if (gueltig(q)) return q;
  let gespeichert: string | null = null;
  try {
    gespeichert = localStorage.getItem("hellmuth.lang");
  } catch {
    /* kein localStorage -> Default */
  }
  if (gueltig(gespeichert)) return gespeichert;
  return standard;
}
