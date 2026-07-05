// Minimaler Zufalls-Vertrag fuer die Simulation (Strang 8, Determinismus).
// Bewusst klein, damit Sim-Systeme Phaser-frei bleiben: injiziert wird in der
// Scene ein `Phaser.Math.RandomDataGenerator`, der diese Form strukturell
// erfuellt. NUR aus der Sim ziehen, nie aus Render/HUD -- sonst bricht die
// Reproduzierbarkeit (gleicher Seed -> gleicher Spielverlauf).
export interface SimRng {
  /** Gleichverteilt in [0, 1). */
  frac(): number;
  /** Zufaelliges Element des Arrays. */
  pick<T>(array: T[]): T;
}
