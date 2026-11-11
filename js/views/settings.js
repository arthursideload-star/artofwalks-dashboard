// Einstellungen: Konto, Team, Gmail-Client-ID.
import { h, ersetze, toast, fehlerText, config } from "../util.js";
import { icon } from "../icons.js";
import { state, onChange, einstellungSetzen, teamHinzu, teamEntfernen } from "../store.js";
import { shell } from "./shell.js";

export function mountSettings(ctx) {
  const teamHost = h("div");
  const host = h("div", { class: "einstellungen" });

  /* Konto */
  const konto = h("section", { class: "karte" },
    h("h2", { class: "karte-titel" }, "Konto"),
    h("p", { class: "zeile-text" }, h("strong", null, state.ich), state.email ? ` · ${state.email}` : ""),
    state.modus === "demo" ? h("p", { class: "hinweis-klein" }, "Demo-Modus: Beispieldaten im Speicher, nichts wird gespeichert.") : null,
    h("button", { type: "button", class: "btn btn-line", onclick: () => ctx.abmelden() }, icon("logout"), "Abmelden"),
  );

  /* Team */
  const emailF = h("input", { id: "team-email", type: "email", required: true, maxlength: "254", autocomplete: "off", placeholder: "name@beispiel.de", inputmode: "email" });
  const nameF = h("select", { id: "team-name" }, ["Dean", "Arthur", "Team"].map((n) => h("option", { value: n }, n)));
  const fehler = h("p", { class: "fehler-text", role: "alert", hidden: true });
  const teamForm = h("form", { class: "inline-form", novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    fehler.hidden = true;
    if (!teamForm.reportValidity()) return;
    const btn = teamForm.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      await teamHinzu(emailF.value, nameF.value);
      emailF.value = "";
      toast("Zum Team hinzugefügt.");
    } catch (err) {
      fehler.textContent = /duplicate|already|23505/i.test(err.message || "") ? "Diese Adresse ist schon im Team." : `Nicht gespeichert: ${fehlerText(err)}`;
      fehler.hidden = false;
    }
    btn.disabled = false;
  } },
    h("div", { class: "feld" }, h("label", { for: "team-email" }, "E-Mail"), emailF),
    h("div", { class: "feld feld-schmal" }, h("label", { for: "team-name" }, "Name"), nameF),
    h("button", { type: "submit", class: "btn btn-terra" }, icon("plus"), "Hinzufügen"),
  );
  const team = h("section", { class: "karte" },
    h("h2", { class: "karte-titel" }, "Team"),
    h("p", { class: "hinweis-klein" }, "Nur diese Konten sehen das Dashboard. Neue Mitglieder legen ihr Konto mit derselben E-Mail-Adresse auf der Website an und bestätigen die Adresse."),
    teamHost, teamForm, fehler,
  );

  function rendereTeam() {
    ersetze(teamHost, h("ul", { class: "team-liste" }, state.team.map((t) => {
      const ich = t.email === (state.email || "").toLowerCase();
      return h("li", null,
        h("div", { class: `avatar avatar-${t.name.toLowerCase()} avatar-klein`, "aria-hidden": "true" }, t.name[0]),
        h("div", { class: "team-info" }, h("strong", null, t.name), h("span", null, t.email)),
        ich ? h("span", { class: "chip chip-du" }, "Sie") : h("button", { type: "button", class: "btn btn-quiet btn-sm btn-gefahr", onclick: async (e) => {
          const b = e.currentTarget;
          if (!b.dataset.s) { b.dataset.s = "1"; b.textContent = "Wirklich entfernen?"; b.classList.add("bestaetigen"); setTimeout(() => { if (b.isConnected) { b.dataset.s = ""; b.textContent = "Entfernen"; b.classList.remove("bestaetigen"); } }, 3500); return; }
          try { await teamEntfernen(t.email); toast("Entfernt."); } catch (err) { toast(`Nicht entfernt: ${fehlerText(err)}`, "fehler"); }
        } }, "Entfernen"),
      );
    })));
    if (state.fehler.dash_team) teamHost.prepend(h("p", { class: "fehler-text" }, `Team konnte nicht geladen werden: ${state.fehler.dash_team}`));
  }

  /* Gmail */
  const idF = h("input", { id: "gmail-id", type: "text", maxlength: "500", autocomplete: "off", spellcheck: "false", value: state.einstellungen.google_client_id || "", placeholder: "123456789-abc….apps.googleusercontent.com" });
  const gmailFehler = h("p", { class: "fehler-text", role: "alert", hidden: true });
  const gmail = h("section", { class: "karte" },
    h("h2", { class: "karte-titel" }, "Gmail"),
    h("p", { class: "hinweis-klein" }, "Google-OAuth-Client-ID (Typ Webanwendung). Sie ist kein Geheimnis. Als erlaubter JavaScript-Ursprung gehört die Adresse dieses Dashboards in den Client. Es wird nur lesend auf den Posteingang zugegriffen."),
    h("form", { class: "inline-form", novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      gmailFehler.hidden = true;
      const v = idF.value.trim();
      if (v && !/^[\w.-]+\.apps\.googleusercontent\.com$/i.test(v) && state.modus !== "demo") { gmailFehler.textContent = "Das sieht nicht nach einer Client-ID aus (endet auf .apps.googleusercontent.com)."; gmailFehler.hidden = false; return; }
      try { await einstellungSetzen("google_client_id", v); toast(v ? "Client-ID gespeichert." : "Client-ID entfernt."); }
      catch (err) { gmailFehler.textContent = `Nicht gespeichert: ${fehlerText(err)}`; gmailFehler.hidden = false; }
    } },
      h("div", { class: "feld feld-breit" }, h("label", { for: "gmail-id" }, "Client-ID"), idF),
      h("button", { type: "submit", class: "btn btn-terra" }, "Speichern"),
    ),
    gmailFehler,
  );

  /* Über */
  const ueber = h("section", { class: "karte" },
    h("h2", { class: "karte-titel" }, "Plan"),
    h("p", { class: "zeile-text" }, `Start ${config.planStart.split("-").reverse().join(".")}, ${config.planTage} Tage, Zeitzone ${config.zeitzone}.`),
  );

  host.append(konto, team, gmail, ueber);
  rendereTeam();
  const { el } = shell({ id: "einstellungen", titel: "Einstellungen", inhalt: host });
  const ab = onChange((art) => { if (art === "team" || art === "alles") rendereTeam(); });
  return { el, destroy() { ab(); } };
}
