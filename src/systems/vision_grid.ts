import { GRID_COLS, GRID_ROWS } from "../util/world";
import type { Owner } from "../data/loader";

// Fog-of-War-Sichtgitter EINER Fraktion (FoW Paket A, der Keystone).
// Phaser-frei (Disziplin wie spatial_grid.ts / target_priority.ts): reine
// Daten/Mathematik, deterministisch (kein RNG, nur ganzzahlige Stempel).
//
// Zwei flache Uint8-Felder, Index ZWINGEND i = row*GRID_COLS + col
// (deckungsgleich flow_field.ts / pathfinding.key()):
//   visible:  additiver Zaehler -- Anzahl deckender Sichtquellen pro Kachel.
//   explored: sticky Bit -- jemals gesehen (Persistenz / Gedaechtnis).
// Uint8 genuegt: der Deckel 255 wird real nie erreicht (Sicherung trotzdem da).
//
// READ-ONLY-VERTRAG (der Keystone): NUR update() schreibt. Render/KI/Minimap
// lesen ausschliesslich ueber isVisible / wasExplored / visibilityAt /
// visionCountAt; die Felder selbst sind privat. Die drei Zustaende werden lazy
// in O(1) abgeleitet (kein zweiter Pass): visible>0 -> sichtbar (2);
// visible==0 && explored -> gedimmt-erinnert (1); sonst schwarz (0).

/** Minimaler Vertrag einer Sichtquelle. Unit und Building erfuellen ihn
 *  strukturell (col/row/owner aus GridEntity, `sicht`-Getter aus der Entity). */
export interface VisionSource {
  readonly col: number;
  readonly row: number;
  readonly owner: Owner;
  /** Aufgeloester Sichtradius in Kacheln (Datenwert oder Kanon-Default). */
  readonly sicht: number;
  /** Tote Quelle (hp<=0) darf keine Sicht mehr spenden. Optional; fehlt/false =
   *  lebendig. Unit/Building erben das aus GridEntity.isDead (`entity.ts:109`);
   *  Aufrufer, die keine Lebensbedingung haben, koennen es weglassen. Guard:
   *  Tote koennen zwischen ihrem Todes-Tick und `removeUnit`/`removeBuilding`
   *  im Quellen-Array haengen -- ohne dieses Feld wuerde ihre Sicht-Blase noch
   *  gestempelt und einen Feind faelschlich durch den Nebel sichtbar halten. */
  readonly isDead?: boolean;
}

export class VisionGrid {
  private readonly visible: Uint8Array;
  private readonly explored: Uint8Array;
  private readonly cols: number;
  private readonly rows: number;

  /** Stempel-Generation: bumpt bei jedem update()/clear(). Render-Konsumenten
   *  (Schleier, Paket B) backen nur neu, wenn sich der Wert geaendert hat. */
  public version = 0;

  constructor(cols = GRID_COLS, rows = GRID_ROWS) {
    this.cols = cols;
    this.rows = rows;
    this.visible = new Uint8Array(cols * rows);
    this.explored = new Uint8Array(cols * rows);
  }

  /**
   * EINZIGER Schreibpfad (nur Code3, im Stempel-Pass von GameState.updateVision).
   * Naiver Vollstempel pro Tick: visible -> 0, dann jede Quelle DES BESITZERS
   * kreisfoermig ++ stempeln und explored |= 1. Gebaeude sind ebenso Quellen
   * wie Einheiten (Building erbt GridEntity col/row/owner). Die Stempel-
   * Reihenfolge ist egal (Addition und OR sind kommutativ) -> deterministisch.
   * @param persist  true (Kanon-Default): explored bleibt sticky (Gedaechtnis).
   *                 false: explored wird je Tick geleert -> folgt strikt visible
   *                 (kein Gedaechtnis, verlassene Bereiche werden wieder schwarz).
   */
  update(
    units: Iterable<VisionSource>,
    buildings: Iterable<VisionSource>,
    owner: Owner,
    persist: boolean,
  ): void {
    this.visible.fill(0);
    if (!persist) this.explored.fill(0);
    // Alive-Guard (Vision-Bug-Fix): eine tote Quelle darf keinen Feind mehr
    // durch den Nebel decken. combat_system.kill ruft removeUnit synchron auf,
    // aber zwischen `applyDamage` (hp=0) und dem naechsten updateVision kann
    // eine Quelle mit `isDead === true` im Array haengen (deferred cleanup,
    // K-Kill-Hotkey, aussersynchroner Todes-Pfad). Ohne diesen Guard stempelt
    // sie ihre Sichtblase noch einen Tick weiter -- klassisches »Feind im
    // Nebel sichtbar«-Symptom.
    for (const u of units) if (u.owner === owner && !u.isDead) this.stamp(u.col, u.row, u.sicht);
    for (const b of buildings) if (b.owner === owner && !b.isDead) this.stamp(b.col, b.row, b.sicht);
    this.version++;
  }

  /** Kreisfoermiger Stempel (euklidische Scheibe) um (col,row) mit Radius r.
   *  Out-of-bounds-Kacheln werden weggeklemmt (kein Wrap). */
  private stamp(col: number, row: number, r: number): void {
    if (r < 0) r = 0;
    const r2 = r * r;
    const c0 = col - r < 0 ? 0 : col - r;
    const c1 = col + r >= this.cols ? this.cols - 1 : col + r;
    const y0 = row - r < 0 ? 0 : row - r;
    const y1 = row + r >= this.rows ? this.rows - 1 : row + r;
    for (let y = y0; y <= y1; y++) {
      const dy = y - row;
      const base = y * this.cols;
      for (let x = c0; x <= c1; x++) {
        const dx = x - col;
        if (dx * dx + dy * dy > r2) continue;
        const i = base + x;
        if (this.visible[i] < 255) this.visible[i]++;
        this.explored[i] = 1;
      }
    }
  }

  private inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  /** Aktuell von mindestens einer Quelle gedeckt? OOB -> false. */
  isVisible(col: number, row: number): boolean {
    return this.inBounds(col, row) && this.visible[row * this.cols + col] > 0;
  }

  /** Jemals gesehen (Persistenz)? OOB -> false. */
  wasExplored(col: number, row: number): boolean {
    return this.inBounds(col, row) && this.explored[row * this.cols + col] === 1;
  }

  /** Drei Zustaende in O(1): 2 sichtbar, 1 gedimmt-erinnert, 0 schwarz. OOB -> 0. */
  visibilityAt(col: number, row: number): 0 | 1 | 2 {
    if (!this.inBounds(col, row)) return 0;
    const i = row * this.cols + col;
    if (this.visible[i] > 0) return 2;
    return this.explored[i] === 1 ? 1 : 0;
  }

  /** Roher Deckungszaehler (mehrfach gedeckt -> >1; z. B. Detektor-Logik). OOB -> 0. */
  visionCountAt(col: number, row: number): number {
    return this.inBounds(col, row) ? this.visible[row * this.cols + col] : 0;
  }

  /** Harter Reset (Matchstart): Sicht UND Gedaechtnis leeren. visible wird
   *  ohnehin pro Tick neu gestempelt; explored bleibt sonst sticky. */
  clear(): void {
    this.visible.fill(0);
    this.explored.fill(0);
    this.version++;
  }
}
