#!/usr/bin/env bash
# segnen.sh — Baseline-Segnung (HUD-KRISENSTAB.md §13 P1c / §14). NUR VON HAND,
# von Ticro, NACH Sicht des Kontaktbogens (proof/contact.html) auszufuehren.
#
# Schreibt das Hash-Manifest proof/baseline/APPROVED.sha256 ueber den AKTUELLEN
# Baseline-Stand und druckt den Segnungs-Commit-Befehl. Eine Code-Instanz fuehrt
# das NICHT aus — das waere Selbst-Segnung und genau der Trick, den baseline_gate
# und coupling_gate sperren. Das Skript existiert, damit der Mensch einen klaren,
# im Diff sichtbaren, signierten Akt hat statt eines stillen `cp`.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="$ROOT/proof/baseline"
cd "$BASE"

read -r -p "Kontaktbogen (proof/contact.html) gesichtet und Leisten/Ecken/Toenung ok? [ja/nein] " ok
[ "$ok" = "ja" ] || { echo "Abgebrochen. Nicht gesegnet ist der Default."; exit 1; }
read -r -p "Kuerzel (wer segnet): " who

{
  echo "# proof/baseline-Segnung — von Hand nach Sicht des Kontaktbogens."
  echo "# $(date -u +%Y-%m-%dT%H:%MZ)  HEAD $(git -C "$ROOT/.." rev-parse --short HEAD 2>/dev/null || echo '?')  von ${who:-?}"
  for p in moderat_default.png hellmuth_default.png; do
    [ -f "$p" ] && sha256sum "$p"
  done
} > APPROVED.sha256

echo "APPROVED.sha256 geschrieben. Jetzt als EIGENEN, ausschliesslichen Commit setzen:"
echo "  git add hellmuth/proof/baseline/APPROVED.sha256"
echo "  git commit -m 'BASELINE-ABNAHME: ${who:-Kuerzel} nach Kontaktbogen'"
