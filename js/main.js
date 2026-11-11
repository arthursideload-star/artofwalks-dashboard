// Start, Anmeldung, Routing, Realtime, Tageswechsel.
import { h, config, istLokal, heute, toast, fehlerText } from "./util.js";
import { state, setBackend, ladeAlles, ladeTabelle, auswirken, emit, onChange } from "./store.js";
import { createRemote } from "./backend-remote.js";
import { createDemo, demoOptionen } from "./demo.js";
import { loginAnsicht, keinZugangAnsicht, fehlerAnsicht } from "./views/login.js";
import { mountOrbit } from "./views/orbit.js";
import { mountPlan } from "./views/plan.js";
import { mountStripe } from "./views/stripe.js";
import { mountInbox } from "./views/inbox.js";
import { mountLeads } from "./views/leads.js";
import { mountNotizen } from "./views/notizen.js";
import { mountSettings } from "./views/settings.js";

const params = new URLSearchParams(location.search);
const DEMO = istLokal() && params.has("demo");
const app = document.getElementById("app");

let backend = null;
let ansicht = null;
let abo = null; // Realtime abmelden
let timer = null;
let laeuft = false;
let tagMerker = "";

const TITEL = { "": "Dashboard", plan: "30-Tage-Plan", stripe: "Stripe", inbox: "Posteingang", leads: "Leads", notizen: "Notizen", einstellungen: "Einstellungen" };
const ANSICHTEN = { "": mountOrbit, plan: mountPlan, stripe: mountStripe, inbox: mountInbox, leads: mountLeads, notizen: mountNotizen, einstellungen: mountSettings };

const ctx = { abmelden };

/* ---------- Anzeige ---------- */
function setze(el) {
  app.replaceChildren(el);
}
function verwerfeAnsicht() {
  try { ansicht?.destroy?.(); } catch (e) { console.error(e); }
  ansicht = null;
}

function route(erster = false) {
  if (!state.ich) return;
  const hash = location.hash;
  if (hash && !hash.startsWith("#/")) return;
  const [name = "", param] = hash.slice(2).split("/");
  const key = name in ANSICHTEN ? name : "";
  verwerfeAnsicht();
  document.title = key ? `${TITEL[key]} · Art of Walks Dashboard` : "Art of Walks · Dashboard";
  try {
    ansicht = ANSICHTEN[key](ctx, param);
    setze(ansicht.el);
    ansicht.afterMount?.();
  } catch (e) {
    console.error(e);
    setze(fehlerAnsicht(`Diese Ansicht konnte nicht gebaut werden: ${e.message}`, () => { location.hash = "#/"; route(); }));
    return;
  }
  window.scrollTo(0, 0);
  if (!erster) document.getElementById("main")?.focus({ preventScroll: true });
}

/* ---------- Anmeldung ---------- */
function zeigeLogin(hinweis = "") {
  verwerfeAnsicht();
  setze(loginAnsicht({
    onLogin: (email, pw) => backend.signIn(email, pw),
    onGoogle: () => backend.signInGoogle(),
    hinweis,
  }));
}

async function nachLogin(session) {
  if (laeuft) return;
  laeuft = true;
  try {
    state.email = (session?.user?.email || "").toLowerCase();
    setze(h("div", { class: "boot" }, h("div", { class: "boot-dot", "aria-hidden": "true" }), h("p", null, "Dashboard wird geladen …")));
    let ich;
    try { ich = await backend.ich(); }
    catch (e) {
      laeuft = false;
      setze(fehlerAnsicht(`Der Zugang konnte nicht geprüft werden: ${fehlerText(e)}`, () => nachLogin(session)));
      return;
    }
    if (!ich) {
      setze(keinZugangAnsicht({ email: state.email, onAbmelden: abmelden }));
      return;
    }
    state.ich = ich;
    await ladeAlles();
    starteLive();
    tagMerker = heute();
    if (!location.hash.startsWith("#/")) history.replaceState(null, "", location.pathname + location.search + "#/");
    route(true);
  } finally {
    laeuft = false;
  }
}

async function abmelden() {
  try { await backend.signOut(); } catch (e) { toast(`Abmelden fehlgeschlagen: ${fehlerText(e)}`, "fehler"); }
  if (DEMO) return;
  abbauen();
  zeigeLogin();
}

function abbauen() {
  verwerfeAnsicht();
  abo?.();
  abo = null;
  clearInterval(timer);
  timer = null;
  Object.assign(state, { ich: null, plantage: [], aufgaben: [], notizen: [], leads: [], einstellungen: {}, team: [], uploads: [], fehler: {}, geladen: false, verbindung: "offline", stripe: { status: "leer", daten: null, meldung: "", am: 0 } });
  history.replaceState(null, "", location.pathname + location.search);
}

/* ---------- Live ---------- */
function nachladen() {
  return Promise.all(["dash_aufgaben", "dash_notizen", "dash_leads", "upload_anfragen"].map(ladeTabelle));
}

function starteLive() {
  abo?.();
  if (!DEMO) {
    let getrennt = false;
    abo = backend.subscribe(auswirken, (status) => {
      if (status === "SUBSCRIBED") { state.verbindung = "live"; if (getrennt) { getrennt = false; nachladen(); } }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") { state.verbindung = "offline"; getrennt = true; }
    });
  }
  clearInterval(timer);
  timer = setInterval(() => {
    // Tageswechsel (Berlin)
    const h0 = heute();
    if (h0 !== tagMerker) { tagMerker = h0; emit("tag"); }
    // Sicherheitsnetz, falls Realtime schweigt
    if (!DEMO && !document.hidden) nachladen();
  }, 60000);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden || !state.ich) return;
  const h0 = heute();
  if (h0 !== tagMerker) { tagMerker = h0; emit("tag"); }
  if (!DEMO) nachladen();
});
window.addEventListener("online", () => { if (state.ich && !DEMO) { nachladen(); toast("Wieder verbunden."); } });
window.addEventListener("offline", () => toast("Keine Internetverbindung. Änderungen werden erst nach der Verbindung gespeichert.", "fehler"));
window.addEventListener("hashchange", () => route());
document.getElementById("skip")?.addEventListener("click", (e) => { e.preventDefault(); document.getElementById("main")?.focus(); });

/* ---------- Start ---------- */
async function start() {
  if (DEMO) {
    backend = createDemo(demoOptionen(params));
    setBackend(backend);
    state.ich = await backend.ich();
    state.email = "demo@example.com";
    state.verbindung = "demo";
    await ladeAlles();
    starteLive();
    tagMerker = heute();
    route(true);
    return;
  }
  if (!window.supabase?.createClient) {
    setze(fehlerAnsicht("Die Verbindung zur Datenbank konnte nicht geladen werden. Bitte Seite neu laden.", () => location.reload()));
    return;
  }
  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  backend = createRemote(client);
  setBackend(backend);
  backend.onAuth((ev, session) => {
    setTimeout(() => {
      if (ev === "SIGNED_OUT") { abbauen(); zeigeLogin(); }
      else if (ev === "SIGNED_IN" && session && !state.ich) nachLogin(session);
    }, 0);
  });
  let s = null;
  try { s = await backend.session(); } catch (e) { console.warn(e); }
  if (s) await nachLogin(s);
  else if (!laeuft) zeigeLogin();
}

start().catch((e) => {
  console.error(e);
  setze(fehlerAnsicht(`Unerwarteter Fehler: ${fehlerText(e)}`, () => location.reload()));
});
