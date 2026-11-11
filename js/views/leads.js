// Leads: Zähler je Stufe (Filter), Suche, Tabelle bzw. Karten, Seitenpanel zum Anlegen/Bearbeiten.
import { h, ersetze, heute, datumTM, datumKurz, debounce, plural, toast, fehlerText, sauber, nurHttp, leer } from "../util.js";
import { icon } from "../icons.js";
import { state, onChange, STUFEN, KANAELE, PERSONEN, leadSpeichern, leadStufe, leadLoeschen, leadFaellig, leadVorlage } from "../store.js";
import { shell } from "./shell.js";

const alsText = (v) => (v == null ? "" : String(v));

function faelligChip(l) {
  if (!l.faellig) return h("span", { class: "faellig faellig-leer" }, "–");
  const h0 = heute();
  const abgeschlossen = l.stufe === "Kunde" || l.stufe === "Ruht";
  const art = abgeschlossen ? "" : l.faellig < h0 ? "ueber" : l.faellig === h0 ? "heute" : "";
  const text = !abgeschlossen && art === "ueber" ? `${datumKurz(l.faellig)} überfällig` : art === "heute" ? "Heute" : datumKurz(l.faellig);
  return h("span", { class: `faellig ${art ? `faellig-${art}` : ""}` }, text);
}

function stufeSelect(l) {
  const s = h("select", { class: "stufe-select", "aria-label": `Stufe von ${l.firma}`, dataset: { stufe: l.stufe }, onchange: () => leadStufe(l.id, s.value), onclick: (e) => e.stopPropagation() },
    STUFEN.map((x) => h("option", { value: x, selected: x === l.stufe }, x)));
  return s;
}

/* ---------- Panel (Dialog) ---------- */
function oeffnePanel(lead, { ich }) {
  const neu = !lead.id;
  const dlg = h("dialog", { class: "panel", "aria-labelledby": "panel-titel" });
  const f = {};
  const feld = (name, label, el, extra = {}) => {
    f[name] = el;
    return h("div", { class: `feld${extra.breit ? " feld-breit" : ""}` }, h("label", { for: `f-${name}` }, label), el);
  };
  const text = (name, p = {}) => h("input", { id: `f-${name}`, name, type: p.type || "text", value: alsText(lead[name]), maxlength: p.max || "200", autocomplete: "off", required: p.required, inputmode: p.inputmode, placeholder: p.placeholder });
  const auswahl = (name, werte, leerOption) => h("select", { id: `f-${name}`, name }, leerOption ? h("option", { value: "" }, leerOption) : null, werte.map((w) => h("option", { value: w, selected: w === lead[name] }, w)));
  const fehlerBox = h("p", { class: "fehler-text", role: "alert", hidden: true });

  const form = h("form", { class: "panel-form", novalidate: true },
    h("div", { class: "panel-kopf" },
      h("h2", { id: "panel-titel" }, neu ? "Lead hinzufügen" : "Lead bearbeiten"),
      h("button", { type: "button", class: "icon-btn", "aria-label": "Schließen", onclick: () => dlg.close() }, icon("close")),
    ),
    h("div", { class: "panel-body" },
      feld("firma", "Firma / Büro *", text("firma", { required: true, max: "200" }), { breit: true }),
      feld("ansprechpartner", "Ansprechpartner", text("ansprechpartner")),
      feld("ort", "Ort", text("ort", { max: "120" })),
      feld("email", "E-Mail", text("email", { type: "email", max: "254", inputmode: "email" })),
      feld("telefon", "Telefon", text("telefon", { type: "tel", max: "50", inputmode: "tel" })),
      feld("website", "Website", text("website", { max: "300", inputmode: "url", placeholder: "https://" }), { breit: true }),
      feld("kanal", "Kanal", auswahl("kanal", KANAELE)),
      feld("stufe", "Stufe", auswahl("stufe", STUFEN)),
      feld("wer", "Zuständig", auswahl("wer", PERSONEN, "Niemand")),
      feld("letzter_kontakt", "Letzter Kontakt", text("letzter_kontakt", { type: "date" })),
      feld("naechster_schritt", "Nächster Schritt", text("naechster_schritt", { max: "500" }), { breit: true }),
      feld("faellig", "Fällig am", text("faellig", { type: "date" })),
      feld("notiz", "Notiz", h("textarea", { id: "f-notiz", name: "notiz", rows: "4", maxlength: "4000" }, alsText(lead.notiz)), { breit: true }),
    ),
    fehlerBox,
    h("div", { class: "panel-fuss" },
      neu ? h("span") : (() => {
        const b = h("button", { type: "button", class: "btn btn-quiet btn-gefahr" }, icon("trash"), "Löschen");
        let schritt = 0;
        b.addEventListener("click", async () => {
          if (!schritt) { schritt = 1; b.replaceChildren(document.createTextNode("Wirklich löschen?")); b.classList.add("bestaetigen"); setTimeout(() => { if (schritt === 1) { schritt = 0; b.classList.remove("bestaetigen"); b.replaceChildren(icon("trash"), document.createTextNode("Löschen")); } }, 3500); return; }
          b.disabled = true;
          try { await leadLoeschen(lead.id); toast("Lead gelöscht."); dlg.close(); }
          catch (e) { b.disabled = false; fehlerBox.textContent = `Nicht gelöscht: ${fehlerText(e)}`; fehlerBox.hidden = false; }
        });
        return b;
      })(),
      h("div", { class: "panel-fuss-rechts" },
        h("button", { type: "button", class: "btn btn-line", onclick: () => dlg.close() }, "Abbrechen"),
        h("button", { type: "submit", class: "btn btn-terra" }, "Speichern"),
      ),
    ),
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    fehlerBox.hidden = true;
    if (!form.reportValidity()) return;
    const daten = { ...(lead.id ? { id: lead.id } : {}), upload_id: lead.upload_id || null };
    for (const [k, el] of Object.entries(f)) daten[k] = el.value;
    const w = daten.website && !/^[a-z]+:\/\//i.test(daten.website.trim()) ? `https://${daten.website.trim()}` : daten.website;
    daten.website = w;
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      await leadSpeichern(daten);
      toast(neu ? "Lead angelegt." : "Lead gespeichert.");
      dlg.close();
    } catch (err) {
      btn.disabled = false;
      fehlerBox.textContent = `Nicht gespeichert: ${fehlerText(err)}`;
      fehlerBox.hidden = false;
    }
  });

  dlg.append(form);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => {
    dlg.remove();
    if (location.hash === "#/leads/neu") history.replaceState(null, "", "#/leads");
  });
  document.body.append(dlg);
  dlg.showModal();
  f.firma.focus();
  return dlg;
}

export function mountLeads(ctx, param) {
  const ich = state.ich;
  let stufe = "alle";
  let wer = "alle";
  let suche = "";
  const sichtbarEl = h("div", { class: "leads-liste" });
  const chipsEl = h("div", { class: "stufen-chips", role: "group", "aria-label": "Nach Stufe filtern" });
  const zaehlEl = h("p", { class: "stand" });
  const suchfeld = h("input", { type: "search", class: "suche", placeholder: "Suchen …", "aria-label": "Leads durchsuchen", autocomplete: "off", oninput: debounce(() => { suche = suchfeld.value.trim().toLowerCase(); rendere(); }, 120) });
  const werGruppe = h("div", { class: "wer-filter", role: "group", "aria-label": "Nach Zuständigkeit filtern" });
  const neuBtn = h("button", { type: "button", class: "btn btn-terra", onclick: () => oeffnePanel({ kanal: "Sonstiges", stufe: "Neu", wer: PERSONEN.includes(ich) ? ich : "" }, { ich }) }, icon("plus"), "Lead hinzufügen");

  const werOpts = [["alle", "Alle"], ["Arthur", "Arthur"], ["Dean", "Dean"]];

  function filtern() {
    return state.leads.filter((l) => {
      if (stufe !== "alle" && l.stufe !== stufe) return false;
      if (wer !== "alle" && l.wer !== wer) return false;
      if (suche) {
        const heu = [l.firma, l.ansprechpartner, l.ort, l.email, l.telefon, l.naechster_schritt, l.notiz, l.website].map((x) => (x || "").toLowerCase()).join(" ");
        if (!heu.includes(suche)) return false;
      }
      return true;
    }).sort((a, b) => {
      const fa = a.faellig || "9999", fb = b.faellig || "9999";
      return fa < fb ? -1 : fa > fb ? 1 : (b.updated_at || "").localeCompare(a.updated_at || "");
    });
  }

  const bearbeiten = (l) => oeffnePanel({ ...l }, { ich });

  function zeile(l) {
    const kontakt = [l.ansprechpartner, l.ort].filter((x) => !leer(x)).join(" · ");
    const tr = h("tr", { class: leadFaellig(l) ? "faellig-zeile" : "", onclick: () => bearbeiten(l) },
      h("td", { class: "lead-firma" }, h("button", { type: "button", class: "lead-name", onclick: (e) => { e.stopPropagation(); bearbeiten(l); } }, l.firma), kontakt ? h("span", { class: "lead-sub" }, kontakt) : null),
      h("td", null, l.ort || h("span", { class: "dim" }, "–")),
      h("td", null, stufeSelect(l)),
      h("td", null, l.wer ? h("span", { class: `wer wer-${l.wer.toLowerCase()}` }, l.wer) : h("span", { class: "dim" }, "–")),
      h("td", { class: "lead-schritt" }, l.naechster_schritt || h("span", { class: "dim" }, "–")),
      h("td", null, faelligChip(l)),
      h("td", { class: "lead-edit" }, h("button", { type: "button", class: "icon-btn", "aria-label": `${l.firma} bearbeiten`, onclick: (e) => { e.stopPropagation(); bearbeiten(l); } }, icon("edit"))),
    );
    return tr;
  }

  function karte(l) {
    return h("li", { class: `lead-karte${leadFaellig(l) ? " faellig-zeile" : ""}` },
      h("div", { class: "lead-karte-kopf" },
        h("button", { type: "button", class: "lead-name", onclick: () => bearbeiten(l) }, l.firma),
        h("button", { type: "button", class: "icon-btn", "aria-label": `${l.firma} bearbeiten`, onclick: () => bearbeiten(l) }, icon("edit")),
      ),
      [l.ansprechpartner, l.ort].filter((x) => !leer(x)).length ? h("p", { class: "lead-sub" }, [l.ansprechpartner, l.ort].filter((x) => !leer(x)).join(" · ")) : null,
      h("div", { class: "lead-karte-zeile" }, stufeSelect(l), l.wer ? h("span", { class: `wer wer-${l.wer.toLowerCase()}` }, l.wer) : null, faelligChip(l)),
      l.naechster_schritt ? h("p", { class: "lead-schritt" }, h("span", { class: "dim" }, "Nächster Schritt: "), l.naechster_schritt) : null,
    );
  }

  function rendere() {
    // Chips mit Zählern
    const basis = state.leads.filter((l) => wer === "alle" || l.wer === wer);
    const zahl = (s) => basis.filter((l) => l.stufe === s).length;
    ersetze(chipsEl,
      h("button", { type: "button", class: "stufen-chip", "aria-pressed": stufe === "alle" ? "true" : "false", onclick: () => { stufe = "alle"; rendere(); } }, "Alle", h("span", { class: "chip-zahl" }, String(basis.length))),
      STUFEN.map((s) => h("button", { type: "button", class: "stufen-chip", dataset: { stufe: s }, "aria-pressed": stufe === s ? "true" : "false", onclick: () => { stufe = stufe === s ? "alle" : s; rendere(); } }, s, h("span", { class: "chip-zahl" }, String(zahl(s))))),
    );
    ersetze(werGruppe, werOpts.map(([id, label]) => h("button", { type: "button", class: "seg seg-klein", "aria-pressed": wer === id ? "true" : "false", onclick: () => { wer = id; rendere(); } }, label)));

    const liste = filtern();
    zaehlEl.textContent = liste.length === state.leads.length ? plural(liste.length, "Lead", "Leads") : `${liste.length} von ${state.leads.length}`;

    const kids = [];
    if (state.fehler.dash_leads) kids.push(h("p", { class: "fehler-text" }, `Leads konnten nicht geladen werden: ${state.fehler.dash_leads}`));
    if (!liste.length) {
      kids.push(h("div", { class: "leer-karte" }, h("div", { class: "leer-punkte", "aria-hidden": "true" }, h("span"), h("span"), h("span")),
        h("p", { class: "leer-gross" }, state.leads.length ? "Keine Treffer" : "Noch keine Leads"),
        h("p", null, state.leads.length ? "Filter oder Suche anpassen." : "Mit „Lead hinzufügen“ den ersten Kontakt anlegen.")));
    } else {
      kids.push(h("div", { class: "tabelle-box" }, h("table", { class: "tabelle" },
        h("thead", null, h("tr", null, ["Firma", "Ort", "Stufe", "Zuständig", "Nächster Schritt", "Fällig", ""].map((t, i) => h("th", { scope: "col", class: i === 6 ? "sr-th" : "" }, i === 6 ? h("span", { class: "sr-only" }, "Bearbeiten") : t)))),
        h("tbody", null, liste.map(zeile)))));
      kids.push(h("ul", { class: "lead-karten" }, liste.map(karte)));
    }
    ersetze(sichtbarEl, kids);
  }

  const kopf = h("div", { class: "leads-kopf" },
    h("div", { class: "leads-kopf-oben" }, zaehlEl, neuBtn),
    chipsEl,
    h("div", { class: "leads-werkzeuge" }, h("div", { class: "suche-box" }, icon("search"), suchfeld), werGruppe),
  );
  const { el } = shell({ id: "leads", titel: "Leads", inhalt: [kopf, sichtbarEl] });
  rendere();

  // Vorlage aus dem Posteingang oder direkt #/leads/neu
  if (param === "neu") {
    const v = leadVorlage.daten;
    leadVorlage.daten = null;
    queueMicrotask(() => oeffnePanel(v || { kanal: "Sonstiges", stufe: "Neu", wer: PERSONEN.includes(ich) ? ich : "" }, { ich }));
  }

  const ab = onChange((art) => { if (art === "leads" || art === "alles" || art === "tag") rendere(); });
  return { el, destroy() { ab(); document.querySelectorAll("dialog.panel").forEach((d) => d.remove()); } };
}
