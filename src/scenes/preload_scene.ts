import Phaser from "phaser";
import { loadGameData } from "../data/loader";
import { SPRITE_MANIFEST, UNIT_ATLAS } from "../data/sprites";
import { enqueueTerrainLoads } from "../editor/terrain_assets";
import { loadAudioManifest } from "../audio/audio_manifest";
import { preloadAudio } from "../audio/audio_preload";
import { aktiveSprache } from "../audio/audio_lang";
import { BLOOD_FX_MANIFEST } from "../data/blood_manifest";
import { GLOW_FX_MANIFEST } from "../data/glow_manifest";

/**
 * PreloadScene: laedt die Datenschicht und (spaeter) Assets. Aktuell gibt es
 * keine Bild-/Audio-Assets, daher nur die getypten JSON-Daten ueber den
 * Loader. Die geladenen Daten werden in der Registry abgelegt, damit alle
 * Scenes darauf zugreifen koennen.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super("preload");
  }

  preload(): void {
    const gameData = loadGameData();
    this.registry.set("gameData", gameData);

    // Knapper Sanity-Log: bestaetigt, dass der Loader fehlerfrei lief.
    const unitCount = Object.keys(gameData.units).length;
    const buildingCount = Object.keys(gameData.buildings).length;
    console.info(
      `[HELLMUTH] Daten geladen: ${unitCount} Einheiten, ` +
        `${buildingCount} Gebaeude, Tech-Stufen: ${gameData.techTree.stufen.join(", ")}.`,
    );

    // Sprites aus dem Manifest laden. Fehlende Dateien fangen wir ab, das Spiel
    // laeuft mit Platzhalterformen weiter (kein Crash, kein Blockieren).
    // Optionale Assets (z. B. handgemalte Boden-Schatten) duerfen fehlen, ohne
    // zu warnen.
    // Blut-FX-Slots (Blut-Paket B): alle optional, fallen ueber das exists()-Gate
    // auf prozedurale Platzhalter zurueck, bis Ticros KREA-PNGs vorliegen.
    const manifest = [...SPRITE_MANIFEST, ...BLOOD_FX_MANIFEST, ...GLOW_FX_MANIFEST];
    const optionalKeys = new Set(manifest.filter((e) => e.optional).map((e) => e.key));
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      // Audiodateien fehlen erwartet, solange ElevenLabs noch nicht geliefert
      // hat -- still uebergehen (Drop-a-file-Vertrag, Stub spielt stumm).
      if (file.type === "audio") return;
      if (optionalKeys.has(file.key)) return;
      console.warn(`[HELLMUTH] Sprite fehlt (Platzhalter wird genutzt): ${file.key}`);
    });
    for (const entry of manifest) {
      this.load.image(entry.key, entry.path);
    }

    // Direktionale Walk-Atlanten (animierte Einheiten). Fehlt eine Datei,
    // faellt die Einheit ueber den FILE_LOAD_ERROR-Handler auf ihr statisches
    // Sprite bzw. die Platzhalterform zurueck (kein Crash).
    for (const atlas of Object.values(UNIT_ATLAS)) {
      this.load.atlas(atlas.key, atlas.png, atlas.json);
    }

    // Nur wenn eine Editor-Karte geladen wird (?map=...): die Boden-/Decal-
    // Texturen des Splat-Systems mitladen (sonst spart das Spiel den Download).
    if (new URLSearchParams(location.search).get("map")) enqueueTerrainLoads(this.load);

    // Audiodateien (Strang 7) vorladen: was schon im public/audio/ liegt, wird
    // dekodiert; fehlende werden ueber den FILE_LOAD_ERROR-Skip ignoriert. So
    // spielt eine korrekt benannte Datei spaeter ohne Code-Aenderung.
    const audioManifest = loadAudioManifest();
    preloadAudio(this, audioManifest, aktiveSprache(audioManifest.standardSprache));
  }

  create(): void {
    this.scene.start("game");
  }
}
