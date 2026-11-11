// Öffentliche Werte (kein Geheimnis): Projekt-URL und Publishable Key sind
// auch in artofwalks.com/js/auth.js sichtbar. Schutz der Daten: Row Level
// Security, nur Konten aus public.dash_team sehen etwas.
window.AOW_CONFIG = {
  supabaseUrl: "https://xkmbdntdihoioqentofx.supabase.co",
  supabaseKey: "sb_publishable_yCMFCK-f6XOBJ_5Lgh_Z8A_i2VuYlZq",
  planStart: "2026-11-04",
  planTage: 30,
  zeitzone: "Europe/Berlin",
  // Konto anlegen und Passwort zurücksetzen laufen über die Website.
  kontoUrl: "https://artofwalks.com/login.html",
  // Google-Login nur, wenn die Dashboard-Adresse bei Supabase als Weiterleitung erlaubt ist.
  googleLogin: false,
  // Ziel des 30-Tage-Plans (für die Stripe-Ansicht): Umsatz in Cent, zahlende Kunden.
  ziel: { umsatzCent: 20000, kunden: 2, ersterKundeTag: 21 },
};
