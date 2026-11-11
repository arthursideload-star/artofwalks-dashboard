// Anmeldung und "kein Zugang"-Hinweis.
import { h, config, fehlerText } from "../util.js";
import { icon } from "../icons.js";

function marke() {
  return h("div", { class: "login-marke" }, h("div", { class: "login-kreis", "aria-hidden": "true" }, h("span", null, "Art of Walks")), h("p", null, "Dashboard"));
}

export function loginAnsicht({ onLogin, onGoogle, hinweis = "" }) {
  const email = h("input", { id: "login-email", type: "email", name: "email", required: true, autocomplete: "username", inputmode: "email", maxlength: "254" });
  const pw = h("input", { id: "login-pw", type: "password", name: "password", required: true, autocomplete: "current-password", minlength: "6" });
  const fehler = h("p", { class: "fehler-text", role: "alert", hidden: !hinweis }, hinweis);
  const btn = h("button", { type: "submit", class: "btn btn-terra btn-voll" }, "Anmelden");
  const form = h("form", { class: "login-form", novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    fehler.hidden = true;
    if (!form.reportValidity()) return;
    btn.disabled = true;
    btn.textContent = "Anmelden …";
    try { await onLogin(email.value.trim(), pw.value); }
    catch (err) {
      const m = String(err?.message || "");
      fehler.textContent = /invalid login|invalid credentials/i.test(m) ? "E-Mail oder Passwort stimmt nicht." : /not confirmed/i.test(m) ? "Bitte zuerst die E-Mail-Adresse bestätigen." : fehlerText(err);
      fehler.hidden = false;
      btn.disabled = false;
      btn.textContent = "Anmelden";
      pw.focus();
    }
  } },
    h("div", { class: "feld" }, h("label", { for: "login-email" }, "E-Mail"), email),
    h("div", { class: "feld" }, h("label", { for: "login-pw" }, "Passwort"), pw),
    fehler,
    btn,
    config.googleLogin && onGoogle ? h("button", { type: "button", class: "btn btn-line btn-voll", onclick: () => onGoogle().catch((e) => { fehler.textContent = fehlerText(e); fehler.hidden = false; }) }, "Mit Google anmelden") : null,
    h("p", { class: "login-links" },
      h("a", { class: "text-link", href: config.kontoUrl, target: "_blank", rel: "noopener noreferrer" }, "Konto anlegen"),
      h("span", { "aria-hidden": "true" }, "·"),
      h("a", { class: "text-link", href: config.kontoUrl, target: "_blank", rel: "noopener noreferrer" }, "Passwort vergessen"),
    ),
  );
  return h("div", { class: "seite seite-login" },
    h("main", { id: "main", tabindex: "-1", class: "login-buehne" }, marke(), h("div", { class: "login-karte" }, h("h2", null, "Anmelden"), h("p", { class: "hinweis-klein" }, "Nur für Arthur und Dean."), form)),
  );
}

export function keinZugangAnsicht({ email, onAbmelden }) {
  return h("div", { class: "seite seite-login" },
    h("main", { id: "main", tabindex: "-1", class: "login-buehne" }, marke(),
      h("div", { class: "login-karte" },
        h("div", { class: "kopf-icon kopf-icon-gross" }, icon("lock")),
        h("h2", null, "Dieses Konto hat keinen Zugang"),
        h("p", null, email ? `Das Konto ${email} gehört nicht zum Team. ` : "", "Bitte mit der Adresse anmelden, die im Team eingetragen ist. Neue Mitglieder trägt Arthur oder Dean in den Einstellungen ein."),
        h("button", { type: "button", class: "btn btn-terra btn-voll", onclick: onAbmelden }, icon("logout"), "Abmelden"),
      )),
  );
}

export function fehlerAnsicht(text, onNochmal) {
  return h("div", { class: "seite seite-login" },
    h("main", { id: "main", tabindex: "-1", class: "login-buehne" }, marke(),
      h("div", { class: "login-karte" }, h("h2", null, "Das hat nicht geklappt"), h("p", null, text), onNochmal ? h("button", { type: "button", class: "btn btn-terra btn-voll", onclick: onNochmal }, icon("refresh"), "Erneut versuchen") : null)),
  );
}
