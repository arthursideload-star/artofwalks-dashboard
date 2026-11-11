// ArtOfWalks Dashboard · Stripe-Kennzahlen (nur lesend, nur fürs Team)
//
// Das Dashboard ruft diese Funktion mit POST auf (Authorization: Bearer <Login-Token>).
// Die Funktion prüft über rpc('dash_ich'), ob das Konto zum Team gehört, liest dann
// mit einem eingeschränkten Stripe-Schlüssel (nur Lesen) Guthaben und Zahlungen und
// gibt Summen zurück. Kunden-E-Mails werden nie zurückgegeben.
//
// Secret (nur im Supabase-Dashboard unter Edge Functions → Secrets, nie im Repo):
//   STRIPE_API_KEY   eingeschränkter Schlüssel (rk_live_…) mit reinen Leserechten
// Automatisch vorhanden: SUPABASE_URL, SUPABASE_ANON_KEY (bzw. Publishable Key)
//
// Deploy mit verify_jwt = true. Antworten:
//   200 { status: "ok", … }                 Daten (Format siehe logik.ts)
//   200 { status: "nicht_eingerichtet" }    STRIPE_API_KEY fehlt
//   403 { status: "kein_zugang" }           kein Teammitglied
//   502 { status: "fehler" }                Stripe-Fehler (Details nur im Log)

import { createClient } from "npm:@supabase/supabase-js@2";
import { holeStripeDaten } from "./logik.ts";

const ERLAUBTER_URSPRUNG = "https://arthursideload-star.github.io";
const istLokal = (origin: string) => /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

const corsHeader = (origin: string | null): HeadersInit => {
  const erlaubt = origin && (origin === ERLAUBTER_URSPRUNG || istLokal(origin));
  return {
    "Access-Control-Allow-Origin": erlaubt ? origin : ERLAUBTER_URSPRUNG,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
};

const antwort = (origin: string | null, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeader(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const publishableKey = (): string | undefined => {
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (anon) return anon;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    if (keys.default) return keys.default;
  } catch (_) { /* leer */ }
  return Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? undefined;
};

// 60 Sekunden Zwischenspeicher im Arbeitsspeicher (gilt für das ganze Team)
const CACHE_MS = 60_000;
let cache: { bis: number; daten: Record<string, unknown> } | null = null;

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeader(origin) });
  if (req.method !== "POST") return antwort(origin, 405, { status: "methode" });

  // 1. Zugriff nur fürs Team
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = publishableKey();
  const auth = req.headers.get("Authorization");
  if (!url || !anonKey) return antwort(origin, 500, { status: "konfiguration" });
  if (!auth) return antwort(origin, 403, { status: "kein_zugang" });

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: ich, error: ichFehler } = await supabase.rpc("dash_ich");
  if (ichFehler || !ich) return antwort(origin, 403, { status: "kein_zugang" });

  // 2. Stripe
  const stripeKey = Deno.env.get("STRIPE_API_KEY");
  if (!stripeKey) return antwort(origin, 200, { status: "nicht_eingerichtet" });

  if (cache && cache.bis > Date.now()) return antwort(origin, 200, cache.daten);

  try {
    const daten = await holeStripeDaten(fetch, stripeKey);
    cache = { bis: Date.now() + CACHE_MS, daten };
    return antwort(origin, 200, daten);
  } catch (e) {
    console.error("Stripe-Fehler", (e as Error).message);
    return antwort(origin, 502, { status: "fehler" });
  }
});
