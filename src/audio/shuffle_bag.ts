// Shuffle-Bag: zieht jedes Element genau einmal, bevor neu gemischt wird, und
// vermeidet den Sofort-Wiederholer ueber die Nachfuell-Grenze. Phaser-frei und
// rein (testbar). Genutzt fuer Bark-/Varianten-Auswahl gegen
// Wiederholungs-Ermuedung.

export class ShuffleBag<T> {
  private readonly items: T[];
  private readonly rng: () => number;
  private rest: T[] = [];
  private letztes: T | undefined;

  constructor(items: T[], rng: () => number = Math.random) {
    this.items = [...items];
    this.rng = rng;
  }

  get groesse(): number {
    return this.items.length;
  }

  zieh(): T | undefined {
    if (this.items.length === 0) return undefined;
    if (this.items.length === 1) return this.items[0];
    if (this.rest.length === 0) this.rest = [...this.items];
    let i = Math.floor(this.rng() * this.rest.length);
    if (i >= this.rest.length) i = this.rest.length - 1;
    // Kein Sofort-Wiederholer direkt nach dem Nachfuellen.
    if (this.rest[i] === this.letztes && this.rest.length > 1) {
      i = (i + 1) % this.rest.length;
    }
    const v = this.rest.splice(i, 1)[0];
    this.letztes = v;
    return v;
  }
}
