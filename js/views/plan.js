// 30-Tage-Plan: links Dean, Mitte Notizen, rechts Arthur. Übernahme offener Aufgaben, Tagesnavigation.
import { h, ersetze, zeit, datumKurz, datumTM, tagNr, heute, planTage, teileText, zweistufig } from "../util.js";
import { icon } from "../icons.js";
import {
  state, onChange, fokusTag, planStatus, plantag, datumVonTagRow, aufgabenFuer, istUebernommen, tagStatus,
  aufgabeUmschalten, aufgabeAnlegen, aufgabeLoeschen,
} from "../store.js";
import { shell, segmente } from "./shell.js";
import { createChat } from "./chat.js";

const U = 2 * Math.PI * 17; // Umfang des Fortschrittsrings

function ring(erledigt, gesamt) {
  const anteil = gesamt ? erledigt / gesamt : 0;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 40 40");
  svg.setAttribute("class", "ring");
  svg.setAttribute("aria-hidden", "true");
  const spur = document.createElementNS(svg.namespaceURI, "circle");
  for (const [k, v] of Object.entries({ cx: 20, cy: 20, r: 17, class: "ring-spur" })) spur.setAttribute(k, v);
  const wert = document.createElementNS(svg.namespaceURI, "circle");
  for (const [k, v] of Object.entries({ cx: 20, cy: 20, r: 17, class: "ring-wert", "stroke-dasharray": U.toFixed(2) })) wert.setAttribute(k, v);
  wert.style.strokeDashoffset = (U * (1 - anteil)).toFixed(2);
  svg.append(spur, wert);
  return svg;
}

export function mountPlan(ctx, param) {
  const N = planTage();
  let tag = Number.parseInt(param, 10);
  if (!(tag >= 1 && tag <= N)) tag = fokusTag();
  const geoeffnet = new Set(); // aufgeklappte Aufgabentexte
  const chat = createChat({ kompakt: true });

  const kopfHost = h("div", { class: "plan-kopf" });
  const leiste = h("div", { class: "tagleiste", role: "group", "aria-label": "Tage des Plans" });
  const grid = h("div", { class: "plan-grid", dataset: { tab: state.ich === "Dean" ? "Dean" : state.ich === "Arthur" ? "Arthur" : "Notizen" } });
  const spalten = {};

  const tabs = segmente(
    [{ id: "Dean", label: "Dean" }, { id: "Notizen", label: "Notizen" }, { id: "Arthur", label: "Arthur" }],
    grid.dataset.tab,
    (id) => { grid.dataset.tab = id; if (id === "Notizen") chat.zeigen(); },
    "Ansicht wählen",
  );

  const datum = () => datumVonTagRow(tag);
  const istHeute = () => datum() === heute();
  const modus = () => (planStatus() === "vor" ? "vorschau" : datum() > heute() ? "vorschau" : datum() < heute() ? "vergangen" : "heute");

  function gehe(n) {
    tag = Math.min(Math.max(n, 1), N);
    try { history.replaceState(null, "", `#/plan/${tag}`); } catch { /* egal */ }
    rendereAlles();
  }

  /* ---- Kopf ---- */
  function rendereKopf() {
    const pt = plantag(tag);
    const m = modus();
    const chip = m === "heute" ? ["Heute", "chip-heute"] : m === "vergangen" ? ["Vergangen", "chip-ruhig"] : ["Vorschau", "chip-ruhig"];
    ersetze(kopfHost,
      h("div", { class: "tagnav" },
        h("button", { type: "button", class: "icon-btn icon-btn-gross", "aria-label": "Vorheriger Tag", disabled: tag <= 1, onclick: () => gehe(tag - 1) }, icon("back")),
        h("div", { class: "tagnav-mitte", "aria-live": "polite" }, h("strong", null, `Tag ${tag}`), h("span", null, datumKurz(datum()))),
        h("button", { type: "button", class: "icon-btn icon-btn-gross", "aria-label": "Nächster Tag", disabled: tag >= N, onclick: () => gehe(tag + 1) }, icon("next")),
        h("button", { type: "button", class: "btn btn-line btn-sm", disabled: tag === fokusTag(), onclick: () => gehe(fokusTag()) }, "Heute"),
      ),
      h("div", { class: "tagtitel" },
        h("h2", null, pt?.titel || `Tag ${tag}`),
        h("p", null, pt?.woche ? `Woche ${pt.woche}` : "", pt?.woche ? " · " : "", h("span", { class: `chip ${chip[1]}` }, chip[0])),
      ),
    );
  }

  function rendereLeiste() {
    const fok = fokusTag();
    const kids = [];
    for (let t = 1; t <= N; t++) {
      const d = datumVonTagRow(t);
      const st = planStatus() !== "vor" && t < fok ? tagStatus(d) : "";
      const klasse = ["tag-punkt", t === fok && planStatus() === "laeuft" ? "ist-heute" : "", t === tag ? "gewaehlt" : "", st === "fertig" ? "fertig" : st === "offen" ? "offen" : ""].filter(Boolean).join(" ");
      kids.push(h("button", { type: "button", class: klasse, "aria-label": `Tag ${t}, ${datumKurz(d)}${t === tag ? ", ausgewählt" : ""}`, "aria-pressed": t === tag ? "true" : "false", onclick: () => gehe(t) }, h("span", { class: "pkt" })));
    }
    ersetze(leiste, kids);
  }

  /* ---- Aufgaben ---- */
  function aufgabeEl(a, tagDatum, vorschau) {
    const { kopf, rest } = teileText(a.text);
    const fertig = !!a.erledigt_am;
    const tmp = typeof a.id === "string";
    const cb = h("input", { type: "checkbox", checked: fertig, disabled: vorschau || tmp, "aria-label": `Erledigt: ${kopf}`, onchange: () => aufgabeUmschalten(a.id, cb.checked) });
    const offen = geoeffnet.has(a.id);
    const rcBox = h("p", { class: "aufgabe-rest", hidden: !offen || !rest, id: `rest-${a.id}` }, rest);
    const mehr = rest ? h("button", { type: "button", class: "mehr", "aria-expanded": offen ? "true" : "false", "aria-controls": `rest-${a.id}`, onclick: () => {
      const an = !geoeffnet.has(a.id);
      an ? geoeffnet.add(a.id) : geoeffnet.delete(a.id);
      mehr.setAttribute("aria-expanded", an ? "true" : "false");
      rcBox.hidden = !an;
      mehr.firstChild.textContent = an ? "Weniger" : "Mehr";
    } }, h("span", null, offen ? "Weniger" : "Mehr"), icon("chevron")) : null;

    const marken = [];
    if (istUebernommen(a, tagDatum)) marken.push(h("span", { class: "marke marke-uebernommen", title: "Übernommen von einem früheren Tag" }, `von Tag ${tagNr(a.datum)}`));
    if (a.dauer) marken.push(h("span", { class: "marke" }, a.dauer));
    if (a.quelle === "eigen") marken.push(h("span", { class: "marke marke-eigen" }, "Eigene"));

    const wer = fertig && a.erledigt_von ? h("p", { class: "aufgabe-wer" }, `Erledigt von ${a.erledigt_von}, ${zeit(a.erledigt_am)}`) : null;
    const loesch = a.quelle === "eigen" && !tmp ? zweistufig(h("button", { type: "button", class: "icon-btn", "aria-label": `Eigene Aufgabe löschen: ${kopf}` }, icon("trash")), () => aufgabeLoeschen(a.id), "Löschen?") : null;

    return h("li", { class: `aufgabe${fertig ? " erledigt" : ""}${tmp ? " sendet" : ""}`, dataset: { id: a.id } },
      h("label", { class: "check" }, cb, h("span", { class: "box" }, icon("check"))),
      h("div", { class: "aufgabe-text" },
        h("div", { class: "aufgabe-zeile" }, h("span", { class: "aufgabe-kopf" }, kopf)),
        marken.length ? h("div", { class: "marken" }, marken) : null,
        rcBox, mehr, wer,
      ),
      loesch ? h("div", { class: "aufgabe-aktionen" }, loesch) : null,
    );
  }

  function gruppe(titel, items, tagDatum, vorschau, klasse = "") {
    if (!items.length) return null;
    return h("div", { class: `gruppe ${klasse}` },
      h("h3", { class: "gruppe-titel" }, titel, h("span", { class: "gruppe-zahl" }, String(items.length))),
      h("ul", { class: "aufgaben" }, items.map((a) => aufgabeEl(a, tagDatum, vorschau))),
    );
  }

  function baueSpalte(person) {
    const kopf = h("div", { class: "spalte-kopf" });
    const inhalt = h("div", { class: "spalte-inhalt" });
    const eingabe = h("input", { type: "text", class: "eingabe", maxlength: "1000", placeholder: "Eigene Aufgabe hinzufügen …", "aria-label": `Eigene Aufgabe für ${person} hinzufügen`, autocomplete: "off" });
    const form = h("form", { class: "neu-aufgabe", novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const t = eingabe.value;
      if (!t.trim()) return;
      eingabe.value = "";
      const ok = await aufgabeAnlegen(person, datum(), t);
      if (!ok) eingabe.value = t;
      eingabe.focus();
    } }, eingabe, h("button", { type: "submit", class: "btn btn-terra btn-icon-only", "aria-label": "Aufgabe hinzufügen" }, icon("plus")));
    const el = h("section", { class: `spalte spalte-${person.toLowerCase()}`, "aria-label": `Aufgaben ${person}`, dataset: { person } }, kopf, inhalt, form);
    spalten[person] = { el, kopf, inhalt };
    return el;
  }

  function rendereSpalte(person) {
    const sp = spalten[person];
    const d = datum();
    const m = modus();
    const vorschau = m === "vorschau";
    const alle = aufgabenFuer(person, d);
    const fertig = alle.filter((a) => a.erledigt_am).length;
    const uebern = alle.filter((a) => istUebernommen(a, d));
    const heutige = alle.filter((a) => !istUebernommen(a, d));
    const ich = state.ich === person;

    ersetze(sp.kopf,
      h("div", { class: `avatar avatar-${person.toLowerCase()}`, "aria-hidden": "true" }, person[0]),
      h("div", { class: "spalte-name" }, h("h2", null, person), ich ? h("span", { class: "chip chip-du" }, "Das sind Sie") : null),
      h("div", { class: "fortschritt", role: "img", "aria-label": `${fertig} von ${alle.length} erledigt` },
        ring(fertig, alle.length),
        h("span", { class: "fortschritt-text" }, h("strong", null, String(fertig)), `/${alle.length}`),
      ),
    );

    const kids = [];
    if (vorschau) kids.push(h("p", { class: "hinweis-vorschau" }, planStatus() === "vor" ? "Der Plan hat noch nicht begonnen. Abhaken geht ab Tag 1." : "Vorschau: Abhaken ist ab diesem Tag möglich."));
    if (!alle.length) kids.push(h("p", { class: "leer-hinweis" }, state.fehler.dash_aufgaben ? `Aufgaben konnten nicht geladen werden: ${state.fehler.dash_aufgaben}` : "Keine Aufgaben für diesen Tag."));
    kids.push(gruppe("Übernommen", uebern, d, vorschau, "gruppe-uebernommen"));
    kids.push(gruppe(m === "heute" ? "Heute" : `Tag ${tag}`, heutige, d, vorschau));
    if (alle.length && fertig === alle.length) kids.push(h("p", { class: "alles-fertig" }, icon("check"), "Alles erledigt"));
    ersetze(sp.inhalt, kids);
  }

  function rendereAlles() {
    rendereKopf();
    rendereLeiste();
    rendereSpalte("Dean");
    rendereSpalte("Arthur");
    for (const p of ["Dean", "Arthur"]) {
      const offen = aufgabenFuer(p, datum()).filter((a) => !a.erledigt_am).length;
      tabs.setzeZahl(p, offen || "");
    }
  }

  // Aufbau
  const chatKopf = h("div", { class: "spalte-kopf spalte-kopf-chat" },
    h("div", { class: "avatar avatar-notiz", "aria-hidden": "true" }, icon("notizen")),
    h("div", { class: "spalte-name" }, h("h2", null, "Notizen"), h("p", null, "Gemeinsam mit dem Team")),
  );
  const chatSpalte = h("section", { class: "spalte spalte-chat", "aria-label": "Notizen" }, chatKopf, chat.el);
  grid.append(baueSpalte("Dean"), chatSpalte, baueSpalte("Arthur"));

  rendereAlles();
  const { el, main } = shell({ id: "plan", titel: "30-Tage-Plan", inhalt: [kopfHost, leiste, tabs.el, grid] });
  main.classList.add("plan");

  const ab = onChange((art) => {
    if (art === "aufgaben" || art === "plantage" || art === "alles" || art === "tag") { rendereAlles(); }
    chat.update(art);
  });

  return {
    el,
    afterMount() { chat.zeigen(); },
    update(art) { if (art === "tag") { if (!Number.isInteger(tag)) tag = fokusTag(); rendereAlles(); } },
    destroy() { ab(); },
  };
}
