// Stripe: Umsatz, Guthaben, Ziel, letzte Zahlungen (über die Edge Function dashboard-stripe).
import { h, ersetze, euro, zeitRelativ, datumTM, datumVonTag, plural, nurHttp, config } from "../util.js";
import { icon } from "../icons.js";
import { state, onChange, stripeLaden, heutigerTag, planStatus } from "../store.js";
import { shell } from "./shell.js";

const STATUS = {
  succeeded: ["Bezahlt", "ok"], paid: ["Bezahlt", "ok"], pending: ["Ausstehend", "warte"], processing: ["Ausstehend", "warte"],
  failed: ["Fehlgeschlagen", "fehler"], refunded: ["Erstattet", "ruhig"], canceled: ["Abgebrochen", "ruhig"], requires_payment_method: ["Offen", "warte"],
};

function kachel(label, wert, unter, klasse = "") {
  return h("div", { class: `kachel ${klasse}` }, h("p", { class: "kachel-label" }, label), h("p", { class: "kachel-wert" }, wert), unter ? h("p", { class: "kachel-unter" }, unter) : null);
}

function schritte() {
  const li = (...k) => h("li", null, ...k);
  return h("section", { class: "karte karte-hinweis" },
    h("div", { class: "karte-kopf" }, h("div", { class: "kopf-icon" }, icon("stripe")), h("div", null, h("h2", null, "Stripe verbinden"), h("p", null, "Einmal einrichten, dann erscheinen Umsatz und Zahlungen hier. Es wird nur gelesen."))),
    h("ol", { class: "schritte" },
      li(h("strong", null, "Schlüssel anlegen. "), "In Stripe unter Entwickler, API-Schlüssel einen eingeschränkten Schlüssel erstellen, nur mit Leserechten (Zahlungen, Kunden, Guthaben)."),
      li(h("strong", null, "Schlüssel kopieren. "), "Er beginnt mit ", h("code", null, "rk_"), "."),
      li(h("strong", null, "In Supabase speichern. "), "Projekt öffnen, Edge Functions, Secrets, neues Secret ", h("code", null, "STRIPE_API_KEY"), " mit dem Schlüssel anlegen."),
      li(h("strong", null, "Prüfen. "), "Unten auf „Erneut prüfen“ klicken."),
    ),
    h("button", { type: "button", class: "btn btn-terra", onclick: () => stripeLaden(true) }, icon("refresh"), "Erneut prüfen"),
  );
}

export function mountStripe() {
  const host = h("div", { class: "stripe" });
  const { el, main } = shell({ id: "stripe", titel: "Stripe", inhalt: host });

  function zielKarte(d) {
    const ziel = config.ziel || { umsatzCent: 20000, kunden: 2, ersterKundeTag: 21 };
    const umsatz = d.umsatz?.plan ?? 0;
    const kunden = d.anzahl?.plan ?? 0;
    const anteil = Math.min(1, umsatz / ziel.umsatzCent);
    const bis = datumVonTag(config.planTage || 30);
    const punkte = Array.from({ length: ziel.kunden }, (_, i) => h("span", { class: `kunde-punkt${i < kunden ? " voll" : ""}`, "aria-hidden": "true" }));
    const balken = h("div", { class: "balken", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(ziel.umsatzCent / 100), "aria-valuenow": String(Math.round(umsatz / 100)), "aria-label": "Umsatz bis zum Ziel" }, h("div", { class: "balken-fuell" }));
    balken.firstChild.style.width = `${(anteil * 100).toFixed(1)}%`;
    return h("section", { class: "karte karte-ziel" },
      h("div", { class: "karte-kopf" }, h("div", null, h("h2", null, "Ziel bis Tag 30"), h("p", null, `${euro(ziel.umsatzCent, d.waehrung)} Umsatz und ${plural(ziel.kunden, "zahlender Kunde", "zahlende Kunden")} bis ${datumTM(bis)}`))),
      h("div", { class: "ziel-zeilen" },
        h("div", null,
          h("div", { class: "ziel-zeile" }, h("strong", null, euro(umsatz, d.waehrung)), h("span", null, `von ${euro(ziel.umsatzCent, d.waehrung)}`)),
          balken,
        ),
        h("div", null,
          h("div", { class: "ziel-zeile" }, h("strong", null, `${kunden} von ${ziel.kunden}`), h("span", null, "zahlende Kunden")),
          h("div", { class: "kunde-punkte" }, punkte),
        ),
      ),
    );
  }

  function zahlungen(d) {
    const z = d.zahlungen || [];
    if (!z.length) {
      const tag21 = datumVonTag((config.ziel && config.ziel.ersterKundeTag) || 21);
      return h("section", { class: "karte" },
        h("h2", { class: "karte-titel" }, "Letzte Zahlungen"),
        h("div", { class: "leer-karte" }, h("div", { class: "leer-punkte", "aria-hidden": "true" }, h("span"), h("span"), h("span")),
          h("p", { class: "leer-gross" }, "Noch keine Zahlung"),
          h("p", null, `Das Ziel: erster Kunde bis Tag ${(config.ziel && config.ziel.ersterKundeTag) || 21} (${datumTM(tag21)})`)),
      );
    }
    return h("section", { class: "karte" },
      h("h2", { class: "karte-titel" }, "Letzte Zahlungen"),
      h("ul", { class: "zahlungen" }, z.map((p) => {
        const st = STATUS[p.status] || [p.status || "–", "ruhig"];
        const beleg = nurHttp(p.beleg_url);
        return h("li", { class: "zahlung" },
          h("div", { class: "zahlung-info" }, h("strong", null, p.kunde || p.beschreibung || "Zahlung"), h("span", null, [p.kunde ? p.beschreibung : "", zeitRelativ(p.datum)].filter(Boolean).join(" · "))),
          h("span", { class: `chip chip-${st[1]}` }, st[0]),
          h("strong", { class: "zahlung-betrag" }, euro(p.betrag, p.waehrung)),
          beleg ? h("a", { class: "icon-btn", href: beleg, target: "_blank", rel: "noopener noreferrer", "aria-label": "Beleg öffnen" }, icon("external")) : h("span", { class: "icon-btn-platz" }),
        );
      })),
    );
  }

  function render() {
    const s = state.stripe;
    const kids = [];
    const kopfAktion = h("button", { type: "button", class: "btn btn-line btn-sm", disabled: s.status === "laden", onclick: () => stripeLaden(true) }, icon("refresh"), s.status === "laden" ? "Lädt …" : "Aktualisieren");
    if (s.status === "ok") {
      const d = s.daten;
      const w = d.waehrung;
      kids.push(h("div", { class: "seiten-kopf" }, h("p", { class: "stand" }, d.stand ? `Stand ${zeitRelativ(d.stand)}` : ""), kopfAktion));
      kids.push(h("div", { class: "kacheln" },
        kachel("Heute", euro(d.umsatz?.heute ?? 0, w), plural(d.anzahl?.heute ?? 0, "Zahlung", "Zahlungen")),
        kachel("Dieser Monat", euro(d.umsatz?.monat ?? 0, w), plural(d.anzahl?.monat ?? 0, "Zahlung", "Zahlungen")),
        kachel(planStatus() === "laeuft" ? `Seit Plan-Start (Tag ${heutigerTag()})` : "Seit Plan-Start", euro(d.umsatz?.plan ?? 0, w), plural(d.anzahl?.plan ?? 0, "Zahlung", "Zahlungen")),
        kachel("Guthaben", euro(d.guthaben?.verfuegbar ?? 0, w), `${euro(d.guthaben?.ausstehend ?? 0, w)} ausstehend`),
      ));
      kids.push(h("div", { class: "stripe-unten" }, zielKarte(d), zahlungen(d)));
    } else if (s.status === "nicht_eingerichtet") {
      kids.push(schritte());
    } else if (s.status === "fehler") {
      kids.push(h("section", { class: "karte karte-ruhig" }, h("h2", null, "Stripe ist gerade nicht erreichbar"), h("p", null, s.meldung || "Bitte später erneut versuchen."), kopfAktion));
    } else {
      kids.push(h("div", { class: "kacheln" }, [0, 1, 2, 3].map(() => h("div", { class: "kachel kachel-skelett" }, h("p", { class: "kachel-label" }, " "), h("p", { class: "kachel-wert" }, " ")))));
    }
    ersetze(host, kids);
  }

  render();
  stripeLaden();
  const ab = onChange((art) => { if (art === "stripe") render(); });
  return { el, destroy() { ab(); } };
}
