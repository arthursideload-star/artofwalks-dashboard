// ArtOfWalks Dashboard · Rechenlogik für Stripe-Daten (ohne Deno-Abhängigkeiten, damit testbar)
//
// Liest nur lesend von api.stripe.com (Balance, Charges, bei den letzten Zahlungen
// zusätzlich die Checkout-Session des Payment Links für den Produktnamen).

export const ZEITZONE = "Europe/Berlin";
export const PLAN_START = "2026-11-04"; // Tag 1 des 30-Tage-Plans
export const MAX_CHARGES = 1000;
const SEITE = 100;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

// ---------- Zeitgrenzen in Europe/Berlin ----------

const tzFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: ZEITZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  weekday: "short",
});

type Teile = { y: number; m: number; d: number; wochentag: number; versatzMs: number };

// Kalenderteile in Berlin und Versatz (Berlin minus UTC) zu einem Zeitpunkt
export function berlinTeile(ms: number): Teile {
  const p: Record<string, string> = {};
  for (const t of tzFormat.formatToParts(new Date(ms))) p[t.type] = t.value;
  const y = +p.year, m = +p.month, d = +p.day;
  const lokalAlsUtc = Date.UTC(y, m - 1, d, +p.hour, +p.minute, +p.second);
  const wochentage = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    y, m, d,
    wochentag: wochentage.indexOf(p.weekday), // 0 = Montag
    versatzMs: lokalAlsUtc - Math.floor(ms / 1000) * 1000,
  };
}

// Berlin-Mitternacht (Beginn des Kalendertags) als UTC-Millisekunden; Tag darf überlaufen
export function berlinTagesbeginn(y: number, m: number, d: number): number {
  const t0 = Date.UTC(y, m - 1, d);
  const v1 = berlinTeile(t0).versatzMs;
  const kandidat = t0 - v1;
  const v2 = berlinTeile(kandidat).versatzMs;
  return t0 - v2;
}

export type Grenzen = { heute: number; woche: number; monat: number; plan: number };

// Grenzen in Unix-Sekunden (so liefert Stripe `created`)
export function zeitGrenzen(jetztMs: number): Grenzen {
  const t = berlinTeile(jetztMs);
  const [py, pm, pd] = PLAN_START.split("-").map(Number);
  return {
    heute: berlinTagesbeginn(t.y, t.m, t.d) / 1000,
    woche: berlinTagesbeginn(t.y, t.m, t.d - t.wochentag) / 1000,
    monat: berlinTagesbeginn(t.y, t.m, 1) / 1000,
    plan: berlinTagesbeginn(py, pm, pd) / 1000,
  };
}

// ---------- Stripe-Zugriff ----------

export class StripeFehler extends Error {
  status: number;
  constructor(status: number, nachricht: string) {
    super(nachricht);
    this.status = status;
  }
}

async function stripeGet(f: Fetch, key: string, pfad: string, query: Record<string, string> = {}) {
  const url = new URL(`https://api.stripe.com${pfad}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.append(k, v);
  const r = await f(url.toString(), {
    headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2024-06-20" },
  });
  if (!r.ok) {
    // Nur ins Log, nie nach außen
    const text = await r.text().catch(() => "");
    throw new StripeFehler(r.status, `${pfad} → ${r.status} ${text.slice(0, 300)}`);
  }
  return await r.json();
}

// deno-lint-ignore no-explicit-any
type Charge = any;

export async function alleCharges(f: Fetch, key: string, max = MAX_CHARGES): Promise<Charge[]> {
  const alle: Charge[] = [];
  let nach: string | undefined;
  while (alle.length < max) {
    const q: Record<string, string> = { limit: String(Math.min(SEITE, max - alle.length)) };
    if (nach) q.starting_after = nach;
    const seite = await stripeGet(f, key, "/v1/charges", q);
    const daten: Charge[] = seite.data ?? [];
    alle.push(...daten);
    if (!seite.has_more || !daten.length) break;
    nach = daten[daten.length - 1].id;
  }
  return alle;
}

// ---------- Rechnen ----------

export const nettoBetrag = (c: Charge): number =>
  Math.max(0, (c.amount ?? 0) - (c.amount_refunded ?? 0));

export const zaehlt = (c: Charge): boolean => c.paid === true && c.status === "succeeded";

export function summen(charges: Charge[], g: Grenzen, waehrung: string) {
  const umsatz = { heute: 0, woche: 0, monat: 0, plan: 0, gesamt: 0 };
  const anzahl = { heute: 0, woche: 0, monat: 0, plan: 0, gesamt: 0 };
  const kunden = new Set<string>();
  for (const c of charges) {
    if (!zaehlt(c)) continue;
    if ((c.currency ?? "").toLowerCase() !== waehrung) continue;
    const netto = nettoBetrag(c);
    const t = c.created as number;
    const stufen: (keyof typeof umsatz)[] = ["gesamt"];
    if (t >= g.plan) stufen.push("plan");
    if (t >= g.monat) stufen.push("monat");
    if (t >= g.woche) stufen.push("woche");
    if (t >= g.heute) stufen.push("heute");
    for (const s of stufen) {
      umsatz[s] += netto;
      anzahl[s] += 1;
    }
    // Eindeutige Kunden: Customer-ID, sonst E-Mail. Nur gezählt, nie zurückgegeben.
    const kennung = c.customer || c.billing_details?.email;
    if (kennung) kunden.add(String(kennung).toLowerCase());
  }
  return { umsatz, anzahl, kundenAnzahl: kunden.size };
}

// Produktname aus der Checkout-Session des Payment Links; bei jedem Problem null
async function produktName(f: Fetch, key: string, c: Charge): Promise<string | null> {
  if (!c.payment_intent) return null;
  try {
    const r = await stripeGet(f, key, "/v1/checkout/sessions", {
      payment_intent: String(c.payment_intent),
      limit: "1",
      "expand[]": "data.line_items",
    });
    const pos = r.data?.[0]?.line_items?.data?.[0];
    return pos?.description ?? null;
  } catch (e) {
    console.warn("Produktname nicht ermittelbar", (e as Error).message);
    return null;
  }
}

export async function letzteZahlungen(f: Fetch, key: string, charges: Charge[], n = 10) {
  const neueste = charges
    .filter(zaehlt)
    .sort((a, b) => b.created - a.created)
    .slice(0, n);
  const namen = await Promise.all(
    neueste.map((c) => c.description ? Promise.resolve(null) : produktName(f, key, c)),
  );
  return neueste.map((c, i) => ({
    id: c.id as string,
    betrag: nettoBetrag(c),
    waehrung: String(c.currency ?? "eur"),
    status: String(c.status),
    beschreibung: (c.description || namen[i] || null) as string | null,
    kunde: (c.billing_details?.name || null) as string | null,
    datum: new Date(c.created * 1000).toISOString(),
    beleg_url: (c.receipt_url || null) as string | null,
  }));
}

export async function holeStripeDaten(f: Fetch, key: string, jetztMs = Date.now()) {
  const waehrung = "eur";
  const [balance, charges] = await Promise.all([
    stripeGet(f, key, "/v1/balance"),
    alleCharges(f, key),
  ]);
  const euro = (liste: { amount: number; currency: string }[] | undefined) =>
    (liste ?? []).filter((b) => b.currency === waehrung).reduce((s, b) => s + b.amount, 0);

  const s = summen(charges, zeitGrenzen(jetztMs), waehrung);
  return {
    status: "ok" as const,
    waehrung,
    stand: new Date(jetztMs).toISOString(),
    guthaben: { verfuegbar: euro(balance.available), ausstehend: euro(balance.pending) },
    umsatz: s.umsatz,
    anzahl: s.anzahl,
    kunden_anzahl: s.kundenAnzahl,
    zahlungen: await letzteZahlungen(f, key, charges),
  };
}
