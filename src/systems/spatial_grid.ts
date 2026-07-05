// Uniformes Raster-Hashing fuer Nachbarschaftsabfragen in Weltpixeln.
// Phaser-frei (Disziplin wie target_priority.ts), reine Daten/Mathematik.
//
// Ersetzt die O(N^2)-Allpaar-Schleifen (separate, acquire, nearestEnemy,
// Projektil-Treffer): statt jede Einheit gegen jede zu pruefen, liefert das
// Gitter pro Abfrage nur die KANDIDATEN aus dem Ringfenster. Der exakte Test
// bleibt beim Aufrufer -> keine quadratische Last.
//
// FLACHES Zellen-Array (kein Map-Hashing): cache-freundlich, da pro Frame viele
// Raumabfragen (Vermeidung + Kampf + Projektile) auf dieselbe Struktur gehen.
// Die Welt liegt in positiven Iso-Pixeln; out-of-bounds wird auf die Randzelle
// geklemmt (wie clampTile). Zwei Nutzungsarten: dynamisch (Einheiten, pro Tick
// `rebuild`) und statisch (Gebaeude/Nodes, inkrementell `insert`/`remove`).

export interface HasPos {
  x: number;
  y: number;
}

export class SpatialGrid<T extends HasPos> {
  private readonly cell: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly buckets: T[][];

  /**
   * @param cell   Zellkante in Weltpixeln (z. B. PIXELS_PER_TILE).
   * @param worldW,worldH  Weltausdehnung in Pixeln (grosszuegig; die 36er-Karte
   *               in Iso liegt klar darunter). Bestimmt die feste Array-Groesse.
   */
  constructor(cell: number, worldW = 8192, worldH = 6144) {
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(worldW / cell));
    this.rows = Math.max(1, Math.ceil(worldH / cell));
    this.buckets = new Array(this.cols * this.rows);
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
  }

  private idx(x: number, y: number): number {
    let cx = Math.floor(x / this.cell);
    let cy = Math.floor(y / this.cell);
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  /** Voller Neuaufbau (dynamisches Gitter, O(N)). Bucket-Arrays werden
   *  wiederverwendet (kein GC-Druck), nur ihr Inhalt geleert. */
  rebuild(items: Iterable<T>): void {
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i].length = 0;
    for (const it of items) this.buckets[this.idx(it.x, it.y)].push(it);
  }

  /** Einzelnes Objekt einfuegen (statisches Gitter). */
  insert(it: T): void {
    this.buckets[this.idx(it.x, it.y)].push(it);
  }

  /** Einzelnes Objekt entfernen (statisches Gitter). */
  remove(it: T): void {
    const b = this.buckets[this.idx(it.x, it.y)];
    const i = b.indexOf(it);
    if (i >= 0) b.splice(i, 1);
  }

  clear(): void {
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i].length = 0;
  }

  /**
   * Kandidaten im Ringfenster um (x,y) mit Radius r (Weltpixel). Liefert ALLE
   * Objekte der ueberlappten Zellen, NICHT distanzgefiltert -- der exakte Test
   * bleibt beim Aufrufer. `out` wird wiederverwendet (gegen GC). `perBucketCap`:
   * Soft-Cap je Zelle gegen den Randfall "viele auf einer Kachel".
   */
  queryRadius(x: number, y: number, r: number, out: T[] = [], perBucketCap = Infinity): T[] {
    out.length = 0;
    const cell = this.cell;
    const rc = Math.ceil(r / cell);
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const x0 = Math.max(0, cx - rc);
    const x1 = Math.min(this.cols - 1, cx + rc);
    const y0 = Math.max(0, cy - rc);
    const y1 = Math.min(this.rows - 1, cy + rc);
    for (let gy = y0; gy <= y1; gy++) {
      const base = gy * this.cols;
      for (let gx = x0; gx <= x1; gx++) {
        const b = this.buckets[base + gx];
        const n = b.length < perBucketCap ? b.length : perBucketCap;
        for (let i = 0; i < n; i++) out.push(b[i]);
      }
    }
    return out;
  }
}
