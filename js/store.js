// Zentraler Zustand + Aktionen. Die Daten holt ein "Backend" (Supabase oder Demo),
// beide haben dieselbe Schnittstelle. Aktionen aktualisieren sofort (optimistisch)
// und machen bei Fehlern rückgängig.
import { config, heute, jetzt, datumBerlin, addTage, planStart, planTage, planEnde, tagNr, toast, fehlerText, sauber } from "./util.js";

export const state = {
  modus: "real", // real | demo
  ich: null, // Arthur | Dean | Team
  email: "",
  plantage: [],
  aufgaben: [],
  notizen: [],
  leads: [],
  einstellungen: {},
  team: [],
  uploads: [],
  fehler: {}, // Tabelle → Meldung, wenn das Laden scheiterte
  geladen: false,
  verbindung: "offline", // live | offline | demo
  stripe: { status: "leer", daten: null, meldung: "", am: 0 },
};

export const PERSONEN = ["Arthur", "Dean"];
export const STUFEN = ["Neu", "Kontaktiert", "Antwort", "Probevideo angefragt", "Probevideo geliefert", "Angebot", "Kunde", "Ruht"];
export const KANAELE = ["Brief", "LinkedIn", "Telefon", "Besuch", "Mail", "Website", "Empfehlung", "Sonstiges"];

let backend = null;
export const getBackend = () => backend;
const subs = new Set();
export function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }
export function emit(art) { for (const fn of [...subs]) { try { fn(art); } catch (e) { console.error(e); } } }

export function setBackend(b) {
  backend = b;
  state.modus = b.modus;
}

/* ---------- Gesehen-Marken (Zähler "neu seit letztem Besuch") ---------- */
const demoGesehen = {};
export const gesehen = {
  get(k) {
    if (state.modus === "demo") return demoGesehen[k] || "";
    try { return localStorage.getItem(`aow_gesehen_${state.email}_${k}`) || ""; } catch { return ""; }
  },
  set(k, iso = jetzt().toISOString()) {
    if (state.modus === "demo") { demoGesehen[k] = iso; return; }
    try { localStorage.setItem(`aow_gesehen_${state.email}_${k}`, iso); } catch { /* egal */ }
  },
};
export function demoGesehenSetzen(k, iso) { demoGesehen[k] = iso; }

/* ---------- Laden ---------- */
const SCHLUESSEL = {
  dash_plantage: "plantage",
  dash_aufgaben: "aufgaben",
  dash_notizen: "notizen",
  dash_leads: "leads",
  dash_team: "team",
  upload_anfragen: "uploads",
};
const ID_SPALTE = { dash_team: "email", dash_einstellungen: "schluessel" };

function sortiere(key) {
  const a = state[key];
  if (!Array.isArray(a)) return;
  if (key === "notizen") a.sort((x, y) => (x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : Number(x.id) - Number(y.id)));
  else if (key === "aufgaben") a.sort((x, y) => (x.datum < y.datum ? -1 : x.datum > y.datum ? 1 : x.sortierung - y.sortierung || Number(x.id) - Number(y.id)));
  else if (key === "leads") a.sort((x, y) => (y.created_at || "").localeCompare(x.created_at || ""));
  else if (key === "uploads") a.sort((x, y) => (y.created_at || "").localeCompare(x.created_at || ""));
  else if (key === "plantage") a.sort((x, y) => x.tag - y.tag);
}

export async function ladeTabelle(table) {
  const key = table === "dash_einstellungen" ? "einstellungen" : SCHLUESSEL[table];
  try {
    const rows = await backend.list(table);
    if (table === "dash_einstellungen") state.einstellungen = Object.fromEntries(rows.map((r) => [r.schluessel, r.wert]));
    else { state[key] = rows; sortiere(key); }
    delete state.fehler[table];
  } catch (e) {
    console.warn("Laden fehlgeschlagen:", table, e);
    state.fehler[table] = fehlerText(e);
  }
  emit(key);
}

export async function ladeAlles() {
  const tabellen = ["dash_plantage", "dash_aufgaben", "dash_notizen", "dash_leads", "dash_einstellungen", "dash_team", "upload_anfragen"];
  await Promise.all(tabellen.map(ladeTabelle));
  state.geladen = true;
  emit("alles");
}

/** Realtime-Ereignis oder Nachladen */
export function auswirken(table, art, neu, alt) {
  const key = SCHLUESSEL[table];
  if (!key) return;
  const id = ID_SPALTE[table] || "id";
  const liste = state[key];
  if (art === "DELETE") {
    const i = liste.findIndex((r) => r[id] === alt?.[id]);
    if (i > -1) liste.splice(i, 1);
  } else if (neu) {
    const i = liste.findIndex((r) => r[id] === neu[id]);
    if (i > -1) liste[i] = { ...liste[i], ...neu };
    else liste.push(neu);
  }
  sortiere(key);
  emit(key);
}

function ersetzeZeile(key, row, id = "id") {
  const liste = state[key];
  const i = liste.findIndex((r) => r[id] === row[id]);
  if (i > -1) liste[i] = { ...liste[i], ...row };
  else liste.push(row);
  sortiere(key);
}

/* ---------- Plan: Abfragen ---------- */
export const heutigerTag = () => tagNr(heute());
/** Tag, den der Plan "heute" zeigt (vor Start: 1, nach Ende: letzter Tag) */
export function fokusTag() {
  const t = heutigerTag();
  return Math.min(Math.max(t, 1), planTage());
}
export const planStatus = () => {
  const t = heutigerTag();
  return t < 1 ? "vor" : t > planTage() ? "nach" : "laeuft";
};
export const plantag = (tag) => state.plantage.find((p) => p.tag === tag);
export const datumVonTagRow = (tag) => plantag(tag)?.datum || addTage(planStart(), tag - 1);
const erledigtTag = (a) => (a.erledigt_am ? datumBerlin(new Date(a.erledigt_am)) : null);

/** Aufgaben einer Person für den angezeigten Tag (Übernahme-Regel siehe SPEC) */
export function aufgabenFuer(person, tagDatum) {
  const fokus = datumVonTagRow(fokusTag());
  const istFokus = tagDatum === fokus && planStatus() !== "vor";
  const out = state.aufgaben.filter((a) => {
    if (a.person !== person) return false;
    if (a.datum === tagDatum) return true;
    if (!istFokus) return false;
    if (a.datum < tagDatum) {
      if (!a.erledigt_am) return true;
      const ed = erledigtTag(a);
      return ed >= tagDatum;
    }
    return false;
  });
  const rang = (a) => (a.erledigt_am ? 1 : 0);
  out.sort((x, y) => rang(x) - rang(y) || x.sortierung - y.sortierung || Number(x.id) - Number(y.id));
  return out;
}
export const istUebernommen = (a, tagDatum) => a.datum < tagDatum;
export function offeneHeute(person) {
  const d = datumVonTagRow(fokusTag());
  const pers = person ? [person] : PERSONEN;
  return pers.reduce((n, p) => n + aufgabenFuer(p, d).filter((a) => !a.erledigt_am).length, 0);
}
/** Alle Aufgaben des Datums erledigt? (für die Tagesleiste) */
export function tagStatus(datum) {
  const l = state.aufgaben.filter((a) => a.datum === datum);
  if (!l.length) return "leer";
  return l.every((a) => a.erledigt_am) ? "fertig" : "offen";
}

/* ---------- Plan: Aktionen ---------- */
export async function aufgabeUmschalten(id, erledigt) {
  const a = state.aufgaben.find((x) => x.id === id);
  if (!a) return;
  const alt = { erledigt_am: a.erledigt_am, erledigt_von: a.erledigt_von };
  const patch = erledigt ? { erledigt_am: jetzt().toISOString(), erledigt_von: state.ich } : { erledigt_am: null, erledigt_von: null };
  Object.assign(a, patch);
  emit("aufgaben");
  try {
    const row = await backend.update("dash_aufgaben", { id }, patch);
    if (row) { Object.assign(a, row); emit("aufgaben"); }
  } catch (e) {
    Object.assign(a, alt);
    emit("aufgaben");
    toast(`Nicht gespeichert: ${fehlerText(e)}`, "fehler");
  }
}

export async function aufgabeAnlegen(person, datum, text) {
  const t = sauber(text);
  if (!t) return false;
  const rest = state.aufgaben.filter((a) => a.person === person && a.datum === datum);
  const sortierung = rest.reduce((m, a) => Math.max(m, a.sortierung || 0), 0) + 10;
  const tag = tagNr(datum);
  const tmp = { id: `tmp-${Math.random().toString(36).slice(2)}`, tag: tag >= 1 ? tag : null, datum, person, text: t.slice(0, 1000), dauer: null, quelle: "eigen", sortierung, erledigt_am: null, erledigt_von: null };
  state.aufgaben.push(tmp);
  sortiere("aufgaben");
  emit("aufgaben");
  try {
    const row = await backend.insert("dash_aufgaben", { tag: tmp.tag, datum, person, text: tmp.text, quelle: "eigen", sortierung });
    const i = state.aufgaben.findIndex((a) => a.id === tmp.id);
    if (i > -1) state.aufgaben.splice(i, 1);
    ersetzeZeile("aufgaben", row);
    emit("aufgaben");
    return true;
  } catch (e) {
    const i = state.aufgaben.findIndex((a) => a.id === tmp.id);
    if (i > -1) state.aufgaben.splice(i, 1);
    emit("aufgaben");
    toast(`Aufgabe nicht gespeichert: ${fehlerText(e)}`, "fehler");
    return false;
  }
}

export async function aufgabeLoeschen(id) {
  const i = state.aufgaben.findIndex((a) => a.id === id);
  if (i < 0) return;
  const [alt] = state.aufgaben.splice(i, 1);
  emit("aufgaben");
  try {
    await backend.remove("dash_aufgaben", { id });
  } catch (e) {
    state.aufgaben.push(alt);
    sortiere("aufgaben");
    emit("aufgaben");
    toast(`Nicht gelöscht: ${fehlerText(e)}`, "fehler");
  }
}

/* ---------- Notizen ---------- */
export async function notizSenden(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  const tmp = { id: `tmp-${Math.random().toString(36).slice(2)}`, created_at: jetzt().toISOString(), autor: state.ich, text: t.slice(0, 4000), angeheftet: false };
  state.notizen.push(tmp);
  emit("notizen");
  try {
    const row = await backend.insert("dash_notizen", { text: tmp.text }); // autor setzt die Datenbank
    const i = state.notizen.findIndex((n) => n.id === tmp.id);
    if (i > -1) state.notizen.splice(i, 1);
    ersetzeZeile("notizen", row);
    emit("notizen");
    return true;
  } catch (e) {
    const i = state.notizen.findIndex((n) => n.id === tmp.id);
    if (i > -1) state.notizen.splice(i, 1);
    emit("notizen");
    toast(`Nicht gesendet: ${fehlerText(e)}`, "fehler");
    return false;
  }
}
export async function notizAnheften(id, an) {
  const n = state.notizen.find((x) => x.id === id);
  if (!n) return;
  n.angeheftet = an;
  emit("notizen");
  try { await backend.update("dash_notizen", { id }, { angeheftet: an }); }
  catch (e) { n.angeheftet = !an; emit("notizen"); toast(`Nicht gespeichert: ${fehlerText(e)}`, "fehler"); }
}
export async function notizLoeschen(id) {
  const i = state.notizen.findIndex((n) => n.id === id);
  if (i < 0) return;
  const [alt] = state.notizen.splice(i, 1);
  emit("notizen");
  try { await backend.remove("dash_notizen", { id }); }
  catch (e) { state.notizen.push(alt); sortiere("notizen"); emit("notizen"); toast(`Nicht gelöscht: ${fehlerText(e)}`, "fehler"); }
}
export const notizenNeu = () => {
  const seit = gesehen.get("notizen");
  return state.notizen.filter((n) => n.autor !== state.ich && (!seit || n.created_at > seit)).length;
};

/* ---------- Leads ---------- */
const LEAD_FELDER = ["firma", "ansprechpartner", "email", "telefon", "ort", "website", "kanal", "stufe", "wer", "letzter_kontakt", "naechster_schritt", "faellig", "notiz", "upload_id"];
export function leadBereinigen(l) {
  const out = {};
  for (const f of LEAD_FELDER) {
    if (!(f in l)) continue;
    out[f] = f === "kanal" || f === "stufe" ? l[f] : sauber(l[f]);
  }
  if (out.email) out.email = out.email.toLowerCase();
  return out;
}
export async function leadSpeichern(l) {
  const daten = leadBereinigen(l);
  if (!daten.firma) throw new Error("Bitte eine Firma eintragen.");
  if (l.id) {
    const row = await backend.update("dash_leads", { id: l.id }, daten);
    ersetzeZeile("leads", row);
    emit("leads");
    return row;
  }
  const row = await backend.insert("dash_leads", daten);
  ersetzeZeile("leads", row);
  emit("leads");
  return row;
}
export async function leadStufe(id, stufe) {
  const l = state.leads.find((x) => x.id === id);
  if (!l) return;
  const alt = l.stufe;
  l.stufe = stufe;
  emit("leads");
  try { const row = await backend.update("dash_leads", { id }, { stufe }); if (row) { Object.assign(l, row); emit("leads"); } }
  catch (e) { l.stufe = alt; emit("leads"); toast(`Nicht gespeichert: ${fehlerText(e)}`, "fehler"); }
}
export async function leadLoeschen(id) {
  await backend.remove("dash_leads", { id });
  const i = state.leads.findIndex((l) => l.id === id);
  if (i > -1) state.leads.splice(i, 1);
  emit("leads");
}
const ERLEDIGT_STUFEN = new Set(["Kunde", "Ruht"]);
export const leadFaellig = (l) => !!l.faellig && l.faellig <= heute() && !ERLEDIGT_STUFEN.has(l.stufe);
export const leadsFaellig = () => state.leads.filter(leadFaellig).length;
/** Einmal vorbereiteter Lead (aus Posteingang) */
export const leadVorlage = { daten: null };

/* ---------- Einstellungen & Team ---------- */
export async function einstellungSetzen(schluessel, wert) {
  const w = sauber(wert);
  if (w == null) { await backend.remove("dash_einstellungen", { schluessel }); delete state.einstellungen[schluessel]; }
  else { await backend.upsert("dash_einstellungen", { schluessel, wert: w }, "schluessel"); state.einstellungen[schluessel] = w; }
  emit("einstellungen");
}
export async function teamHinzu(email, name) {
  const e = String(email || "").trim().toLowerCase();
  const row = await backend.insert("dash_team", { email: e, name });
  ersetzeZeile("team", row, "email");
  emit("team");
}
export async function teamEntfernen(email) {
  await backend.remove("dash_team", { email });
  const i = state.team.findIndex((t) => t.email === email);
  if (i > -1) state.team.splice(i, 1);
  emit("team");
}

/* ---------- Posteingang ---------- */
export const uploadsNeu = () => {
  const seit = gesehen.get("uploads");
  return state.uploads.filter((u) => !seit || u.created_at > seit).length;
};
export const leadZuUpload = (id) => state.leads.find((l) => l.upload_id === id);

/* ---------- Stripe ---------- */
export async function stripeLaden(erzwingen = false) {
  const s = state.stripe;
  if (!erzwingen && s.status === "ok" && Date.now() - s.am < 60000) return;
  if (s.status === "laden") return;
  s.status = "laden";
  emit("stripe");
  try {
    const r = await backend.stripe();
    if (r && r.status === "ok") { s.status = "ok"; s.daten = r; s.meldung = ""; }
    else if (r && r.status === "nicht_eingerichtet") { s.status = "nicht_eingerichtet"; s.daten = null; s.meldung = ""; }
    else { s.status = "fehler"; s.meldung = (r && (r.meldung || r.message || r.error)) || "Unerwartete Antwort von Stripe."; }
  } catch (e) {
    s.status = "fehler";
    s.meldung = fehlerText(e);
  }
  s.am = Date.now();
  emit("stripe");
}

export { config, planStart, planTage, planEnde };
