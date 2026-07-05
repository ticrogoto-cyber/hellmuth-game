// Direktionaler Mehr-Clip-Animator fuer Einheiten mit gerendertem Atlas
// (render_unit.py -> pack_atlas.py). Phaser-leichtgewichtig: bindet an einen
// vorhandenen Sprite und waehlt pro Frame Clip + Richtung + Frame.
//
// FUSSGLEIT-FIX (Fable): Walk ist In-Place gerendert (Root-Motion gestrippt),
// die Engine bewegt die Einheit. Die Walk-Abspielrate ist deshalb an die real
// zurueckgelegte Pixelstrecke gekoppelt (dist / stridePx), nicht an die Zeit.
// Die uebrigen Clips (idle/attack/harvest/death) laufen zeitbasiert. Frames pro
// Clip werden zur Laufzeit aus dem Atlas gezaehlt, damit neue Einheiten ohne
// Code-Aenderung laufen (nur Dateien + UNIT_ATLAS-Eintrag).

import type { UnitAtlas, UnitClip } from "../data/sprites";

// Bewegung unter dieser Pixel-Schwelle pro Frame gilt als Stillstand. Exportiert,
// damit Unit.updateAnimation dieselbe Schwelle nutzt (eine Wahrheit, Strang 7).
export const MOVING_EPS = 0.05;

// Frame-Dauer des death-Clips (ms). Geteilt mit death_fx -> eine Konstante.
export const DEATH_FRAME_MS = 70;

// Mindest-Wind-up des attack-Clips (ms, Physik A4): der Treffer feuert erst nach
// so viel Anticipation ab Clip-Start -> sichtbares Ausholen, unabhaengig von der
// Framezahl. Deterministisch (fixe dt-Basis). PLATZHALTER -- Ticro tariert.
export const ATTACK_WINDUP_MS = 120;

// Min-Verweildauer je Clip (ms): ein neuer Clip wird erst akzeptiert, wenn der
// aktuelle so lange lief -> kein idle<->walk / attack<->idle-Flackern (Strang 7).
const MIN_DWELL: Record<string, number> = { idle: 120, walk: 100, attack: 200 };
// Doppelschwelle: walk->idle erst nach so langem Stillstand (Anti-Flacker).
const WALK_EXIT_STOP_MS = 80;

// EINZIGER visuell zu kalibrierender Knopf: Versatz zwischen Bildschirm-
// Bewegungswinkel (atan2, y nach unten) und der Atlas-Richtung 000. Default 0;
// nach dem ersten Sichttest ggf. in 45deg-Schritten justieren. DIR_FLIP kehrt
// den Drehsinn um, falls der Held spiegelverkehrt einlenkt.
const DIR_OFFSET_RAD = -Math.PI / 2;
const DIR_FLIP = -1; // empirisch kalibriert: N->deg000, S->deg180, O->deg270, W->deg090

// Zeitbasis (ms je Frame) fuer nicht-distanzgekoppelte Clips.
const CLIP_MS_PER_FRAME: Record<string, number> = {
  idle: 120,
  attack: 70,
  harvest: 90,
  death: DEATH_FRAME_MS,
};
const DEFAULT_MS_PER_FRAME = 100;

function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}
function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Bildschirm-Bewegungsvektor -> Richtungsindex [0..dirs). */
export function dirIndex(dx: number, dy: number, dirs: number): number {
  const a = DIR_FLIP * Math.atan2(dy, dx) + DIR_OFFSET_RAD;
  let i = Math.round((a / (2 * Math.PI)) * dirs) % dirs;
  if (i < 0) i += dirs;
  return i;
}

/**
 * Mehr-Clip-Zustandsanimator. Der Aufrufer (Unit.updateAnimation) bestimmt pro
 * Frame den gewuenschten Clip aus dem Spielzustand; dieser Animator setzt
 * Richtung und Frame. Generisch: jede Einheit nutzt dieselbe Maschine, nur die
 * Atlanten unterscheiden sich.
 */
export class UnitAnimator {
  private dir = 0; // zuletzt eingenommene Richtung (bleibt im Stillstand)
  private clip: UnitClip = "idle";
  private cyclePos = 0; // walk: [0,1) distanzgekoppelt
  private clipMs = 0; // zeitbasierte Clips
  private clipHoldMs = 0; // wie lange der aktuelle Clip schon laeuft (Min-Dwell)
  private stoppedMs = 0; // wie lange dist<=EPS (Doppelschwelle walk->idle)
  private deathHeld = false; // death einmal gespielt -> letzter Frame haelt
  private frameName: string;
  private readonly counts: Record<string, number> = {};
  // Hit-Frame-Bindung (Strang 5/7): Schaden faellt am Treffer-Frame des
  // attack-Clips, nicht am Cooldown-Tick. Edge-Detect ueber prevAttackFrame.
  private hitFrameIdx = 1;
  private hitArmed = true; // scharf bis zum Treffer-Frame, dann bis zum Ruecklauf entwaffnet
  private hitFired = false;

  constructor(
    private readonly sprite: Phaser.GameObjects.Sprite,
    private readonly atlas: UnitAtlas,
    /** Weltpixel pro vollem Walk-Zyklus (Fussgleit-Kalibrierung). */
    private readonly stridePx: number,
  ) {
    // Frames pro Clip aus dem geladenen Atlas zaehlen (datengetrieben).
    const scene = sprite.scene;
    const re = new RegExp(`^${atlas.stem}_([a-z]+)_(\\d{3})_(\\d{2})$`);
    const names = scene.textures.exists(atlas.key)
      ? scene.textures.get(atlas.key).getFrameNames()
      : [];
    for (const n of names) {
      const m = re.exec(n);
      if (!m) continue;
      const clip = m[1];
      const f = parseInt(m[3], 10) + 1;
      if (f > (this.counts[clip] ?? 0)) this.counts[clip] = f;
    }
    // Hit-Frame-Index: datengetrieben pro attack-Clip, Default Mitte des Clips.
    this.hitFrameIdx = atlas.hitFrame ?? Math.max(1, Math.floor((this.counts.attack ?? 2) / 2));
    this.frameName = this.buildFrame("idle", 0, 0);
    if (scene.textures.exists(atlas.key)) this.sprite.setFrame(this.frameName);
  }

  /** True GENAU in dem Update, in dem der attack-Clip seinen hitFrame
   *  ueberschreitet (Edge). Der Kampf bucht dann den Schaden -> Sichtsync. */
  public attackHitFired(): boolean {
    return this.hitFired;
  }

  /** Zuletzt gesetzter Frame-Schluessel (fuer das eingefrorene Leichen-Sprite). */
  public currentFrame(): string {
    return this.frameName;
  }
  public currentClip(): UnitClip {
    return this.clip;
  }
  /** Aktuelle Richtung als Grad (Vielfaches von 360/dirs). */
  public deg(): number {
    return Math.round(this.dir * (360 / this.atlas.dirs));
  }
  /** Gibt es Frames fuer diesen Clip im Atlas? */
  public has(clip: UnitClip): boolean {
    return (this.counts[clip] ?? 0) > 0;
  }

  /**
   * Ein Darstellungs-Update.
   * @param dx,dy  im letzten Frame zurueckgelegte Weltpixel
   * @param desired gewuenschter Clip aus dem Einheitenzustand
   * @param dtMs   Frame-Delta in ms
   * @param faceX,faceY optionaler Blickvektor (z. B. zum Angriffsziel), wenn die
   *               Einheit steht, aber in eine Richtung schauen soll.
   */
  public update(
    dx: number,
    dy: number,
    desired: UnitClip,
    dtMs: number,
    faceX = 0,
    faceY = 0,
  ): void {
    const dist = Math.hypot(dx, dy);

    // Richtung: Bewegung > Blickvektor > letzte Richtung halten.
    if (dist > MOVING_EPS) this.dir = dirIndex(dx, dy, this.atlas.dirs);
    else if (faceX !== 0 || faceY !== 0)
      this.dir = dirIndex(faceX, faceY, this.atlas.dirs);

    // Clip-Fallback: fehlt der gewuenschte Clip, sinnvoll ersetzen.
    let clip = desired;
    if (!this.has(clip))
      clip = dist > MOVING_EPS && this.has("walk") ? "walk" : "idle";

    // Zeit-/Stillstandszaehler fuer die Min-Dwell-Hysterese.
    this.clipHoldMs += dtMs;
    if (dist <= MOVING_EPS) this.stoppedMs += dtMs;
    else this.stoppedMs = 0;

    // Min-Dwell: Clipwechsel erst, wenn der aktuelle Clip lange genug lief
    // (death sofort). walk->idle zusaetzlich erst nach kurzem Stillstand ->
    // kein idle<->walk / attack<->idle-Flackern.
    if (clip !== this.clip && clip !== "death") {
      const heldEnough = this.clipHoldMs >= (MIN_DWELL[this.clip] ?? 0);
      const walkToIdle = this.clip === "walk" && clip === "idle";
      if (!heldEnough || (walkToIdle && this.stoppedMs < WALK_EXIT_STOP_MS)) {
        clip = this.clip; // Wechsel verschieben, aktuellen Clip halten
      }
    }

    // Clipwechsel -> Zeitbasis, Halte-Timer und Once-Status zuruecksetzen.
    // attack->attack ist KEIN Wechsel -> clipMs laeuft weiter (kein Zucken).
    if (clip !== this.clip) {
      this.clip = clip;
      this.clipMs = 0;
      this.clipHoldMs = 0;
      this.deathHeld = false;
      if (clip !== "walk") this.cyclePos = 0;
    }

    const count = Math.max(1, this.counts[clip] ?? 1);
    let frame: number;
    if (clip === "walk") {
      this.cyclePos =
        (this.cyclePos + (dist > MOVING_EPS ? dist / this.stridePx : 0)) % 1;
      frame = Math.min(count - 1, Math.floor(this.cyclePos * count));
    } else if (clip === "death") {
      // LIVE-Todespfad ist death_fx.playDeathThenCorpse (kill -> EVT_UNIT_DIED);
      // updateAnimation waehlt "death" NICHT (die Einheit ist dann entfernt).
      // Dieser Zweig bleibt generisch (Einmal-Abspielen), aktuell nicht erreicht.
      if (!this.deathHeld) {
        this.clipMs += dtMs;
        frame = Math.floor(
          this.clipMs / (CLIP_MS_PER_FRAME.death ?? DEFAULT_MS_PER_FRAME),
        );
        if (frame >= count - 1) {
          frame = count - 1;
          this.deathHeld = true;
        }
      } else {
        frame = count - 1;
      }
    } else {
      // idle / attack / harvest: zeitbasiert in Schleife.
      this.clipMs += dtMs;
      const mpf = CLIP_MS_PER_FRAME[clip] ?? DEFAULT_MS_PER_FRAME;
      frame = Math.floor(this.clipMs / mpf) % count;
    }

    // Hit-Frame + Wind-up (Strang 5/7 + Physik A4): der Treffer feuert genau
    // einmal pro attack-Durchlauf -- wenn der Clip den hitFrame erreicht UND
    // mindestens ATTACK_WINDUP_MS Anticipation ab Clip-Start gelaufen sind. So
    // sitzt das EVT_UNIT_HIT auf dem Treffer-Frame (nicht am Clip-Anfang) und es
    // gibt ein sichtbares Ausholen, egal wie viele Frames der Clip hat. Re-armt,
    // sobald der Clip vor den hitFrame zurueckspult; bei Clipwechsel scharf.
    if (clip === "attack") {
      if (frame < this.hitFrameIdx) this.hitArmed = true;
      const fire = this.hitArmed && frame >= this.hitFrameIdx && this.clipMs >= ATTACK_WINDUP_MS;
      this.hitFired = fire;
      if (fire) this.hitArmed = false;
    } else {
      this.hitFired = false;
      this.hitArmed = true;
    }

    this.frameName = this.buildFrame(clip, this.dir, frame);
    this.sprite.setFrame(this.frameName);
  }

  /** True, sobald ein einmaliger death-Clip seinen letzten Frame haelt. */
  public isDeathHeld(): boolean {
    return this.deathHeld;
  }

  private buildFrame(clip: UnitClip, dir: number, frame: number): string {
    const deg = Math.round(dir * (360 / this.atlas.dirs));
    return `${this.atlas.stem}_${clip}_${pad3(deg)}_${pad2(frame)}`;
  }
}
