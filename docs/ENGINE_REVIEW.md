# ENGINE_REVIEW

Kurzbestätigung der technischen Grundentscheidung für HELLMUTH.

## Engine: Phaser 3

- **Phaser 3** ist unter der **MIT-Lizenz** veröffentlicht (Photon Storm).
  MIT erlaubt kommerzielle Nutzung, Modifikation und Vertrieb, solange der
  Lizenztext mitgeführt wird. Für ein späteres kommerzielles Steam-Produkt
  unkritisch.
- Browser-nativ, 2D, WebGL mit Canvas-Fallback. Passt zu einem isometrischen
  Browser-RTS ohne nativen Renderer.
- **Hinweis zur Version:** Das offizielle Template `phaserjs/template-vite-ts`
  (MIT, Lizenz verifiziert) setzt inzwischen auf Phaser **4.0.0**. Der Auftrag
  verlangt Phaser **3**. Daher wurde das Projekt manuell mit Phaser 3.x +
  Vite + TypeScript aufgesetzt, an der Struktur des Templates orientiert.

## Build: Vite + TypeScript

- **Vite** als Dev-Server (`npm run dev`) und Bundler (`npm run build`).
  Schneller HMR-Dev-Loop, ESBuild/Rollup unter der Haube.
- **TypeScript** für Typsicherheit in Datenschicht und Spielsystemen.

## Steam-Desktop später via Tauri

- Ein späterer Steam-Desktop-Build bleibt über einen **Tauri**-Wrapper möglich:
  Tauri bündelt das Web-Frontend in eine native Shell (Rust-Backend,
  System-WebView). Der Phaser-3-Build bleibt dabei unverändert das Frontend.
- In dieser Session wird dafür **nichts** gebaut. Nur als Option vermerkt.

## Fazit

Phaser 3 (MIT) + Vite + TypeScript ist die tragfähige, lizenzrechtlich saubere
Basis. Browser zuerst, Desktop/Steam später ohne Engine-Wechsel möglich.
