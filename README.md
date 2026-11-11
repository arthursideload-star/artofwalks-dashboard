# artofwalks-dashboard

Internes Dashboard der ArtOfWalks GbR. Statische Seite (GitHub Pages), Daten und Anmeldung über Supabase. Ohne Teamkonto zeigt die Seite nur die Anmeldung; alle Daten sind per Row Level Security geschützt.

- `index.html`, `css/`, `js/`: Oberfläche, kein Build-Schritt
- `supabase/migrations/`: Tabellen und Rechte
- `supabase/functions/dashboard-stripe/`: Umsätze aus Stripe (nur lesend, Schlüssel liegt als Secret bei Supabase)

Lokale Vorschau mit Beispieldaten: Ordner über einen lokalen Webserver ausliefern und `http://localhost:<port>/?demo` öffnen.
