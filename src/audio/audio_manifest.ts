// Audio-Manifest: buendelt die statische JSON und reicht die reinen Typen +
// Aufloesungs-Helfer aus manifest_resolve.ts durch. Trennung, damit die
// Aufloesungslogik (ohne JSON-Import) in Node testbar bleibt.
//
// Architektur-Wahrheit: HELLMUTH liefert FERTIGE Dateien aus, keine Live-API.
// Fehlt eine Datei, degradiert der Klang still (no-op). Vite buendelt die JSON
// (resolveJsonModule); kein Laufzeit-fetch.

import audioManifestJson from "../../game/data/audio_manifest.json";
import type { AudioManifest } from "./manifest_resolve";

export * from "./manifest_resolve";

export function loadAudioManifest(): AudioManifest {
  return audioManifestJson as AudioManifest;
}
