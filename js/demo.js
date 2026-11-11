// Demo-Modus (nur localhost mit ?demo): erfundene Beispieldaten im Speicher.
// Keine echten Plan-Inhalte, Kontakte oder Preise. Keine Netzwerkaufrufe.
import { config, addTage, diffTage, planStart, planTage, setzeUhr, jetzt } from "./util.js";
import { demoGesehenSetzen } from "./store.js";

const DAUERN = ["15 Min.", "20 Min.", "30 Min.", "45 Min.", "1 Std."];
const POOL_DEAN = [
  "Neue Maklerbüros recherchieren\nOrt, Ansprechpartner und Webseite in die Leads-Liste eintragen.",
  "Briefe vorbereiten und frankieren",
  "Telefonische Nachfassung bei offenen Kontakten",
  "Antworten im Postfach sichten und beantworten",
  "Leads aktualisieren: Stufen und nächste Schritte pflegen",
  "Probevideo-Anfragen beantworten",
  "Kontaktliste bereinigen",
];
const POOL_ARTHUR = [
  "Videos erzeugen und prüfen\nKamerafahrt wählen, Export in Hoch- und Querformat.",
  "LinkedIn-Beiträge planen",
  "Website-Texte prüfen",
  "Nachrichten an Kontakte schreiben",
  "Angebote nachfassen",
  "Belege ablegen und Zahlungseingänge prüfen",
  "Beispielvideo verbessern",
];
const TITEL = [
  "Aufsetzen und Ordnen", "Liste anlegen", "Erste Entwürfe", "Erste Kontakte", "Beispielvideo prüfen", "Anzeigen sichten", "Kontakte nachfassen",
  "Neue Büros ansprechen", "Rückmeldungen sammeln", "Probevideos anbieten", "Nachfassen", "Videos liefern", "Feedback einholen", "Wochenrückblick",
  "Zweite Runde", "Angebote schärfen", "Telefonieren", "Briefe nachfassen", "Probevideos liefern", "Rückmeldungen auswerten", "Erster Kunde",
  "Abschlüsse vorbereiten", "Angebote senden", "Nachfassen", "Rechnungen stellen", "Empfehlungen anfragen", "Wochenrückblick", "Ergebnisse sichten", "Bilanz vorbereiten", "Bilanz und Ausblick",
];

function bild(a, b, v) {
  const fenster = [
    `<rect x="70" y="70" width="110" height="130" rx="6" fill="#FFF4E6" opacity=".85"/><path d="M125 70v130M70 135h110" stroke="${b}" stroke-width="5"/>`,
    `<rect x="40" y="60" width="90" height="140" rx="6" fill="#FFF4E6" opacity=".85"/><rect x="170" y="90" width="90" height="110" rx="6" fill="#FFF4E6" opacity=".6"/>`,
    `<circle cx="150" cy="100" r="52" fill="#FFF4E6" opacity=".8"/><path d="M60 230l60-70 50 50 40-40 50 60z" fill="${b}" opacity=".7"/>`,
  ][v % 3];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="320" height="240" fill="url(#g)"/>${fenster}<rect y="205" width="320" height="35" fill="#24140E" opacity=".18"/></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function seed(heute, ich) {
  const T = diffTage(planStart(), heute) + 1;
  const dat = (t) => addTage(planStart(), t - 1);
  const zeitAn = (d, hhmm) => `${d}T${hhmm}:00+01:00`;

  const plantage = Array.from({ length: planTage() }, (_, i) => ({ tag: i + 1, datum: dat(i + 1), woche: Math.floor(i / 7) + 1, titel: TITEL[i] || `Tag ${i + 1}` }));

  let id = 1;
  const aufgaben = [];
  const add = (tag, person, text, o = {}) => {
    aufgaben.push({
      id: id++, tag, datum: dat(tag), person, text, dauer: o.dauer ?? DAUERN[(id * 3) % DAUERN.length], quelle: o.quelle || "plan",
      sortierung: o.s ?? id * 10, erledigt_am: o.erledigt ?? null, erledigt_von: o.von ?? null,
    });
  };
  for (let t = 1; t <= planTage(); t++) {
    for (const [person, pool] of [["Dean", POOL_DEAN], ["Arthur", POOL_ARTHUR]]) {
      const n = t === T ? 0 : 3;
      for (let k = 0; k < n; k++) {
        const text = pool[(t * 2 + k) % pool.length];
        const vergangen = t < T;
        const offenBleiben = (person === "Dean" && k === 1 && (t === T - 2 || t === T - 1)) || (person === "Arthur" && k === 2 && (t === T - 3 || t === T - 1));
        const fertig = vergangen && !offenBleiben;
        const offenText = person === "Dean" ? (t === T - 2 ? "Liste mit 20 Maklerbüros fertigstellen" : "Briefe drucken und frankieren") : (t === T - 3 ? "Beispielvideo auf der Startseite prüfen" : "Kontakte aus dem Verzeichnis sichten");
        add(t, person, offenBleiben ? offenText : text, {
          erledigt: fertig ? zeitAn(dat(t), "17:10") : null, von: fertig ? person : null,
        });
      }
    }
  }
  // Heutiger Tag (genau definiert)
  if (T >= 1 && T <= planTage()) {
    add(T, "Dean", "Fünf neue Maklerbüros recherchieren\nOrt, Ansprechpartner und Webseite in die Leads-Liste eintragen. Nur Büros mit eigenem Exposé-Auftritt, keine Portale.", { dauer: "45 Min.", s: 10 });
    add(T, "Dean", "Zwei Telefonate führen", { dauer: "30 Min.", s: 20 });
    add(T, "Dean", "Antworten im Postfach beantworten", { dauer: "20 Min.", s: 30 });
    add(T, "Dean", "Kurzes Update an Arthur in die Notizen", { dauer: "5 Min.", s: 40 });
    add(T, "Arthur", "Probevideo für Hausblick Immobilien fertigstellen\nFotos prüfen, Kamerafahrt wählen, Export in Hoch- und Querformat, dann per Mail senden.", { dauer: "1 Std.", s: 10 });
    add(T, "Arthur", "Zwei LinkedIn-Nachrichten schreiben", { dauer: "20 Min.", s: 20, erledigt: zeitAn(heute, "08:40"), von: "Arthur" });
    add(T, "Arthur", "Angebotstext für Anfragen überarbeiten", { dauer: "30 Min.", s: 30 });
    add(T, "Arthur", "Rechnungsvorlage prüfen", { dauer: "15 Min.", s: 40 });
    // übernommen, heute erledigt
    if (T > 1) add(T - 1, "Arthur", "Fotos für das Probevideo sortieren", { dauer: "20 Min.", s: 5, erledigt: zeitAn(heute, "08:50"), von: "Arthur" });
    // eine eigene Aufgabe
    aufgaben.push({ id: id++, tag: T, datum: heute, person: "Dean", text: "Visitenkarten bestellen", dauer: null, quelle: "eigen", sortierung: 50, erledigt_am: null, erledigt_von: null });
  }

  const gestern = addTage(heute, -1);
  const n = (autor, d, hhmm, text, angeheftet = false) => ({ autor, created_at: zeitAn(d, hhmm), text, angeheftet });
  const notizen = [
    n("Arthur", dat(1), "10:05", "Ziel bis Tag 21: erster zahlender Kunde. Alles andere ist zweitrangig.", true),
    n("Team", dat(3), "12:30", "Gemeinsame Regel: Anfragen aus dem Postfach innerhalb von 24 Stunden beantworten.", true),
    n("Dean", gestern, "17:20", "Briefe sind gedruckt. Ich werfe sie morgen früh ein."),
    n("Arthur", gestern, "17:42", "Top. Ich überarbeite heute Abend die Angebotstexte."),
    n("Dean", gestern, "21:05", "Habe noch zwei Büros gefunden, die Liste ist aktualisiert."),
    n("Dean", heute, "08:12", "Neuer Foto-Upload von Hausblick Immobilien, Lead ist angelegt."),
    n("Arthur", heute, "08:30", "Perfekt, das Probevideo übernehme ich.\nDauert ca. eine Stunde."),
  ].map((x, i) => ({ id: 100 + i, ...x }));

  const uid = "00000000-0000-4000-8000-000000000001";
  const uploads = [
    {
      id: uid, created_at: zeitAn(heute, "08:05"), art: "probevideo", maklerbuero: "Hausblick Immobilien", ansprechpartner: "Herr Beispiel",
      email: "beispiel@example.com", telefon: "0123 4567890", inserat_link: "https://example.com/inserat/12345",
      objekt: "3-Zimmer-Wohnung, Musterstraße 12, Teststadt", energieausweis: "Bedarfsausweis, Klasse C",
      hinweise: "Bitte Hochformat und Querformat. Logo liegt bei.", anzahl_fotos: 6, mit_logo: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000002", created_at: zeitAn(addTage(heute, -3), "14:40"), art: "probevideo", maklerbuero: "Domizil Beispiel GmbH",
      ansprechpartner: "Frau Muster", email: "muster@example.com", telefon: "", inserat_link: "", objekt: "Einfamilienhaus, Teststadt",
      energieausweis: "", hinweise: "", anzahl_fotos: 8, mit_logo: false,
    },
  ];

  const l = (o) => ({ id: id++, created_at: zeitAn(addTage(heute, -5), "10:00"), updated_at: zeitAn(heute, "08:00"), ansprechpartner: null, email: null, telefon: null, ort: null, website: null, kanal: "Sonstiges", stufe: "Neu", wer: null, letzter_kontakt: null, naechster_schritt: null, faellig: null, notiz: null, upload_id: null, erstellt_von: "Arthur", ...o });
  const leads = [
    l({ firma: "Muster Immobilien GmbH", ansprechpartner: "Frau Beispiel", ort: "Musterstadt", email: "kontakt@example.com", kanal: "Brief", stufe: "Kontaktiert", wer: "Arthur", letzter_kontakt: addTage(heute, -4), naechster_schritt: "Nachfassen per Telefon", faellig: heute }),
    l({ firma: "Beispiel & Partner Makler", ansprechpartner: "Herr Test", ort: "Beispielhausen", telefon: "0123 4567891", kanal: "LinkedIn", stufe: "Antwort", wer: "Dean", letzter_kontakt: addTage(heute, -3), naechster_schritt: "Probevideo anbieten", faellig: addTage(heute, -1), notiz: "Hat auf die LinkedIn-Nachricht geantwortet und Interesse an einem Beispiel gezeigt." }),
    l({ firma: "Hausblick Immobilien", ansprechpartner: "Herr Beispiel", ort: "Teststadt", email: "beispiel@example.com", kanal: "Website", stufe: "Probevideo angefragt", wer: "Arthur", letzter_kontakt: heute, naechster_schritt: "Probevideo bis morgen liefern", faellig: addTage(heute, 1), upload_id: uid }),
    l({ firma: "Domizil Beispiel GmbH", ort: "Teststadt", kanal: "Website", stufe: "Neu", wer: "Dean", naechster_schritt: "Erstkontakt per Mail", faellig: addTage(heute, 2), upload_id: "00000000-0000-4000-8000-000000000002" }),
    l({ firma: "Altbau & Co Immobilien", ort: "Probeburg", kanal: "Brief", stufe: "Kontaktiert", wer: "Dean", letzter_kontakt: addTage(heute, -1), naechster_schritt: "Rückmeldung abwarten", faellig: addTage(heute, 4) }),
    l({ firma: "Lindenhof Makler", ansprechpartner: "Frau Probe", ort: "Demostadt", kanal: "Empfehlung", stufe: "Probevideo geliefert", wer: "Arthur", letzter_kontakt: addTage(heute, -2), naechster_schritt: "Rückmeldung zum Video erfragen", faellig: addTage(heute, 3) }),
    l({ firma: "Test Immobilienbüro", ort: "Musterstadt", kanal: "Telefon", stufe: "Ruht", letzter_kontakt: addTage(heute, -9), notiz: "Meldet sich selbst, wenn Bedarf besteht." }),
  ];

  const team = [
    { email: "demo@example.com", name: "Arthur", created_at: zeitAn(dat(1), "09:00") },
    { email: "dean@example.com", name: "Dean", created_at: zeitAn(dat(1), "09:01") },
  ];

  return { plantage, aufgaben, notizen, leads, uploads, team, einstellungen: [], uid };
}

function stripeAntwort(art, heute) {
  const jetztIso = jetzt().toISOString();
  const leer = {
    status: "ok", waehrung: "eur", stand: jetztIso, guthaben: { verfuegbar: 0, ausstehend: 0 },
    umsatz: { heute: 0, woche: 0, monat: 0, plan: 0, gesamt: 0 }, anzahl: { heute: 0, monat: 0, plan: 0, gesamt: 0 }, kunden_anzahl: 0, zahlungen: [],
  };
  if (art === "aus") return { status: "nicht_eingerichtet" };
  if (art === "fehler") return { status: "fehler", meldung: "Stripe antwortet gerade nicht. Bitte später erneut versuchen." };
  if (art === "zahlungen") {
    return {
      ...leer, guthaben: { verfuegbar: 12840, ausstehend: 4900 }, umsatz: { heute: 4900, woche: 14900, monat: 14900, plan: 14900, gesamt: 14900 },
      anzahl: { heute: 1, monat: 2, plan: 2, gesamt: 2 }, kunden_anzahl: 2,
      zahlungen: [
        { id: "py_1", betrag: 4900, waehrung: "eur", status: "succeeded", beschreibung: "Erstes Video-Paket", kunde: "Lindenhof Makler", datum: `${heute}T09:12:00+01:00`, beleg_url: "https://example.com/beleg/1" },
        { id: "py_2", betrag: 10000, waehrung: "eur", status: "succeeded", beschreibung: "Videopaket", kunde: "Muster Immobilien GmbH", datum: `${addTage(heute, -2)}T15:30:00+01:00`, beleg_url: null },
        { id: "py_3", betrag: 4900, waehrung: "eur", status: "pending", beschreibung: "Einzelvideo", kunde: "Beispiel & Partner", datum: `${addTage(heute, -1)}T11:02:00+01:00`, beleg_url: null },
      ],
    };
  }
  return leer;
}

export function createDemo({ ich = "Arthur", heute, stripe = "", gmail = "" }) {
  const T0 = new Date(`${heute}T09:41:00+01:00`).getTime();
  setzeUhr({ versatzMs: T0 - Date.now(), heute });
  const S = seed(heute, ich);
  const db = {
    dash_plantage: S.plantage, dash_aufgaben: S.aufgaben, dash_notizen: S.notizen, dash_leads: S.leads, dash_team: S.team,
    dash_einstellungen: S.einstellungen, upload_anfragen: S.uploads,
  };
  if (gmail) db.dash_einstellungen.push({ schluessel: "google_client_id", wert: "demo-client-id.apps.googleusercontent.com", updated_at: new Date().toISOString() });
  demoGesehenSetzen("notizen", `${addTage(heute, -1)}T18:00:00+01:00`);
  demoGesehenSetzen("uploads", `${addTage(heute, -1)}T18:00:00+01:00`);

  let nextId = 5000;
  const ID = { dash_team: "email", dash_einstellungen: "schluessel" };
  const col = (t) => ID[t] || "id";
  const warte = (ms = 60) => new Promise((r) => setTimeout(r, ms));
  const kopie = (x) => JSON.parse(JSON.stringify(x));
  const jetztIso = () => jetzt().toISOString();
  const defaults = {
    dash_aufgaben: () => ({ id: nextId++, dauer: null, quelle: "eigen", sortierung: 0, erledigt_am: null, erledigt_von: null, created_at: jetztIso(), erstellt_von: ich }),
    dash_notizen: () => ({ id: nextId++, created_at: jetztIso(), autor: ich, angeheftet: false }),
    dash_leads: () => ({ id: nextId++, created_at: jetztIso(), updated_at: jetztIso(), ansprechpartner: null, email: null, telefon: null, ort: null, website: null, kanal: "Sonstiges", stufe: "Neu", wer: null, letzter_kontakt: null, naechster_schritt: null, faellig: null, notiz: null, upload_id: null, erstellt_von: ich }),
    dash_team: () => ({ created_at: jetztIso() }),
    dash_einstellungen: () => ({ updated_at: jetztIso() }),
  };

  return {
    modus: "demo",
    async ich() { return ich; },
    async list(t) { await warte(); return kopie(db[t] || []); },
    async insert(t, row) {
      await warte();
      const r = { ...(defaults[t] ? defaults[t]() : {}), ...row };
      db[t].push(r);
      return kopie(r);
    },
    async update(t, match, patch) {
      await warte(40);
      const c = Object.keys(match)[0];
      const r = db[t].find((x) => x[c] === match[c]);
      if (!r) throw new Error("Eintrag nicht gefunden.");
      Object.assign(r, patch);
      if (t === "dash_leads") r.updated_at = jetztIso();
      return kopie(r);
    },
    async remove(t, match) {
      await warte(40);
      const c = Object.keys(match)[0];
      const i = db[t].findIndex((x) => x[c] === match[c]);
      if (i > -1) db[t].splice(i, 1);
    },
    async upsert(t, row, onConflict) {
      await warte(40);
      const i = db[t].findIndex((x) => x[onConflict] === row[onConflict]);
      if (i > -1) { Object.assign(db[t][i], row); return kopie(db[t][i]); }
      const r = { ...(defaults[t] ? defaults[t]() : {}), ...row };
      db[t].push(r);
      return kopie(r);
    },
    async uploadBilder(u) {
      await warte(160);
      const n = Math.min(u.anzahl_fotos || 0, 8);
      const paare = [["#E9B98A", "#B5452A"], ["#F5C14C", "#8F3319"], ["#D9C2AE", "#5E4A40"], ["#FFD36B", "#B5452A"]];
      const fotos = Array.from({ length: n }, (_, i) => ({ name: `foto-${i + 1}.jpg`, url: bild(paare[i % 4][0], paare[i % 4][1], i) }));
      const logo = u.mit_logo ? [{ name: "logo.png", url: bild("#FFF4E6", "#24140E", 1) }] : [];
      return { fotos, logo };
    },
    async stripe() { await warte(240); return stripeAntwort(stripe, heute); },
    subscribe() { return () => {}; },
    async signOut() { location.search = ""; },
    async session() { return { user: { email: "demo@example.com" } }; },
    onAuth() { return { data: { subscription: { unsubscribe() {} } } }; },
    demoGmail: gmail,
  };
}

export const demoOptionen = (params) => ({
  ich: params.get("ich") === "Dean" ? "Dean" : "Arthur",
  heute: /^\d{4}-\d{2}-\d{2}$/.test(params.get("heute") || "") ? params.get("heute") : "2026-11-10",
  stripe: params.get("stripe") || "",
  gmail: params.get("gmail") || "",
});

export { config };
