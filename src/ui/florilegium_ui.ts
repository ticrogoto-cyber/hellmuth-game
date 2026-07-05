import "./design_system.css";
import "./florilegium.css";
import {
  loadFlorilegium,
  imageUrl,
  audioUrl,
  CATEGORY_ORDER,
  CATEGORY_LABEL_DE,
} from "./florilegium_data";
import type {
  FlorilegiumEntry,
  FlorilegiumCategory,
  FlorilegiumLang,
} from "./florilegium_data";
import { isUnlocked, MockUnlockSource } from "./florilegium_unlock";
import type { UnlockSource } from "./florilegium_unlock";
import { FlorilegiumAudioPlayer, formatRemaining } from "./florilegium_audio";
import { LINKS, openExternal } from "../menu/menu_links";

// Florilegium-UI. Zwei Modi: fullview + overlay.
// Layout (Subagent #4-#7, #11):
//  - Header 48px: Wortmarke links, Breadcrumb mittig, Mini-Player + Prev/Next + Schliessen rechts
//  - Liste links: Suche oben, Kategorien-Akkordeon mit Zaehlern, ungelesen-Marker
//  - Detail: Bild Vollbreite oben (max 320px), Body in 65ch-Spalte, Audio sticky bottom
//  - Audio persistiert beim Eintrag-Wechsel (Mini-Player im Header)
//  - Tags klickbar -> Filter

export type FlorilegiumMode = "fullview" | "overlay";

export interface FlorilegiumOpts {
  unlock?: UnlockSource;
  lang?: FlorilegiumLang;
  mode?: FlorilegiumMode;
}

const ROOT_ID = "florilegium";
const READ_KEY = "florilegium.read.v1";

function loadReadSet(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}
function saveReadSet(s: Set<string>): void {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(Array.from(s)));
  } catch { /* still */ }
}

export class FlorilegiumUI {
  private readonly root: HTMLElement;
  private readonly lang: FlorilegiumLang;
  private readonly unlock: UnlockSource;
  private readonly player = new FlorilegiumAudioPlayer();
  private mode: FlorilegiumMode;
  private allEntries: FlorilegiumEntry[];
  private activeId: string | null = null;
  private activeTag: string | null = null;
  private searchQuery = "";
  private collapsed = new Set<FlorilegiumCategory>();
  private readSet = loadReadSet();
  private isOpen = false;
  private prevFocus: HTMLElement | null = null;

  constructor(opts: FlorilegiumOpts = {}) {
    this.lang = opts.lang ?? "de";
    this.unlock = opts.unlock ?? new MockUnlockSource();
    this.mode = opts.mode ?? "fullview";
    this.allEntries = loadFlorilegium(this.lang);

    this.root = document.createElement("div");
    this.root.id = ROOT_ID;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-label", "Florilegium");
    this.root.setAttribute("data-mode", this.mode);
    document.body.appendChild(this.root);

    this.player.onChange(() => this.refreshAudioBars());
    if (this.unlock.onChange) this.unlock.onChange(() => this.rerender());

    document.addEventListener("keydown", (e) => {
      if (!this.isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        this.close();
        return;
      }
      // Prev/Next durch die gefilterte Liste (Subagent #4, #5)
      if (e.key === "ArrowDown" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        this.step(1);
      } else if (e.key === "ArrowUp" || e.key === "k" || e.key === "K") {
        e.preventDefault();
        this.step(-1);
      } else if (e.key === " " || e.code === "Space") {
        // Leertaste = Audio toggle (Subagent #11)
        const tgt = e.target as HTMLElement | null;
        if (tgt && (tgt.tagName === "BUTTON" || tgt.tagName === "INPUT")) return;
        e.preventDefault();
        this.toggleAudioForActive();
      }
    });

    // Tab-Loop einfangen (A11y Must, Subagent #14): wenn Tab aus dem Modal
    // hinausgehen wuerde, springt der Fokus auf das erste/letzte fokussier-
    // bare Element zurueck.
    this.root.addEventListener("keydown", (e) => {
      if (!this.isOpen || e.key !== "Tab") return;
      const fs = Array.from(
        this.root.querySelectorAll<HTMLElement>(
          'button, a[href], input, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
      if (!fs.length) return;
      const first = fs[0];
      const last = fs[fs.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  // --- Public API ---------------------------------------------------------
  open(mode: FlorilegiumMode = this.mode, focusId?: string): void {
    this.mode = mode;
    this.root.setAttribute("data-mode", mode);
    this.root.classList.add("is-open");
    this.isOpen = true;
    this.prevFocus = document.activeElement as HTMLElement | null;
    const visible = this.filteredEntries();
    if (focusId && visible.some((e) => e.id === focusId)) {
      this.activeId = focusId;
    } else if (!this.activeId || !visible.some((e) => e.id === this.activeId)) {
      this.activeId = visible[0]?.id ?? null;
    }
    if (this.activeId) {
      this.readSet.add(this.activeId);
      saveReadSet(this.readSet);
    }
    this.rerender();
    // Initial-Fokus auf den Schliessen-Button (Subagent #14)
    const close = this.root.querySelector<HTMLButtonElement>(".flo-close");
    close?.focus();
  }

  close(): void {
    this.root.classList.remove("is-open");
    this.isOpen = false;
    this.player.stop();
    for (const cb of this.closeListeners) cb();
    this.prevFocus?.focus?.();
  }

  toggle(mode: FlorilegiumMode = this.mode): void {
    this.isOpen ? this.close() : this.open(mode);
  }
  isVisible(): boolean {
    return this.isOpen;
  }

  private readonly closeListeners: Array<() => void> = [];
  onClose(cb: () => void): void {
    this.closeListeners.push(cb);
  }

  // --- Filter -------------------------------------------------------------
  private filteredEntries(): FlorilegiumEntry[] {
    return this.allEntries
      .filter((e) => isUnlocked(e.unlock, this.unlock))
      .filter((e) => {
        if (!this.activeTag) return true;
        return e.tags.includes(this.activeTag);
      })
      .filter((e) => {
        if (!this.searchQuery) return true;
        const q = this.searchQuery.toLowerCase();
        return (
          e.title.toLowerCase().includes(q) ||
          e.tags.some((t) => t.includes(q))
        );
      });
  }

  private step(dir: 1 | -1): void {
    const list = this.filteredEntries();
    if (!list.length) return;
    const i = Math.max(0, list.findIndex((e) => e.id === this.activeId));
    const next = (i + dir + list.length) % list.length;
    this.activeId = list[next].id;
    this.readSet.add(this.activeId);
    saveReadSet(this.readSet);
    this.rerender();
  }

  private toggleAudioForActive(): void {
    const e = this.filteredEntries().find((x) => x.id === this.activeId);
    if (!e) return;
    const np = this.player.nowPlaying();
    if (np && np.entryId === e.id) {
      this.player.toggle();
    } else {
      void this.player.play({
        entryId: e.id,
        entryTitle: e.title,
        url: audioUrl(e, this.lang),
      });
    }
  }

  // --- Render -------------------------------------------------------------
  private rerender(): void {
    const visible = this.filteredEntries();
    const current = visible.find((e) => e.id === this.activeId) ?? visible[0] ?? null;

    this.root.innerHTML = "";
    if (this.mode === "overlay") {
      const scrim = document.createElement("div");
      scrim.className = "flo-scrim";
      scrim.addEventListener("click", () => this.close());
      this.root.appendChild(scrim);
    }

    const frame = document.createElement("div");
    frame.className = "flo-frame";
    frame.appendChild(this.renderHeader(visible, current));
    frame.appendChild(this.renderList(visible, current));
    frame.appendChild(this.renderDetail(current));
    this.root.appendChild(frame);
  }

  private renderHeader(
    visible: FlorilegiumEntry[],
    current: FlorilegiumEntry | null,
  ): HTMLElement {
    const h = document.createElement("header");
    h.className = "flo-header";

    const mark = document.createElement("div");
    mark.className = "flo-mark";
    mark.textContent = "Florilegium";
    h.appendChild(mark);

    const crumb = document.createElement("div");
    crumb.className = "flo-breadcrumb";
    if (current) {
      const cat = document.createElement("span");
      cat.textContent = CATEGORY_LABEL_DE[current.category];
      const sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "›";
      const ent = document.createElement("span");
      ent.className = "crumb-entry";
      ent.textContent = current.title;
      crumb.appendChild(cat);
      crumb.appendChild(sep);
      crumb.appendChild(ent);
    } else {
      crumb.textContent = "";
    }
    h.appendChild(crumb);

    // Mini-Player (Subagent #11)
    const mp = document.createElement("div");
    mp.className = "flo-mini-player";
    const np = this.player.nowPlaying();
    if (np) {
      mp.classList.add("is-active");
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "flo-mini-player-toggle";
      toggle.setAttribute(
        "aria-label",
        this.player.playing() ? "Helmuth pausieren" : "Helmuth fortsetzen",
      );
      toggle.textContent = this.player.playing() ? "▮▮" : "▶";
      toggle.addEventListener("click", () => this.player.toggle());
      mp.appendChild(toggle);
      const title = document.createElement("div");
      title.className = "flo-mini-player-title";
      title.textContent = np.entryTitle;
      title.addEventListener("click", () => {
        // Klick auf den Titel springt zurueck zum laufenden Eintrag.
        if (this.filteredEntries().some((e) => e.id === np.entryId)) {
          this.activeId = np.entryId;
          this.rerender();
        }
      });
      title.style.cursor = "pointer";
      mp.appendChild(title);
    }
    h.appendChild(mp);

    const nav = document.createElement("div");
    nav.className = "flo-nav";
    const idx = current ? visible.findIndex((e) => e.id === current.id) : -1;
    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "‹";
    prev.setAttribute("aria-label", "Voriger Eintrag");
    prev.disabled = idx <= 0;
    prev.addEventListener("click", () => this.step(-1));
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "›";
    next.setAttribute("aria-label", "Naechster Eintrag");
    next.disabled = idx < 0 || idx >= visible.length - 1;
    next.addEventListener("click", () => this.step(1));
    nav.appendChild(prev);
    nav.appendChild(next);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "flo-close";
    close.textContent = "Schliessen";
    close.setAttribute("aria-label", "Florilegium schliessen");
    close.addEventListener("click", () => this.close());

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "var(--space-xs)";
    right.appendChild(nav);
    right.appendChild(close);
    h.appendChild(right);

    return h;
  }

  private renderList(
    visible: FlorilegiumEntry[],
    current: FlorilegiumEntry | null,
  ): HTMLElement {
    const aside = document.createElement("aside");
    aside.className = "flo-list";
    aside.setAttribute("aria-label", "Eintragsliste");

    // Suchfeld (Subagent #5)
    const search = document.createElement("div");
    search.className = "flo-search";
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = this.activeTag
      ? `Filter: #${this.activeTag} — suchen …`
      : "Suchen …";
    input.value = this.searchQuery;
    input.setAttribute("aria-label", "Florilegium durchsuchen");
    input.addEventListener("input", () => {
      this.searchQuery = input.value;
      this.rerender();
      // Fokus auf das Suchfeld zurueckgeben
      const fresh = this.root.querySelector<HTMLInputElement>(".flo-search input");
      fresh?.focus();
      fresh?.setSelectionRange(input.value.length, input.value.length);
    });
    search.appendChild(input);
    if (this.activeTag) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "flo-tag is-active";
      clear.style.marginTop = "var(--space-xs)";
      clear.textContent = `#${this.activeTag} ×`;
      clear.setAttribute("aria-label", `Tag-Filter aufheben: ${this.activeTag}`);
      clear.addEventListener("click", () => {
        this.activeTag = null;
        this.rerender();
      });
      search.appendChild(clear);
    }
    aside.appendChild(search);

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "flo-empty";
      empty.textContent = this.searchQuery
        ? `Keine Treffer fuer „${this.searchQuery}".`
        : this.activeTag
          ? `Kein Eintrag mit #${this.activeTag}.`
          : "Noch keine Eintraege freigeschaltet.";
      aside.appendChild(empty);
      return aside;
    }

    // Gruppen pro Kategorie -- Akkordeon mit Zaehler (Subagent #5)
    const byCat = new Map<FlorilegiumCategory, FlorilegiumEntry[]>();
    for (const e of visible) {
      const list = byCat.get(e.category) ?? [];
      list.push(e);
      byCat.set(e.category, list);
    }
    for (const cat of CATEGORY_ORDER) {
      const list = byCat.get(cat);
      if (!list || !list.length) continue;
      const sec = document.createElement("section");
      sec.className = "flo-cat";
      sec.dataset.cat = cat;
      const expanded = !this.collapsed.has(cat);
      sec.setAttribute("aria-expanded", String(expanded));

      const head = document.createElement("button");
      head.type = "button";
      head.className = "flo-cat-head";
      head.setAttribute("aria-expanded", String(expanded));
      const chev = document.createElement("span");
      chev.className = "flo-cat-chevron";
      chev.setAttribute("aria-hidden", "true");
      chev.textContent = "▾";
      const label = document.createElement("span");
      label.textContent = CATEGORY_LABEL_DE[cat];
      const count = document.createElement("span");
      count.className = "flo-cat-count";
      count.textContent = String(list.length);
      head.appendChild(chev);
      head.appendChild(label);
      head.appendChild(count);
      head.addEventListener("click", () => {
        if (this.collapsed.has(cat)) this.collapsed.delete(cat);
        else this.collapsed.add(cat);
        this.rerender();
      });
      sec.appendChild(head);

      const items = document.createElement("div");
      items.className = "flo-cat-items";
      for (const e of list) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "flo-item" +
          (current?.id === e.id ? " is-active" : "") +
          (this.readSet.has(e.id) ? "" : " is-unread");
        btn.dataset.id = e.id;
        btn.setAttribute("aria-current", current?.id === e.id ? "true" : "false");
        const dot = document.createElement("span");
        dot.className = "flo-item-dot";
        dot.setAttribute("aria-hidden", "true");
        const label2 = document.createElement("span");
        label2.textContent = e.title;
        btn.appendChild(dot);
        btn.appendChild(label2);
        btn.addEventListener("click", () => {
          this.activeId = e.id;
          this.readSet.add(e.id);
          saveReadSet(this.readSet);
          this.rerender();
        });
        items.appendChild(btn);
      }
      sec.appendChild(items);
      aside.appendChild(sec);
    }
    return aside;
  }

  private renderDetail(entry: FlorilegiumEntry | null): HTMLElement {
    const main = document.createElement("main");
    main.className = "flo-detail";
    main.setAttribute("aria-live", "polite");
    if (!entry) {
      const empty = document.createElement("div");
      empty.className = "flo-empty";
      empty.textContent = "Kein Eintrag gewaehlt.";
      main.appendChild(empty);
      return main;
    }

    // Bild Vollbreite oben (Subagent #7)
    const imgWrap = document.createElement("div");
    imgWrap.className = "flo-detail-image";
    const img = document.createElement("img");
    img.src = imageUrl(entry);
    img.alt = "";
    img.addEventListener("error", () => imgWrap.setAttribute("data-missing", "1"));
    imgWrap.appendChild(img);
    main.appendChild(imgWrap);

    // Body in 65ch-Spalte
    const body = document.createElement("div");
    body.className = "flo-detail-body";
    main.appendChild(body);

    // Meta-Eyebrow ueber Titel
    const meta = document.createElement("div");
    meta.className = "flo-detail-meta";
    meta.textContent = CATEGORY_LABEL_DE[entry.category];
    body.appendChild(meta);

    const title = document.createElement("h2");
    title.className = "flo-detail-title";
    title.textContent = entry.title;
    body.appendChild(title);

    // Tags unter dem Titel (klickbar = Filter)
    if (entry.tags.length) {
      const tags = document.createElement("div");
      tags.className = "flo-detail-tags";
      for (const t of entry.tags) {
        const tag = document.createElement("button");
        tag.type = "button";
        tag.className = "flo-tag" + (this.activeTag === t ? " is-active" : "");
        tag.dataset.tag = t;
        tag.textContent = `#${t}`;
        tag.setAttribute("aria-pressed", String(this.activeTag === t));
        tag.addEventListener("click", () => {
          this.activeTag = this.activeTag === t ? null : t;
          this.rerender();
        });
        tags.appendChild(tag);
      }
      body.appendChild(tags);
    }

    const text = document.createElement("p");
    text.className = "flo-detail-text";
    text.textContent = entry.text;
    body.appendChild(text);

    if (entry.citation.source) {
      const rule = document.createElement("hr");
      rule.className = "flo-detail-rule";
      rule.setAttribute("aria-hidden", "true");
      body.appendChild(rule);
      const cite = document.createElement("div");
      cite.className = "flo-detail-citation";
      const link = document.createElement("a");
      link.href = LINKS.buch;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.addEventListener("click", (ev) => {
        ev.preventDefault();
        openExternal(LINKS.buch);
      });
      link.textContent = entry.citation.source;
      cite.appendChild(link);
      const page = document.createElement("span");
      page.textContent =
        entry.citation.page != null ? `S. ${entry.citation.page}` : "";
      cite.appendChild(page);
      body.appendChild(cite);
    }

    main.appendChild(this.renderAudio(entry));
    return main;
  }

  // --- Audio-Bar ----------------------------------------------------------
  private audioRow: HTMLElement | null = null;
  private renderAudio(entry: FlorilegiumEntry): HTMLElement {
    const row = document.createElement("div");
    row.className = "flo-audio";
    this.audioRow = row;
    this.fillAudioBar(entry);
    return row;
  }
  private fillAudioBar(entry: FlorilegiumEntry): void {
    if (!this.audioRow) return;
    const row = this.audioRow;
    row.innerHTML = "";
    const url = audioUrl(entry, this.lang);
    const np = this.player.nowPlaying();
    const isMine = np?.entryId === entry.id;
    const playing = isMine && this.player.playing();

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "flo-audio-btn";
    btn.textContent = playing ? "▮▮ Pause" : "▶ Vorlesen";
    btn.dataset.action = "audio-toggle";
    btn.addEventListener("click", () => {
      if (isMine) {
        this.player.toggle();
      } else {
        void this.player.play({
          entryId: entry.id,
          entryTitle: entry.title,
          url,
        });
      }
    });
    row.appendChild(btn);

    // Fortschritt (Goldlinie + Klick-Seek, Subagent #11)
    const progress = document.createElement("div");
    progress.className = "flo-audio-progress";
    progress.setAttribute("role", "progressbar");
    const p = isMine ? this.player.progressFor(entry.id) : null;
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.setAttribute(
      "aria-valuenow",
      String(p ? Math.round(p.fraction * 100) : 0),
    );
    const fill = document.createElement("div");
    fill.className = "flo-audio-progress-fill";
    fill.style.width = p ? `${(p.fraction * 100).toFixed(1)}%` : "0%";
    progress.appendChild(fill);
    progress.addEventListener("click", (ev) => {
      const r = progress.getBoundingClientRect();
      const f = (ev.clientX - r.left) / r.width;
      if (isMine) {
        this.player.seekFraction(f);
      } else {
        void this.player.play({ entryId: entry.id, entryTitle: entry.title, url }).then(() => {
          this.player.seekFraction(f);
        });
      }
    });
    row.appendChild(progress);

    const time = document.createElement("div");
    time.className = "flo-audio-time";
    time.textContent = p && p.remainingSec > 0 ? formatRemaining(p.remainingSec) : "";
    row.appendChild(time);

    const status = document.createElement("span");
    status.className = "flo-audio-status";
    status.setAttribute("aria-live", "polite");
    status.textContent = playing
      ? "Helmuth spricht"
      : isMine
        ? "pausiert"
        : "Helmuth-Stimme";
    row.appendChild(status);
  }
  /** Beim Player-Tick die sichtbare Audio-Leiste UND den Mini-Player updaten. */
  private refreshAudioBars(): void {
    const visible = this.filteredEntries();
    const current = visible.find((e) => e.id === this.activeId);
    if (current) this.fillAudioBar(current);
    // Mini-Player im Header: nur neu rendern, wenn sich der „now playing"
    // -Eintrag aendert oder play/pause kippt. Wir rerender hier sparsam --
    // nur die Mini-Player-Klassen und den Toggle-Pfeil.
    const mp = this.root.querySelector<HTMLElement>(".flo-mini-player");
    if (!mp) return;
    const np = this.player.nowPlaying();
    if (!np) {
      mp.classList.remove("is-active");
      mp.innerHTML = "";
      return;
    }
    mp.classList.add("is-active");
    const toggle = mp.querySelector<HTMLButtonElement>(".flo-mini-player-toggle");
    if (toggle) {
      toggle.textContent = this.player.playing() ? "▮▮" : "▶";
      toggle.setAttribute(
        "aria-label",
        this.player.playing() ? "Helmuth pausieren" : "Helmuth fortsetzen",
      );
    }
    const title = mp.querySelector<HTMLElement>(".flo-mini-player-title");
    if (title) title.textContent = np.entryTitle;
    // Wenn das mini noch leer war, neu rendern
    if (!toggle || !title) this.rerender();
  }
}

export function mountFlorilegium(opts: FlorilegiumOpts = {}): FlorilegiumUI {
  return new FlorilegiumUI(opts);
}
