// Gmail (nur lesen) per Google Identity Services. Das Zugriffstoken liegt nur im Speicher.
import { state, getBackend, emit } from "./store.js";
import { jetzt } from "./util.js";

const GSI = "https://accounts.google.com/gsi/client";
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export const gmail = {
  status: "aus", // aus | verbinden | laden | ok | abgelaufen | fehler
  mails: [],
  ungelesen: 0,
  meldung: "",
  am: 0,
};
let token = null;
let tokenClient = null;
let gsiPromise = null;

export const gmailClientId = () => state.einstellungen.google_client_id || "";
const istDemo = () => getBackend()?.modus === "demo";
const setze = (status, meldung = "") => { gmail.status = status; gmail.meldung = meldung; emit("gmail"); };

function ladeGsi() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((ok, fehl) => {
    const s = document.createElement("script");
    s.src = GSI;
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => { gsiPromise = null; fehl(new Error("Google-Anmeldung konnte nicht geladen werden.")); };
    document.head.append(s);
  });
  return gsiPromise;
}

const entities = (s) => new DOMParser().parseFromString(String(s || ""), "text/html").documentElement.textContent || "";

function absender(von) {
  const t = String(von || "").trim();
  const m = t.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
  return (m && (m[1].trim() || m[2])) || t.replace(/[<>]/g, "") || "Unbekannt";
}

function demoMails() {
  const t = (min) => new Date(jetzt().getTime() - min * 60000).toISOString();
  return [
    { id: "d1", threadId: "d1", von: "Frau Beispiel", betreff: "Re: Videos für unsere Exposés", snippet: "Vielen Dank für Ihr Schreiben. Wir würden uns gern ein Beispiel ansehen …", datum: t(42), ungelesen: true },
    { id: "d2", threadId: "d2", von: "Hausblick Immobilien", betreff: "Fotos für das Probevideo", snippet: "Anbei die Fotos der Wohnung in Teststadt, das Logo hängt ebenfalls an.", datum: t(95), ungelesen: true },
    { id: "d3", threadId: "d3", von: "Stripe", betreff: "Ihre Auszahlung ist unterwegs", snippet: "Eine Auszahlung wurde auf Ihr Bankkonto veranlasst.", datum: t(60 * 20), ungelesen: false },
    { id: "d4", threadId: "d4", von: "Herr Test", betreff: "Rückfrage zum Ablauf", snippet: "Guten Tag, wie läuft die Lieferung des fertigen Videos ab?", datum: t(60 * 27), ungelesen: false },
  ];
}

export async function gmailVerbinden() {
  if (istDemo() && getBackend().demoGmail) {
    gmail.mails = demoMails();
    gmail.ungelesen = gmail.mails.filter((m) => m.ungelesen).length;
    gmail.am = Date.now();
    setze("ok");
    return;
  }
  const clientId = gmailClientId();
  if (!clientId) return;
  setze("verbinden");
  try {
    await ladeGsi();
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) { setze("fehler", r.error === "access_denied" ? "Zugriff wurde nicht erlaubt." : "Verbindung zu Google fehlgeschlagen."); return; }
        token = r.access_token;
        gmailLaden();
      },
      error_callback: (e) => setze(e?.type === "popup_closed" ? "aus" : "fehler", e?.type === "popup_closed" ? "" : "Fenster konnte nicht geöffnet werden."),
    });
    tokenClient.requestAccessToken({ prompt: token ? "" : "consent" });
  } catch (e) {
    setze("fehler", e.message || "Verbindung zu Google fehlgeschlagen.");
  }
}

async function gget(pfad) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${pfad}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) { token = null; const e = new Error("abgelaufen"); e.abgelaufen = true; throw e; }
  if (!res.ok) throw new Error(`Gmail antwortet mit Fehler ${res.status}.`);
  return res.json();
}

export async function gmailLaden() {
  if (istDemo() && getBackend().demoGmail) { await gmailVerbinden(); return; }
  if (!token) { setze("abgelaufen"); return; }
  setze("laden");
  try {
    const liste = await gget("messages?labelIds=INBOX&maxResults=20");
    const ids = (liste.messages || []).map((m) => m.id);
    const mails = await Promise.all(ids.map((id) => gget(`messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)));
    gmail.mails = mails.map((m) => {
      const kopf = Object.fromEntries((m.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]));
      return {
        id: m.id, threadId: m.threadId, von: absender(kopf.from), betreff: kopf.subject || "(ohne Betreff)", snippet: entities(m.snippet),
        datum: Number(m.internalDate) ? new Date(Number(m.internalDate)).toISOString() : new Date(kopf.date || Date.now()).toISOString(),
        ungelesen: (m.labelIds || []).includes("UNREAD"),
      };
    });
    gmail.ungelesen = gmail.mails.filter((m) => m.ungelesen).length;
    gmail.am = Date.now();
    setze("ok");
  } catch (e) {
    if (e.abgelaufen) setze("abgelaufen");
    else setze("fehler", /fetch/i.test(e.message) ? "Keine Verbindung zu Gmail." : e.message);
  }
}

export const mailLink = (m) => `https://mail.google.com/mail/#inbox/${encodeURIComponent(m.threadId)}`;
