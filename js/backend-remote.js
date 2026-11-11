// Echtes Backend: Supabase (RLS: nur Team), Realtime, Edge Function dashboard-stripe.
import { config } from "./util.js";

const BUCKET = "auftrag-uploads";

export function createRemote(client) {
  const ID = { dash_team: "email", dash_einstellungen: "schluessel" };
  const idCol = (t) => ID[t] || "id";
  const pruefe = ({ data, error }) => { if (error) throw error; return data; };

  async function dateien(ordner) {
    const res = await client.storage.from(BUCKET).list(ordner, { limit: 60, sortBy: { column: "name", order: "asc" } });
    const items = (pruefe(res) || []).filter((f) => f.name && f.id && !f.name.startsWith("."));
    if (!items.length) return [];
    const pfade = items.map((f) => `${ordner}/${f.name}`);
    const urls = pruefe(await client.storage.from(BUCKET).createSignedUrls(pfade, 3600)) || [];
    return urls.filter((u) => u.signedUrl).map((u, i) => ({ name: items[i]?.name || "", url: u.signedUrl }));
  }

  return {
    modus: "remote",
    client,

    async ich() { return pruefe(await client.rpc("dash_ich")); },

    async list(table) {
      let q = client.from(table).select("*");
      if (table === "dash_plantage") q = q.order("tag");
      else if (table === "dash_aufgaben") q = q.order("datum").order("sortierung").order("id");
      else if (table === "dash_notizen") q = q.order("created_at", { ascending: false }).limit(500);
      else if (table === "dash_leads") q = q.order("created_at", { ascending: false });
      else if (table === "upload_anfragen") q = q.order("created_at", { ascending: false }).limit(100);
      else if (table === "dash_team") q = q.order("created_at");
      return pruefe(await q) || [];
    },

    async insert(table, row) { return pruefe(await client.from(table).insert(row).select().single()); },
    async update(table, match, patch) {
      const col = Object.keys(match)[0];
      return pruefe(await client.from(table).update(patch).eq(col, match[col]).select().single());
    },
    async remove(table, match) {
      const col = Object.keys(match)[0];
      pruefe(await client.from(table).delete().eq(col, match[col]));
    },
    async upsert(table, row, onConflict) { return pruefe(await client.from(table).upsert(row, { onConflict }).select().single()); },

    /** Fotos und Logo einer Upload-Anfrage als befristete Links (1 h) */
    async uploadBilder(u) {
      const [fotos, logo] = await Promise.allSettled([dateien(`${u.id}/fotos`), dateien(`${u.id}/logo`)]);
      return { fotos: fotos.status === "fulfilled" ? fotos.value : [], logo: logo.status === "fulfilled" ? logo.value : [] };
    },

    async stripe() {
      const { data } = await client.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("Die Anmeldung ist abgelaufen. Bitte neu anmelden.");
      let res;
      try {
        res = await fetch(`${config.supabaseUrl}/functions/v1/dashboard-stripe`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, apikey: config.supabaseKey, "Content-Type": "application/json" },
          body: "{}",
        });
      } catch (e) { throw e; }
      let json = null;
      try { json = await res.json(); } catch { /* kein JSON */ }
      if (res.status === 404) return { status: "fehler", meldung: "Die Stripe-Funktion ist noch nicht eingespielt (dashboard-stripe nicht gefunden)." };
      if (res.status === 401 || res.status === 403) return { status: "fehler", meldung: "Kein Zugriff auf die Stripe-Funktion. Bitte neu anmelden." };
      if (!res.ok) return { status: "fehler", meldung: (json && (json.meldung || json.message || json.error)) || `Stripe-Abfrage fehlgeschlagen (${res.status}).` };
      return json || { status: "fehler", meldung: "Leere Antwort." };
    },

    /** Realtime für Notizen, Aufgaben, Leads. Gibt eine Abmelde-Funktion zurück. */
    subscribe(onEvent, onStatus) {
      // Eigener Kanalname pro Abo, damit sich ein alter und ein neuer Kanal nicht gegenseitig schließen.
      const ch = client.channel(`aow-dashboard-${Math.random().toString(36).slice(2, 10)}`);
      for (const t of ["dash_notizen", "dash_aufgaben", "dash_leads"]) {
        ch.on("postgres_changes", { event: "*", schema: "public", table: t }, (p) => onEvent(t, p.eventType, p.new, p.old));
      }
      ch.subscribe((s, err) => onStatus && onStatus(s, err));
      return () => { try { client.removeChannel(ch); } catch { /* egal */ } };
    },

    async signIn(email, passwort) { return pruefe(await client.auth.signInWithPassword({ email, password: passwort })); },
    async signInGoogle() {
      return pruefe(await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } }));
    },
    async signOut() { await client.auth.signOut(); },
    async session() { const { data } = await client.auth.getSession(); return data?.session || null; },
    onAuth(cb) { return client.auth.onAuthStateChange((ev, s) => cb(ev, s)); },
    idCol,
  };
}
