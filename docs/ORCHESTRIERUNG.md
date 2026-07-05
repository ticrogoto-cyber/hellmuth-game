# ORCHESTRIERUNG — Der Motor statt der Handbremse

Wie Ticro vom Mann hinter dem Wagen zum Kapitän auf Deck wird: mit WENIGEN Stellen
reden statt mit elf getrennten Code-Fenstern. Jeder Hebel ist an Claude Codes ECHTEN
heutigen Fähigkeiten gemessen (CLI, Docs, Container-Proof), nicht referiert. Wo im
Container nicht prüfbar, steht der genaue Schritt für Ticros Windows-Maschine.

**Gemessen, first-hand (Solutions im Container):** `claude` CLI v2.1.178; headless
`claude -p --output-format stream-json --verbose` läuft und liefert JSON mit `session_id`;
`git worktree add` läuft; SessionStart-/Stop-Hooks feuern; `.github/workflows/ci.yml`
(ci-fast) läuft per Push mit den Anti-Self-Green-Gates. **Solutions SELBST ist der
In-Context-Subagent-Koordinator** dieser Runde — mit der gemessenen Grenze: die Ergebnisse
der Subagenten füllen EIN Kontext-Budget.

**Mitgeliefert, getestet:** `tools/orchestrierung/orchestrate.mjs` (+ `.sh`) — der
Skript-Orchestrator; `tools/orchestrierung/dashboard.mjs` — das Kapitäns-Dashboard;
`tools/orchestrierung/session-start-auftrag.js` — der Auftrags-Hook. Alle drei sind im
Container gelaufen, nicht nur beschrieben.

---

# TEIL 1 — WAS HEUTE BAUBAR IST (priorisiert)

## L1 · Agent View (`claude agents`) — die Kapitäns-Tafel, NULL Bauaufwand, sofort

**Was:** Ein Befehl öffnet EINE Tafel über alle Hintergrund-Sessions: Status
(arbeitet / braucht Input / fertig), Name, aktuelle Aktivität, PR-Nummer. Neue Aufgabe =
Prompt tippen + Enter (startet je eine eigene Session). `Space` = Peek auf die letzte
Ausgabe einer Session UND dort antworten, OHNE sie zu öffnen. Das ist »elf Fenster → eine
Tafel«.

**Nimmt Ticro ab:** das Wechseln zwischen elf Fenstern; das Mit-Antworten auf Rückfragen
ohne Kontextverlust.

**Einrichtungsschritt:** im Repo `claude agents` starten, Prompts eintippen.
**Windows:** nativ (PowerShell/CMD), kein WSL. **Kosten/Grenze:** jede Session zählt voll
zur Quote (zehn parallel ≈ zehnfacher Verbrauch); es ist eine Tafel mit Peek, KEIN
Echtzeit-Dashboard aller elf gleichzeitig. **Prüfschritt Ticro:** `claude agents` ausführen,
zwei Prompts absetzen, mit `Space` peeken.

## L2 · Skript-Orchestrator — N headless Sessions je Worktree (BEWIESEN, mitgeliefert)

**Was:** Ein dummes Skript (KEIN LLM-Kontext, daher KEINE Kontext-Decke) spawnt N
headless `claude -p`-Sessions PARALLEL, jede isoliert in einem eigenen `git worktree` auf
eigenem Branch, sammelt deren JSON-Output in Dateien, druckt eine Übersicht, räumt auf.
Das ist die Maschine, die Ticro auch das Tippen abnimmt.

**Warum das skaliert (und der Subagent-Fan-out nicht):** Der Koordinator ist ein
Bash/Node-Skript ohne Kontext — er hält die Ergebnisse in Dateien, nicht im Kopf. Der
In-Context-Fan-out (was Solutions tut) endet an der Kontext-Decke des Hauptagenten:
elf Subagenten à 10–20 KB Zusammenfassung sprengen ein Fenster. Doc-belegt: Subagenten
»work within a single session«; headless-Sessions sind je »a full, independent Claude Code
conversation«.

**BEWEIS (Container, O3):** zwei Aufgaben, je eigener Worktree+Branch, beide Sessions
parallel gespawnt, beide schrieben ihre Ergebnisdatei selbst (`FERTIG_A`/`FERTIG_B`),
Übersicht gedruckt, sauber aufgeräumt — bash- UND node-Variante grün.

**Einrichtungsschritt:** in `tools/orchestrierung/orchestrate.mjs` das `TASKS`-Array
füllen (`ID|||PROMPT` je Zeile), dann `REPO=. node orchestrate.mjs`. Stellschrauben per
Env: `MODEL`, `MAX_TURNS`, `TIMEOUT_S`. Output je Aufgabe: `out_<ID>.txt` + volles
`session_<ID>.json` (enthält `session_id` für späteres `--resume`).

**Gemessene Stolpersteine (gelten überall):** headless `claude -p` braucht
`< /dev/null` (sonst 3 s stdin-Warten); `--permission-mode acceptEdits` statt
`--dangerously-skip-permissions` (Letzteres ist unter root geblockt — Container-Artefakt,
auf Ticros User-Account egal, `acceptEdits` reicht fürs Datei-Schreiben). **Windows:** die
**`.mjs`-node-Variante nehmen** (nativ, `child_process.spawn`); die `.sh`-Variante braucht
git-bash/WSL. **SDK nötig?** Nein — rohes `claude -p` reicht; `@anthropic-ai/claude-agent-sdk`
lohnt erst bei Resume-Logik/Tool-Hooks. **Prüfschritt Ticro:** auf seiner Maschine
`claude -p "schreib OK in out.txt" --permission-mode acceptEdits --output-format json`
und prüfen, dass es ohne Permission-Prompt durchläuft.

## L3 · Kapitäns-Dashboard — eine Tabelle: wer fertig/grün/wartet (BEWIESEN, mitgeliefert)

**Was:** `dashboard.mjs` listet alle `claude/*`-Branches mit letztem Commit (Zeit+Message),
ahead/behind der Integrationslinie, CI grün/rot, Status (wartet/gemergt) — Ticros
Sammel-Merge-Blick an EINER Stelle. Baut auf MAXI-3 H5 (Sammel-Merge-Fenster) auf, liefert
den fehlenden Code dazu.

**BEWEIS (Container, O6):** echte Ausgabe über 18 Branches; CI-Spalte gemessen
(`quirky-fermat`/`vigilant-mccarthy` rot, `sharp-newton` grün).

**Einrichtungsschritt:** `node tools/orchestrierung/dashboard.mjs --repo . --no-fetch` →
git-lokale Tabelle sofort. Für die CI-Spalte eine `ci.json` daneben legen (per `gh` oder
per Agent über GitHub-MCP `actions_list`), dann `--ci ci.json`. **Robust ohne Netz:**
Branch/Commit/ahead-behind. **Braucht Token:** nur die CI-Spalte. **Bleibt Wunsch:** ob
das Ergebnis GUT ist — grün heißt nur »schnelle Gates grün«. **Windows:** node, eine
Datei, keine Deps, plattformneutral.

## L4 · Auftrags-Datei + SessionStart-Hook — die Session holt sich den Auftrag selbst (BEWIESEN, mitgeliefert)

**Was:** Eine `AUFTRAG.md` im Repo; der Hook `session-start-auftrag.js` spielt sie (und
falls vorhanden `STATUS.md`) automatisch in jede frisch gestartete Session ein. Ticro
tippt den Auftrag nicht mehr ins Fenster — er legt eine Datei ab.

**BEWEIS (Container, O4):** eine frische headless-Session SAH den Auftrag (null Tool-Calls,
Inhalt aus der Injektion) UND führte ihn autonom aus (legte die geforderte Datei an, kein
Mensch tippte die Aufgabe).

**Einrichtungsschritt:** `.claude/settings.json` mit SessionStart-Hook auf
`node $CLAUDE_PROJECT_DIR/hellmuth/tools/orchestrierung/session-start-auftrag.js`;
`AUFTRAG.md` ins Repo-Root. **Windows:** der node-Hook ist plattformneutral (kein
git-bash). **Prüfschritt Ticro:** Hook eintragen, `AUFTRAG.md` schreiben, `claude` im Repo
starten, fragen »wurde dir ein Auftrag eingespielt?«. (Hinweis: Schreibzugriff auf
`.claude/settings.json` legt Ticro selbst an; im Solutions-Container ist dieser Pfad
harness-geschützt.)

## L5 · GitHub Issue→PR-Flow — der asynchrone Kapitän (claude-code-action)

**Was:** Die offizielle `anthropics/claude-code-action@v1` reagiert auf `@claude` in einem
Issue → startet eine Session → pusht Branch → öffnet PR → `ci.yml` gated automatisch →
Ticro reviewt an EINER PR-Seite Diff + CI-Status. Für Aufträge, die er von überall, asynchron
und mit Audit-Trail geben will (z. B. Vokabular-Einträge).

**Einrichtungsschritt:** `claude /install-github-app` (installiert App + speichert
`ANTHROPIC_API_KEY` als Secret), dann ein `.github/workflows/claude-agent.yml`
(`on: issue_comment/issues`, `uses: anthropics/claude-code-action@v1`). **Kosten:** 2000
Actions-Minuten/Monat frei, ~2 min/Issue für ci-fast. **Grenze:** der `render`-Job läuft
nicht pro PR (nur nächtlich/Knopfdruck) — für einen Render-Proof pro PR den
`pull_request`-Trigger ergänzen (kostet ~14 min/PR). **Windows:** OS-egal (läuft auf
GitHub-Linux). **Prüfschritt Ticro:** App installieren, Test-Issue »@claude test«,
PR + CI prüfen.

## L6 · Claude Code on the web — OS-unabhängige Cloud-Variante

**Was:** Sessions in Cloud-Linux-Containern, gestartet aus dem Browser (claude.ai/code) —
genau die Umgebung, in der diese Solutions-Runde lief. Sidebar listet die Sessions.
**Nimmt ab:** die lokale Windows-Reibung ganz (Browser ist der einzige Client; `npm ci`/
`vite build`/`pruefen.sh` laufen im Linux-Container). **Grenze:** eher »Tabs nebeneinander«
als die Peek-Tafel von Agent View. **Einrichtungsschritt:** Repo verbinden, Task tippen.

**Die Leiter, kurz:** Agent View (sofort, Tippen bleibt) → Skript-Orchestrator (auch das
Tippen weg) → Web/Cloud (Windows-Reibung weg) → GitHub-Flow (asynchron, Audit). Ticro
wählt je Aufgabe.

---

# TEIL 2 — DIE EHRLICHE KARTE VON AUGE UND BLICK

Der teuerste Fehler der Woche: GRÜN für GUT halten. Hier die harte Trennung, pro Baustelle:
was die Maschine WIRKLICH sieht (eng), was nur Ticro kann, und die Brücke.

| Baustelle | Maschinelles Auge (eng, real) | Nur Ticros Blick | Brücke |
|---|---|---|---|
| **HUD-Optik** | `hud_continuity.py` (Selbst-NCC-Harmonik gegen Zerhackung; Gradient-Fraktion gegen stumpfe Ecke) + `hud_soll_gate.py` (Anker/15-26px/Tönungs-FORMAT). **Auto-loop-bar.** | Ob das Ornament SCHÖN ist, die Fraktion stimmig wirkt, es zum Kanon passt. NCC misst Wiederholungstreue, nicht Geschmack. | Varianten-Modus: Code baut N Schnitte, das Auge filtert Müll, der Kontaktbogen legt die Überlebenden nebeneinander, Ticro wählt per Klick + `APPROVED.sha256`. |
| **Nebel-Sichtbarkeit** | `fog_depth_gate.py` sieht GENAU eins: »erstickt der Nebel die Lesbarkeit / kippt er in Deckkraft« (Alpha-Deckel p99≤0.55, Kanten-/Kontrast-Erhalt). **Auto-loop-bar — aber nur diese Frage.** | Ob der Nebel ATMOSPHÄRISCH/tief/schön wirkt. Der Gate kennt nur die Untergrenze (nicht zu opak), keine für »zu flach/langweilig«. **Lesbar ≠ atmosphärisch — genau hier kam der Wochen-Schmerz.** | Varianten-Modus PFLICHT: N strukturell verschiedene Nebel, Gate wirft die zu-opaken raus, die Überlebenden als Render-Set an Ticro. |
| **Spielgefühl** | `phys_smoke`/`impact_proof` (Hit-Stop als Frame-Folge), `sim_cdp_profile` (ms/Tick gegen 33 ms), `dyn_smoke` (Determinismus). **Proxys auto-loop-bar.** | Ob es sich GUT anfühlt, ob der Sog da ist. `held≥2` beweist, dass der Freeze VERDRAHTET ist, nicht dass er WUCHTIG ist. **Verdrahtet ≠ wuchtig, im Budget ≠ Sog.** | Varianten-Modus über Tuning-Profile (Hit-Stop-Dauer, Shake, Knockback), Proxys filtern (Determinismus + Budget), Ticro spielt und wählt. |

## Die eine Regel gegen »Grün = Gut«

**Grün ist eine Quittung, keine Note.** Jedes Gate meldet im Grün-Text seinen ENGEN
Befund (`fog_depth_gate` grün = »lesbar, Deckel gehalten«, NICHT »schöner Nebel«). Alles
jenseits des engen Befunds geht als Varianten-Set an Ticro — nie als stilles Grün. Und:
**ein Bereich ohne messendes Auge ist kein bestandener Bereich, sondern ein offener Posten
für Ticros Blick** (kodiert in den Anti-Self-Green-Gates: keine Referenz nie grün,
fehlender Render → FAIL statt SKIP).

## Die kritische Verdrahtungs-Lücke (der konkreteste Hebel dieser Runde)

Gemessen (O7): **die sehenden HUD- und Nebel-Augen EXISTIEREN als Code, feuern aber WEDER
in `ci-fast` (pro Push) NOCH im nächtlichen `render`-Job.** `ci-fast` fährt nur
grep/json/hash-Gates (kein gerendertes HUD-Pixel); der `render`-Job ruft nur
`dyn_smoke`/`fow_smoke`/`phys_smoke`/`editor_browser` (Terrain) — NICHT
`hud_dom_probe`+`hud_soll_gate`+`hud_continuity` und NICHT `fog_depth_gate`. Das
verlässlichste HUD-Auge (`hud_continuity.py`, §11/§12) läuft heute nur, wenn ein MENSCH
lokal `pruefen.sh` startet bzw. `editor_browser.mjs fogdepth` von Hand aufruft. Die
einzige CI-nahe HUD-Prüfung (96×54-Drift-MAE) ist zu grob, um Zerhackung zu sehen.

**Der Hebel:** die drei HUD-Schritte (`hud_dom_probe` → `hud_soll_gate` inkl.
`hud_continuity`) und `fog_depth_gate` in den nächtlichen `render`-Job von `ci.yml`
aufnehmen (Browser ist dort ohnehin installiert). Erst damit läuft die HUD-/Nebel-Schleife
autonom OHNE Ticro — das Auge ist gebaut, es muss nur gezündet werden. (Randbefund: das in
`HUD-KRISENSTAB.md:346` als »Prüfer 3« erwähnte `hud_coherence.py` existiert NICHT in
`tools/` — entweder von `beautiful-thompson` zurückholen oder den Verweis streichen.)

---

# TEIL 3 — WAS HEUTE NICHT GEHT, UND DIE GRÖSSTMÖGLICHE ANNÄHERUNG

## Nicht baubar: der vollautomatische Schwarm bis zum runden Spiel

Ein Schwarm, der sich selbst steuert, sieht, zusammenführt und ohne Ticro bis zum
fertigen, schönen Spiel loopt, ist heute NICHT baubar. Drei gemessene Gründe:

1. **Kein Auge für das Wesentliche.** Schönheit, Atmosphäre, Stimmigkeit, Sog sind nicht
   maschinell messbar (Teil 2). Ein Loop ohne Auge, der trotzdem grün meldet, ist genau
   die Falle, die die Woche kostete.
2. **Kontext-Tod (O4/O5, gemessen).** Auto-Kompaktierung ist nur ~25 % des Kontexts;
   `--resume` lädt das VOLLE alte Transkript zurück (20.945 vs 17.639 Tokens) — eine
   Session, die am Limit stirbt, resümt bereits am Limit. **`--resume` fängt den
   Loop-Tod NICHT auf.** Es gibt keine automatische Session-zu-Session-Übergabe.
3. **Unbeaufsichtigte Permissions.** Elf `--permission-mode acceptEdits`-Prozesse ohne
   Mensch im Loop bergen Fehlschleifen/Konflikte — beherrschbar nur mit Worktree-Isolation
   + Gates, nicht eliminierbar.

## Die größtmögliche Annäherung, die HEUTE geht

Kein Fantasie-Schwarm, sondern eine Leiter aus belegten Teilen:

- **Dispatch:** Skript-Orchestrator (L2) oder GitHub-Flow (L5) verteilt N Aufträge je
  Worktree/Branch — Ticro tippt nicht mehr in elf Fenster.
- **Isolation:** ein `git worktree` pro Session → keine kollidierenden Schreibzugriffe
  (gemessen).
- **Maschinelle Abnahme, wo ein Auge feuert:** `ci.yml` gated automatisch; nach der
  Verdrahtungs-Lücke (Teil 2) auch HUD-Zerhackung und Nebel-Deckkraft. Dort läuft der
  LOOP-BLAUPAUSE-Autoloop (Gate + Kritiker) OHNE Ticro.
- **Übergabe gegen den Kontext-Tod:** der Loop schreibt nach jeder grünen Teilstufe
  `STATUS.md` + committet; eine FRISCHE Session (kein `--resume`, sauberes Budget) liest
  sie via SessionStart-Hook (L4) und macht weiter. Das ist die EINZIGE robuste Antwort auf
  den Loop-Tod — nicht `--resume`.
- **Übersicht:** das Dashboard (L3) zeigt Ticro an einer Stelle, welcher Strang fertig/
  grün/wartet ist; Agent View (L1) zeigt die laufenden Sessions.
- **Geschmack ohne Fälschung:** wo nur Ticro urteilen kann (Schönheit/Atmosphäre/Gefühl),
  baut der Loop N Varianten hinter einem Schalter; die Augen filtern den Müll raus; Ticro
  wählt in einem Klick. Seine Entscheidung bleibt seine, sie wird nur billig.

**Das Ergebnis:** Ticro redet mit wenigen Stellen (Dashboard, Agent-View-Tafel, PR-Seite),
gibt Aufträge als Dateien/Issues, und urteilt nur noch über das, was eine Maschine
prinzipiell nicht sehen kann — bei jeder grünen Meldung mit der Gewissheit, dass »grün« nur
das Eine quittiert, was das Gate wirklich sieht. Das nimmt ihm den Großteil der Klicks und
lässt ihm das ganze Urteil. Mehr ist heute ehrlich nicht baubar; weniger muss er nicht
hinnehmen.

---

## Anhang · Die zwölf Mess-Stränge (je ein Satz)

O1: Subagent-Fan-out endet an der Kontext-Decke; Skript-Orchestrator skaliert (Docs).
O2: Agent View (`claude agents`) = die Kapitäns-Tafel; Web/Routines als Cloud-Varianten.
O3: Skript-Orchestrator BEWIESEN (2 Sessions, 2 Worktrees, parallel, gesammelt, aufgeräumt).
O4: SessionStart-Hook spielt AUFTRAG.md ein — frische Session führt autonom aus (bewiesen).
O5: `--resume` fängt den Kontext-Tod NICHT auf; nur STATUS.md + frische Session ist robust.
O6: Dashboard BEWIESEN (18 Branches, CI grün/rot gemessen).
O7: die sehenden HUD-/Nebel-Augen existieren als Code, sind aber NICHT in CI verdrahtet.
O8: GitHub Issue→PR-Flow real via `claude-code-action@v1` (`/install-github-app`).
O9: Auge-vs-Blick-Karte; »grün ist Quittung, keine Note«.
O10: CLI/Agent View/worktree nativ auf Windows; `.sh` braucht git-bash → node-Varianten; CI/Web OS-egal.
O11/O12: rohes `claude -p` reicht für Ticro; Agent SDK erst bei Resume-/Hook-Logik nötig.
