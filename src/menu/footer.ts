import "./footer.css";
import { LINKS, openExternal } from "./menu_links";

// Footer-Komponente. Impressums-Leiste:
//   © 2026 Ticro Goto
//   kokos-und-zitrone.de | hellmuth-soda.de
// Buch-Link nur als CTA-Button (buildBookCta), nicht doppelt in der Link-Leiste.

interface FooterLink {
  label: string;
  url: string;
  key: string;
}

const FOOTER_LINKS: FooterLink[] = [
  { label: "kokos-und-zitrone.de", url: LINKS.kokos, key: "kokos" },
  { label: "hellmuth-soda.de", url: LINKS.soda, key: "soda" },
];

export function buildFooter(): HTMLElement {
  const footer = document.createElement("div");
  footer.className = "menu-footer";

  const copy = document.createElement("div");
  copy.className = "menu-footer-copy";
  copy.textContent = "© 2026 Ticro Goto · Hellmuth Development";
  footer.appendChild(copy);

  const links = document.createElement("nav");
  links.className = "menu-footer-links";
  links.setAttribute("aria-label", "Externe Links");
  FOOTER_LINKS.forEach((l, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "menu-footer-sep";
      sep.textContent = "|";
      links.appendChild(sep);
    }
    const a = document.createElement("a");
    a.href = l.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.dataset.link = l.key;
    a.textContent = l.label;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openExternal(l.url);
    });
    links.appendChild(a);
  });
  footer.appendChild(links);

  return footer;
}

/** Buch-Bestell-CTA als prominenter Gold-Outline-Button (Subagent #9).
 *  Link -> Amazon (LINKS.buch). Das Buch ist erschienen, daher "bestellen". */
export function buildBookCta(label = "Buch bestellen"): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = LINKS.buch;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.dataset.link = "buch-cta";
  a.className = "menu-footer-cta-btn";
  a.textContent = label;
  a.addEventListener("click", (e) => {
    e.preventDefault();
    openExternal(LINKS.buch);
  });
  return a;
}
