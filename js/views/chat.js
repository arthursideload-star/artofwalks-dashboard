// Notizen/Chat: Liste (neueste unten), Eingabe, Anheften, Löschen, Realtime über den Store.
import { h, ersetze, zeit, tagLabel, datumBerlin, zweistufig } from "../util.js";
import { icon } from "../icons.js";
import { state, notizSenden, notizAnheften, notizLoeschen, gesehen } from "../store.js";

export function createChat({ kompakt = false } = {}) {
  const gepinntBox = h("div", { class: "angeheftet", hidden: true });
  const liste = h("ol", { class: "nachrichten", "aria-label": "Nachrichten" });
  const scroller = h("div", { class: "nachrichten-box", tabindex: "0", role: "log", "aria-label": "Notizen-Verlauf" }, liste);
  const feld = h("textarea", { class: "chat-feld", rows: "1", maxlength: "4000", placeholder: "Notiz an das Team schreiben …", "aria-label": "Neue Notiz", enterkeyhint: "send" });
  const senden = h("button", { type: "submit", class: "btn btn-terra chat-senden", "aria-label": "Senden" }, icon("send"));
  const form = h("form", { class: "chat-form", novalidate: true }, feld, senden);
  const el = h("div", { class: `chat${kompakt ? " chat-kompakt" : ""}` }, gepinntBox, scroller, form);

  let sichtbar = false;
  let pinsOffen = false;

  function wachse() {
    feld.style.height = "auto";
    feld.style.height = `${Math.min(feld.scrollHeight, 160)}px`;
  }
  feld.addEventListener("input", wachse);
  feld.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = feld.value;
    if (!t.trim()) return;
    feld.value = "";
    wachse();
    const ok = await notizSenden(t);
    if (!ok) { feld.value = t; wachse(); }
    runter();
    feld.focus();
  });

  function runter() { scroller.scrollTop = scroller.scrollHeight; }
  const nahUnten = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;

  function nachricht(n) {
    const eigen = n.autor === state.ich;
    const tmp = typeof n.id === "string";
    const aktionen = h("div", { class: "msg-aktionen" },
      h("button", { type: "button", class: "icon-btn", "aria-label": n.angeheftet ? "Nicht mehr anheften" : "Anheften", "aria-pressed": n.angeheftet ? "true" : "false", disabled: tmp, onclick: () => notizAnheften(n.id, !n.angeheftet) }, icon("pin")),
      tmp ? null : zweistufig(h("button", { type: "button", class: "icon-btn", "aria-label": "Notiz löschen" }, icon("trash")), () => notizLoeschen(n.id), "Löschen?"),
    );
    return h("li", { class: `msg${eigen ? " eigen" : ""}${tmp ? " sendet" : ""}`, dataset: { autor: n.autor } },
      h("div", { class: "msg-meta" }, h("strong", null, n.autor), h("time", { datetime: n.created_at }, zeit(n.created_at)), n.angeheftet ? h("span", { class: "msg-pin", title: "Angeheftet" }, icon("pin")) : null, aktionen),
      h("div", { class: "bubble" }, n.text),
    );
  }

  function rendere() {
    const unten = nahUnten() || !liste.firstChild;
    const kids = [];
    let letzterTag = "";
    for (const n of state.notizen) {
      const tag = datumBerlin(new Date(n.created_at));
      if (tag !== letzterTag) { kids.push(h("li", { class: "tagtrenner", "aria-hidden": "false" }, h("span", null, tagLabel(tag)))); letzterTag = tag; }
      kids.push(nachricht(n));
    }
    if (!kids.length) kids.push(h("li", { class: "leer-hinweis" }, state.fehler.dash_notizen ? `Notizen konnten nicht geladen werden: ${state.fehler.dash_notizen}` : "Noch keine Notizen. Schreiben Sie die erste."));
    ersetze(liste, kids);

    const pins = state.notizen.filter((n) => n.angeheftet);
    gepinntBox.hidden = !pins.length;
    if (pins.length) {
      const sicht = pinsOffen ? pins : pins.slice(0, 1);
      ersetze(gepinntBox,
        h("div", { class: "angeheftet-kopf" }, icon("pin"), "Angeheftet",
          pins.length > 1 ? h("button", { type: "button", class: "mehr", "aria-expanded": pinsOffen ? "true" : "false", onclick: () => { pinsOffen = !pinsOffen; rendere(); } }, pinsOffen ? "Weniger" : `Alle ${pins.length} anzeigen`) : null),
        h("ul", { class: "angeheftet-liste" }, sicht.map((n) => h("li", { dataset: { autor: n.autor } },
          h("span", { class: "angeheftet-text" }, h("strong", null, n.autor), " ", n.text),
          h("button", { type: "button", class: "icon-btn", "aria-label": "Nicht mehr anheften", onclick: () => notizAnheften(n.id, false) }, icon("close")),
        ))));
    }
    if (unten) runter();
    if (sichtbar && !document.hidden) gesehen.set("notizen");
  }

  rendere();
  return {
    el,
    update(art) { if (art === "notizen" || art === "alles") rendere(); },
    /** nach dem Einhängen aufrufen */
    zeigen() { sichtbar = true; runter(); gesehen.set("notizen"); },
    fokus() { feld.focus(); },
  };
}
