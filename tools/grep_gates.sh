#!/usr/bin/env bash
# grep_gates.sh — billige Debug-Marker-Gate (CI-billig, kein Browser).
#
# Dieselbe Pruefung, die pruefen.sh frueher inline fuhr: kein im Spielcode fest
# verdrahteter Debug-Marker (zonemap = true) darf einrutschen. Der rosa Zonemap-
# Pruefstand ist NUR ueber ?zonemap=1 zulaessig, nie als Default. Reine grep-
# Strecke -> taugt fuer die schnelle CI.
#
# Wird von pruefen.sh UND vom CI-Workflow (npm run gate:grep) gerufen — eine
# Wahrheit, keine zweite Pruef-Logik. Exit 1, wenn ein Marker fest aktiv ist.
set -uo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"   # hellmuth/

DBG2="$(grep -rnE 'zonemap *= *true' "$APP/src" --include='*.ts' 2>/dev/null || true)"
if [ -n "$DBG2" ]; then
  echo "zonemap fest aktiv: $(echo "$DBG2" | head -1 | cut -c1-80)"
  exit 1
fi
echo "zonemap nur via ?zonemap=1 (Default false, nicht erzwungen)"
exit 0
