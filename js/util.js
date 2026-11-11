// Hilfsfunktionen: DOM, Datum (Zeitzone Berlin), Formate, Meldungen.
export const config = window.AOW_CONFIG || {};
const TZ = config.zeitzone || "Europe/Berlin";

/* ---------- Uhr (im Demo-Modus verschiebbar) ---------- */
let uhrVersatz = 0;
let heuteFix = null;
export function setzeUhr({ versatzMs = 0, heute = null } = {}) {
  uhrVersatz = versatzMs;
  heuteFix = heute;
}
export const jetzt = () => new Date(Date.now() + uhrVersatz);

const fmtTag = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtUhr = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const fmtStd = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", hour12: false });

/** "YYYY-MM-DD" in Berlin */
export const datumBerlin = (d) => fmtTag.format(d);
export const heute = () => heuteFix || datumBerlin(jetzt());
export const stundeBerlin = () => (parseInt(String(fmtStd.format(jetzt())).replace(/\D/g, ""), 10) || 0) % 24;

const utc = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export const addTage = (s, n) => new Date(utc(s) + n * 864e5).toISOString().slice(0, 10);
export const diffTage = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);

const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WT_LANG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const wtIndex = (s) => new Date(utc(s)).getUTCDay();
export const wochentag = (s) => WT[wtIndex(s)];
/** "Di 10.11." */
export const datumKurz = (s) => `${WT[wtIndex(s)]} ${s.slice(8, 10)}.${s.slice(5, 7)}.`;
/** "10.11." */
export const datumTM = (s) => `${s.slice(8, 10)}.${s.slice(5, 7)}.`;
/** "10.11.2026" */
export const datumVoll = (s) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
/** "Dienstag, 10. November" */
export const datumLang = (s) => `${WT_LANG[wtIndex(s)]}, ${Number(s.slice(8, 10))}. ${MONATE[Number(s.slice(5, 7)) - 1]}`;

export const zeit = (iso) => fmtUhr.format(new Date(iso));
export function zeitRelativ(iso) {
  const d = datumBerlin(new Date(iso));
  const h = heute();
  if (d === h) return `heute ${zeit(iso)}`;
  if (d === addTage(h, -1)) return `gestern ${zeit(iso)}`;
  return `${datumKurz(d)} ${zeit(iso)}`;
}
export function tagLabel(d) {
  const h = heute();
  if (d === h) return "Heute";
  if (d === addTage(h, -1)) return "Gestern";
  return datumLang(d);
}

/* ---------- Plan-Tage ---------- */
export const planStart = () => config.planStart || "2026-11-04";
export const planTage = () => config.planTage || 30;
export const tagNr = (datum) => diffTage(planStart(), datum) + 1;
export const datumVonTag = (n) => addTage(planStart(), n - 1);
export const planEnde = () => datumVonTag(planTage());

/* ---------- Formate ---------- */
export function euro(cent, waehrung) {
  const w = String(waehrung || "eur").toUpperCase();
  const n = Number(cent || 0);
  const ganz = n % 100 === 0;
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: w, minimumFractionDigits: ganz ? 0 : 2, maximumFractionDigits: 2 }).format(n / 100);
  } catch {
    return `${(n / 100).toFixed(2)} ${w}`;
  }
}
export const plural = (n, eins, mehr) => `${n} ${n === 1 ? eins : mehr}`;
export const leer = (v) => v == null || String(v).trim() === "";
export const sauber = (v) => { const t = String(v ?? "").trim(); return t === "" ? null : t; };
export const nurHttp = (u) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; } };

/** Kopfzeile und Rest eines Aufgabentexts (Rest wird aufklappbar). */
export function teileText(text) {
  const t = String(text || "").trim();
  const nl = t.indexOf("\n");
  if (nl > -1) return { kopf: t.slice(0, nl).trim(), rest: t.slice(nl + 1).trim() };
  if (t.length <= 110) return { kopf: t, rest: "" };
  const m = t.slice(0, 120).match(/^(.{30,119}?[.:;!?])\s/);
  if (m) return { kopf: m[1], rest: t.slice(m[1].length).trim() };
  const cut = t.slice(0, 100).replace(/\s+\S*$/, "");
  return { kopf: cut + " …", rest: t };
}

/* ---------- DOM ---------- */
const PROPS = new Set(["value", "checked", "disabled", "hidden", "selected", "readOnly", "required", "multiple"]);
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "vars") for (const [n, val] of Object.entries(v)) el.style.setProperty(n, val);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  anhaengen(el, kids);
  return el;
}
export function anhaengen(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const leeren = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };
export const ersetze = (el, ...kids) => { leeren(el); return anhaengen(el, kids); };

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------- Meldungen ---------- */
export function toast(text, art = "info") {
  const box = document.getElementById("toasts");
  if (!box) return;
  const el = h("div", { class: `toast toast-${art}` }, text);
  box.append(el);
  setTimeout(() => el.classList.add("weg"), art === "fehler" ? 5200 : 3200);
  setTimeout(() => el.remove(), art === "fehler" ? 5700 : 3700);
}

export function fehlerText(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e || "");
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) return "Keine Verbindung. Bitte Internet prüfen.";
  if (/jwt|token/i.test(m) && /expired|invalid/i.test(m)) return "Die Anmeldung ist abgelaufen. Bitte neu anmelden.";
  if (/row-level security|permission denied/i.test(m)) return "Dafür fehlt die Berechtigung.";
  return m || "Unbekannter Fehler.";
}

/** Zweistufiger Knopf: erster Klick fragt nach, zweiter führt aus (nach 3 s zurück). */
export function zweistufig(btn, aktion, frage = "Wirklich?") {
  const normal = [...btn.childNodes].map((n) => n.cloneNode(true));
  const label = btn.getAttribute("aria-label");
  let timer = null;
  const zurueck = () => {
    clearTimeout(timer);
    btn.classList.remove("bestaetigen");
    btn.replaceChildren(...normal.map((n) => n.cloneNode(true)));
    if (label) btn.setAttribute("aria-label", label);
    btn.dataset.schritt = "";
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (btn.dataset.schritt === "2") { zurueck(); aktion(); return; }
    btn.dataset.schritt = "2";
    btn.classList.add("bestaetigen");
    btn.replaceChildren(document.createTextNode(frage));
    btn.setAttribute("aria-label", `${frage} Zum Bestätigen noch einmal drücken`);
    timer = setTimeout(zurueck, 5000);
  });
  btn.addEventListener("blur", () => { if (btn.dataset.schritt === "2") setTimeout(zurueck, 150); });
  return btn;
}

export const istLokal =() => ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
