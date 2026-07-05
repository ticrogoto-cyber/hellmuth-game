# LICENSE_REVIEW

Lizenzlage von HELLMUTH. Stand: Fundament-Session.

## Engine und Werkzeuge

| Komponente | Lizenz | Bedeutung |
|---|---|---|
| Phaser 3 | MIT | Kommerzielle Nutzung, Modifikation, Vertrieb erlaubt. Lizenztext mitführen. |
| Vite | MIT | Build-Werkzeug, frei nutzbar. |
| TypeScript | Apache-2.0 | Sprache/Compiler, frei nutzbar. |
| Template `phaserjs/template-vite-ts` | MIT | Als Struktur-Referenz geprüft. Lizenz verifiziert. |

## Eigene Assets

- Alle Grafik-, Audio- und Text-Assets von HELLMUTH werden selbst erzeugt
  (Higgsfield für Bilder/Effekte/UI, 3D-Render-Turnaround für Einheiten).
- **Eigene Assets bleiben vollständiges Eigentum** des Projekts. Keine
  Fremdlizenzen, keine Stock-Verpflichtungen.

## Fremder Spielcode

- **Kein fremder Spielcode übernommen.** Die RTS-Systeme (Rendering, Kamera,
  Datenschicht, später Pathfinding/Kampf/KI) werden selbst gebaut.
- `igorski/rts` (MIT) darf ausschließlich als **Lernreferenz** für
  isometrisches Rendering gelesen werden. Es wird kein Code daraus kopiert.
  Falls jemals eine Übernahme erwogen wird, ist die MIT-Attribution zu wahren
  und hier zu dokumentieren.

## Bedeutung fürs kommerzielle Steam-Produkt

- MIT (Phaser, Vite, Template) und Apache-2.0 (TypeScript) sind für ein
  kommerzielles Produkt **unkritisch**: keine Copyleft-Pflichten, keine
  Offenlegung des eigenen Quellcodes.
- Pflicht bleibt nur, die MIT/Apache-Lizenztexte der genutzten Bibliotheken in
  einer Drittlizenz-Übersicht des Auslieferungsbuilds mitzuführen.
- Ein späterer Tauri-Wrapper (MIT/Apache-2.0) ändert daran nichts.

## Fazit

Lizenzlage sauber und kommerziell tragfähig. Zu pflegen: eine
Drittlizenz-Übersicht beim ersten Release-Build (TODO).
