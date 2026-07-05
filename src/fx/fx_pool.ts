import type Phaser from "phaser";

// Pooling-Substrat fuer Effekt-Anzeigeobjekte. Recycelt GameObjects pro
// Schluessel (Sprite/Image/Graphics/Container ...), statt sie bei jedem Spawn neu
// zu erzeugen und zu zerstoeren -- entscheidend, wenn im Endkampf viele Treffer-
// und Tod-Effekte pro Sekunde feuern. Technik-agnostisch: der Handler liefert die
// Factory, der Pool haelt die Freiliste. Geparkte Objekte sind deaktiviert und
// unsichtbar; sie bleiben in der Display-List, kosten aber nichts.
export class FxPool {
  private readonly free = new Map<string, Phaser.GameObjects.GameObject[]>();
  private live = 0;

  /**
   * Holt ein Objekt aus dem Pool oder erzeugt eins ueber die Factory. Recycelte
   * Objekte werden reaktiviert (active + visible). Der Schluessel trennt die
   * Buckets nach Objekt-/Effektart (z. B. "placeholder", "spark", "ring").
   */
  acquire<T extends Phaser.GameObjects.GameObject>(key: string, factory: () => T): T {
    this.live++;
    const reused = this.free.get(key)?.pop() as T | undefined;
    if (reused) {
      reused.setActive(true);
      (reused as unknown as { setVisible?: (v: boolean) => void }).setVisible?.(true);
      return reused;
    }
    return factory();
  }

  /** Gibt ein Objekt in den Pool zurueck: deaktiviert, unsichtbar, geparkt. */
  release(key: string, obj: Phaser.GameObjects.GameObject): void {
    obj.setActive(false);
    (obj as unknown as { setVisible?: (v: boolean) => void }).setVisible?.(false);
    let bucket = this.free.get(key);
    if (!bucket) {
      bucket = [];
      this.free.set(key, bucket);
    }
    bucket.push(obj);
    this.live = Math.max(0, this.live - 1);
  }

  /** Diagnose fuer die Mess-Bruecke: ausgeliehene vs. geparkte Objekte. */
  stats(): { live: number; parked: number } {
    let parked = 0;
    for (const bucket of this.free.values()) parked += bucket.length;
    return { live: this.live, parked };
  }

  /** Zerstoert alle geparkten Objekte (Scene-Shutdown). */
  destroy(): void {
    for (const bucket of this.free.values()) for (const obj of bucket) obj.destroy();
    this.free.clear();
    this.live = 0;
  }
}
