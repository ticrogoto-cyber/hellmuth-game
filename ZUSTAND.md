# ZUSTAND

## Was funktioniert

- `npm install` laeuft erfolgreich auf GitHub Actions.
- `npx tsc --noEmit` laeuft ohne TypeScript-Fehler.
- `npm run build` liefert Exitcode 0.
- Die wichtigen Game-Dateien liegen im Repo `ticrogoto-cyber/hellmuth-game` auf Branch `main`.
- Das Projekt ist ein Phaser 3 + Vite + TypeScript Spiel mit den Fraktionen HELLMUTH und MODERAT.

## Was gefixt wurde

- Fehlende Build-Abhaengigkeiten aus dem Spielcode liegen im Repo: `game/data/` und `data/maps/`.
- `package-lock.json` ist vorhanden, damit Installationen reproduzierbar sind.
- `.gitignore` verhindert, dass `node_modules/` und `dist/` committed werden.
- Der Build wurde auf GitHub Actions validiert, ohne lokale Dateien auf einem Computer anzulegen.

## Hinweise

- `node_modules/` und `dist/` werden nicht committed.
- Der Validierungs-Workflow entfernt sich nach erfolgreichem Commit selbst.
