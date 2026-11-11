// Startseite "Orbit": großer Kreis in der Mitte, fünf Bereiche kreisen darum.
import { h, ersetze, euro, heute, datumLang, stundeBerlin, plural } from "../util.js";
import { icon } from "../icons.js";
import { state, onChange, heutigerTag, planStatus, planTage, offeneHeute, uploadsNeu, leadsFaellig, notizenNeu, stripeLaden } from "../store.js";
import { gmail } from "../gmail.js";

const SATELLITEN = [
  { id: "plan", label: "30-Tage-Plan", href: "#/plan", icon: "plan" },
  { id: "stripe", label: "Stripe", href: "#/stripe", icon: "stripe" },
  { id: "inbox", label: "Posteingang", href: "#/inbox", icon: "inbox" },
  { id: "leads", label: "Leads", href: "#/leads", icon: "leads" },
  { id: "notizen", label: "Notizen", href: "#/notizen", icon: "notizen" },
];

function info(id) {
  if (id === "plan") {
    const n = offeneHeute(state.ich === "Arthur" || state.ich === "Dean" ? state.ich : null);
    const status = planStatus();
    if (status === "vor") return { zahl: "", text: "Plan startet bald" };
    return { zahl: n > 0 ? String(n) : "", text: n > 0 ? `${n} offen heute` : "Heute alles erledigt" };
  }
  if (id === "stripe") {
    const s = state.stripe;
    if (s.status === "ok") return { zahl: euro(s.daten.umsatz?.monat ?? 0, s.daten.waehrung), text: "Umsatz im Monat", breit: true };
    if (s.status === "nicht_eingerichtet") return { zahl: "", text: "Noch nicht verbunden" };
    if (s.status === "fehler") return { zahl: "", text: "Nicht erreichbar" };
    return { zahl: "", text: "Umsatz im Monat" };
  }
  if (id === "inbox") {
    const u = uploadsNeu();
    const g = gmail.status === "ok" ? gmail.ungelesen : 0;
    const teile = [];
    if (u) teile.push(plural(u, "neuer Upload", "neue Uploads"));
    if (g) teile.push(`${g} ungelesen`);
    return { zahl: u + g > 0 ? String(u + g) : "", text: teile.join(" · ") || "Nichts Neues" };
  }
  if (id === "leads") {
    const n = leadsFaellig();
    return { zahl: n > 0 ? String(n) : "", text: n > 0 ? `${n} fällig` : plural(state.leads.length, "Lead", "Leads") };
  }
  if (id === "notizen") {
    const n = notizenNeu();
    return { zahl: n > 0 ? String(n) : "", text: n > 0 ? plural(n, "neue Notiz", "neue Notizen") : "Keine neuen Notizen" };
  }
  return { zahl: "", text: "" };
}

function begruessung() {
  const std = stundeBerlin();
  const gruss = std < 11 ? "Guten Morgen" : std < 18 ? "Guten Tag" : "Guten Abend";
  return state.ich === "Team" ? `${gruss}, Team` : `${gruss}, ${state.ich}`;
}

function tagText() {
  const t = heutigerTag();
  const n = planTage();
  if (t < 1) { const d = 1 - t; return d === 1 ? "Start morgen" : `Start in ${d} Tagen`; }
  if (t > n) return "Plan abgeschlossen";
  return `Tag ${t} von ${n}`;
}

export function mountOrbit(ctx) {
  // Kern
  const titel = h("h1", { class: "core-titel" }, "Art of Walks");
  const unter = h("p", { class: "core-unter" }, "Dashboard");
  const tagEl = h("p", { class: "core-tag" });
  const datumEl = h("p", { class: "core-datum" });
  const punkte = h("div", { class: "core-punkte", role: "img" });
  const gruss = h("p", { class: "core-gruss" });
  const kern = h("div", { class: "core" },
    h("div", { class: "core-in" }, titel, unter, h("div", { class: "core-regel", "aria-hidden": "true" }), tagEl, datumEl, punkte, gruss),
  );

  // Satelliten
  const satEls = SATELLITEN.map((s, i) => {
    const badge = h("span", { class: "badge", hidden: true });
    const sub = h("span", { class: "sat-sub" });
    const link = h("a", { class: "sat-link", href: s.href, dataset: { id: s.id } },
      h("span", { class: "sat-disc" }, icon(s.icon), badge),
      h("span", { class: "sat-label" }, h("span", { class: "sat-name" }, s.label), sub),
    );
    const li = h("li", { class: "sat", vars: { "--i": String(i) } }, h("div", { class: "sat-fix" }, h("div", { class: "sat-body" }, link)));
    return { s, li, badge, sub, link };
  });
  const ring = h("ul", { class: "orbit-ring", "aria-label": "Bereiche" }, satEls.map((x) => x.li));
  const bahn = h("div", { class: "orbit-bahn", "aria-hidden": "true" });
  const orbit = h("div", { class: "orbit" }, bahn, ring, kern);

  const fuss = h("footer", { class: "orbit-fuss" },
    h("p", { class: "orbit-wer" }, state.modus === "demo" ? h("span", { class: "demo-marke" }, "Demo") : null, h("span", null, `Angemeldet als ${state.ich}`)),
    h("div", { class: "orbit-fuss-aktionen" },
      h("a", { class: "btn btn-quiet btn-sm", href: "#/einstellungen" }, icon("gear"), "Einstellungen"),
      h("button", { type: "button", class: "btn btn-quiet btn-sm", onclick: () => ctx.abmelden() }, icon("logout"), "Abmelden"),
    ),
  );

  const el = h("div", { class: "seite seite-orbit" },
    h("main", { id: "main", tabindex: "-1", class: "orbit-buehne" }, orbit),
    fuss,
  );

  function fuelle() {
    const t = heutigerTag();
    const n = planTage();
    gruss.textContent = begruessung();
    tagEl.textContent = tagText();
    datumEl.textContent = datumLang(heute());
    punkte.setAttribute("aria-label", planStatus() === "laeuft" ? `Tag ${t} von ${n}` : tagText());
    ersetze(punkte, Array.from({ length: n }, (_, i) => h("span", { class: `pt${i + 1 < t ? " vorbei" : i + 1 === t ? " heute" : ""}` })));
    for (const x of satEls) {
      const i = info(x.s.id);
      x.badge.textContent = i.zahl;
      x.badge.hidden = !i.zahl;
      x.badge.classList.toggle("breit", !!i.breit);
      x.sub.textContent = i.text;
      x.link.setAttribute("aria-label", `${x.s.label}: ${i.zahl ? i.zahl + ", " : ""}${i.text}`);
    }
  }
  fuelle();
  stripeLaden().catch(() => {});

  const ab = onChange((art) => { if (["aufgaben", "notizen", "leads", "uploads", "stripe", "gmail", "alles", "tag"].includes(art)) fuelle(); });
  return { el, update() { fuelle(); }, destroy() { ab(); } };
}
