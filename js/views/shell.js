// Rahmen für alle Unteransichten: Kopfzeile (Terrakotta) mit Zurück und Bereichsnavigation.
import { h } from "../util.js";
import { icon } from "../icons.js";

export const BEREICHE = [
  { id: "plan", label: "30-Tage-Plan", kurz: "Plan", icon: "plan", href: "#/plan" },
  { id: "stripe", label: "Stripe", kurz: "Stripe", icon: "stripe", href: "#/stripe" },
  { id: "inbox", label: "Posteingang", kurz: "Posteingang", icon: "inbox", href: "#/inbox" },
  { id: "leads", label: "Leads", kurz: "Leads", icon: "leads", href: "#/leads" },
  { id: "notizen", label: "Notizen", kurz: "Notizen", icon: "notizen", href: "#/notizen" },
];

export function shell({ id, titel, inhalt, klasse = "" }) {
  const nav = h("nav", { class: "topnav", "aria-label": "Bereiche" },
    BEREICHE.map((b) => h("a", { href: b.href, class: "topnav-link", "aria-current": b.id === id ? "page" : null, title: b.label }, icon(b.icon), h("span", null, b.kurz))),
    h("a", { href: "#/einstellungen", class: "topnav-link topnav-gear", "aria-current": id === "einstellungen" ? "page" : null, title: "Einstellungen" }, icon("gear"), h("span", { class: "sr-only" }, "Einstellungen")),
  );
  const kopf = h("header", { class: "topbar" },
    h("div", { class: "topbar-in" },
      h("a", { class: "back", href: "#/", "aria-label": "Zurück zur Startseite" }, icon("back"), h("span", null, "Start")),
      h("h1", { class: "topbar-titel" }, titel),
      nav,
    ),
  );
  const main = h("main", { id: "main", tabindex: "-1", class: "inhalt" }, inhalt);
  const el = h("div", { class: `seite seite-${id} ${klasse}` }, kopf, main);
  return { el, main };
}

/** Segmentierte Auswahl (Tabs auf dem Handy) */
export function segmente(items, aktiv, onWahl, label) {
  const knoepfe = items.map((it) => {
    const b = h("button", { type: "button", role: "tab", class: "seg", dataset: { id: it.id }, "aria-selected": it.id === aktiv ? "true" : "false", tabindex: it.id === aktiv ? "0" : "-1", onclick: () => wahl(it.id) },
      it.label, it.zahl ? h("span", { class: "seg-zahl" }, it.zahl) : null);
    return b;
  });
  const el = h("div", { class: "segmente", role: "tablist", "aria-label": label }, knoepfe);
  function wahl(id, fokus = false) {
    for (const k of knoepfe) {
      const an = k.dataset.id === id;
      k.setAttribute("aria-selected", an ? "true" : "false");
      k.tabIndex = an ? 0 : -1;
      if (an && fokus) k.focus();
    }
    onWahl(id);
  }
  el.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const ids = items.map((i) => i.id);
    const cur = knoepfe.findIndex((k) => k.getAttribute("aria-selected") === "true");
    const n = (cur + (e.key === "ArrowRight" ? 1 : -1) + ids.length) % ids.length;
    wahl(ids[n], true);
    e.preventDefault();
  });
  return { el, wahl, setzeZahl(id, zahl) {
    const k = knoepfe.find((x) => x.dataset.id === id);
    if (!k) return;
    let z = k.querySelector(".seg-zahl");
    if (!zahl) { z?.remove(); return; }
    if (!z) { z = h("span", { class: "seg-zahl" }); k.append(z); }
    z.textContent = zahl;
  } };
}
