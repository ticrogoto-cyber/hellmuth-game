// Audio-Vorladen ueber den Phaser-Loader (Strang 7; Physik T3 gehaertet).
//
// ROBUSTHEIT (vfx-Merge-Befund): fehlende Dateien liefern bei SPA-Hosting die
// `index.html` zurueck (200, text/html) statt 404. Phaser wuerde HTML als Audio
// zu dekodieren versuchen -> `Unable to decode audio data`-Spam. Darum wird JEDE
// URL erst per HEAD geprueft (istAudioAntwort) und nur bei echter Audio-Antwort
// in den Loader gestellt. Mit leerem public/audio/ laedt das Spiel still.
//
// Sprach-Sparsamkeit: nur aktive + Referenzsprache initial; weitere Pakete lazy
// ueber ladeSprachpaket. Geladene Puffer landen unter ihrem Cache-Key.

import type Phaser from "phaser";
import type { AudioManifest, Sprache } from "./audio_manifest";
import { audioUrls, fileCacheKey, referenzVon, spriteUrls } from "./audio_manifest";
import { istAudioAntwort } from "./audio_util";

interface LadeEintrag {
  key: string;
  urls: string[];
}

function initialeEintraege(manifest: AudioManifest, sprache: Sprache): LadeEintrag[] {
  const referenz = referenzVon(manifest);
  const eintraege: LadeEintrag[] = [];
  const gesehen = new Set<string>();
  for (const set of Object.values(manifest.sets)) {
    for (const file of set.files) {
      if (file.sprite || !file.stem) continue; // Sprites separat
      if (file.lang !== undefined && file.lang !== sprache && file.lang !== referenz) continue;
      const key = fileCacheKey(file);
      if (gesehen.has(key)) continue;
      gesehen.add(key);
      eintraege.push({ key, urls: audioUrls(file) });
    }
  }
  for (const [key, sheet] of Object.entries(manifest.sprites ?? {})) {
    if (gesehen.has(key)) continue;
    gesehen.add(key);
    eintraege.push({ key, urls: spriteUrls(sheet) });
  }
  return eintraege;
}

function sprachEintraege(manifest: AudioManifest, lang: Sprache): LadeEintrag[] {
  const eintraege: LadeEintrag[] = [];
  const gesehen = new Set<string>();
  for (const set of Object.values(manifest.sets)) {
    for (const file of set.files) {
      if (file.sprite || !file.stem || file.lang !== lang) continue;
      const key = fileCacheKey(file);
      if (gesehen.has(key)) continue;
      gesehen.add(key);
      eintraege.push({ key, urls: audioUrls(file) });
    }
  }
  return eintraege;
}

/**
 * Prueft jeden Eintrag per HEAD und stellt nur ECHTE Audiodateien in den Loader
 * (kein Decode-Versuch auf SPA-HTML). Faellt ohne `fetch` auf direktes Laden
 * zurueck. Startet den Loader, wenn etwas geladen wird.
 */
async function geprueftLaden(scene: Phaser.Scene, eintraege: LadeEintrag[]): Promise<void> {
  const neu = eintraege.filter((e) => e.urls.length > 0 && !scene.cache.audio.exists(e.key));
  if (neu.length === 0) return;

  if (typeof fetch !== "function") {
    for (const e of neu) scene.load.audio(e.key, e.urls);
    scene.load.start();
    return;
  }

  const ladbar: LadeEintrag[] = [];
  await Promise.all(
    neu.map(async (e) => {
      try {
        const r = await fetch(e.urls[0], { method: "HEAD" });
        if (istAudioAntwort(r.ok, r.headers.get("content-type"))) ladbar.push(e);
      } catch {
        /* Netzfehler -> ueberspringen (still) */
      }
    }),
  );
  if (ladbar.length === 0) return;
  for (const e of ladbar) scene.load.audio(e.key, e.urls);
  scene.load.start();
}

export function preloadAudio(scene: Phaser.Scene, manifest: AudioManifest, sprache: Sprache): void {
  void geprueftLaden(scene, initialeEintraege(manifest, sprache));
}

/** Laedt das Sprach-Paket einer Sprache lazy nach (nur dessen fehlende Dateien). */
export function ladeSprachpaket(scene: Phaser.Scene, manifest: AudioManifest, lang: Sprache): void {
  void geprueftLaden(scene, sprachEintraege(manifest, lang));
}

/** Liest einen dekodierten Puffer aus dem Phaser-Cache (oder undefined). */
export function bufferAusCache(game: Phaser.Game, key: string): AudioBuffer | undefined {
  const wert = game.cache.audio.get(key) as unknown;
  return wert instanceof AudioBuffer ? wert : undefined;
}
