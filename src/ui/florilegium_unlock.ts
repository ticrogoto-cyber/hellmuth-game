// Unlock-Brueecke zwischen Florilegium-UI und Spielzustand. Schema-Vertrag
// (Code9, schema.json): unlock.type ist eines von always|build|kill|research,
// unlock.trigger ist eine String-ID oder null.
//
// Bis der State-Manager echte Unlock-Events liefert, lebt hier ein Mock-
// Adapter: `always` ist sichtbar, alles andere zaehlt nur durch wenn die ID
// im Set `unlocked` steht. Die UI ruft `isUnlocked(entry)` und ignoriert die
// Quelle. Sobald Spielzustand-Hooks existieren (z. B. ein Event "build:done"),
// werden sie hier eingelesen -- die UI bleibt unveraendert.

import type { FlorilegiumEntry, FlorilegiumUnlock } from "./florilegium_data";

export interface UnlockSource {
  /** Liefert `true`, wenn der Trigger (Gebauede/Einheit/Tech) erfuellt ist. */
  has(triggerType: "build" | "kill" | "research", trigger: string): boolean;
  /** Listener fuer Aenderungen, damit die UI neu rendern kann. Default: no-op. */
  onChange?(listener: () => void): void;
}

export class MockUnlockSource implements UnlockSource {
  private readonly state = new Set<string>();
  private readonly listeners: Array<() => void> = [];
  constructor(initial: Iterable<string> = []) {
    for (const k of initial) this.state.add(k);
  }
  key(triggerType: "build" | "kill" | "research", trigger: string): string {
    return `${triggerType}:${trigger}`;
  }
  has(triggerType: "build" | "kill" | "research", trigger: string): boolean {
    return this.state.has(this.key(triggerType, trigger));
  }
  set(triggerType: "build" | "kill" | "research", trigger: string): void {
    this.state.add(this.key(triggerType, trigger));
    for (const l of this.listeners) l();
  }
  clear(): void {
    this.state.clear();
    for (const l of this.listeners) l();
  }
  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }
}

/** Auswertung pro Eintrag. `always` ist immer sichtbar. */
export function isUnlocked(unlock: FlorilegiumUnlock, src: UnlockSource): boolean {
  if (unlock.type === "always") return true;
  if (!unlock.trigger) return false;
  return src.has(unlock.type, unlock.trigger);
}

/** Filter ueber eine Eintragsliste, stabil. */
export function filterUnlocked(
  entries: readonly FlorilegiumEntry[],
  src: UnlockSource,
): FlorilegiumEntry[] {
  return entries.filter((e) => isUnlocked(e.unlock, src));
}
