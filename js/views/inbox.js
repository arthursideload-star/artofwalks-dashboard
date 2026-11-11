// Posteingang: Foto-Uploads der Website (upload_anfragen) und Gmail (nur lesen).
import { h, ersetze, zeitRelativ, nurHttp, plural, leer, toast, fehlerText } from "../util.js";
import { icon } from "../icons.js";
import { state, onChange, getBackend, gesehen, uploadsNeu, leadZuUpload, leadVorlage } from "../store.js";
import { gmail, gmailClientId, gmailVerbinden, gmailLaden, mailLink } from "../gmail.js";
import { shell, segmente } from "./shell.js";

const ART = { probevideo: "Probevideo", auftrag: "Auftrag" };

export function mountInbox(ctx) {
  const offen = new Set(); // aufgeklappte Uploads
  const bilder = new Map(); // id → {status, fotos, logo, fehler}
  const upHost = h("div", { class: "inbox-liste" });
  const mailHost = h("div", { class: "inbox-liste" });
  const neuVorher = new Set(); // beim Öffnen als neu markierte Uploads
  const seit = gesehen.get("uploads");
  for (const u of state.uploads) if (!seit || u.created_at > seit) neuVorher.add(u.id);

  const tabs = segmente([{ id: "uploads", label: "Foto-Uploads" }, { id: "gmail", label: "Gmail" }], "uploads", (id) => { grid.dataset.tab = id; }, "Bereich wählen");
  const grid = h("div", { class: "inbox-grid", dataset: { tab: "uploads" } },
    h("section", { class: "karte inbox-spalte", "aria-labelledby": "h-uploads" }, h("div", { class: "karte-kopf" }, h("div", { class: "kopf-icon" }, icon("image")), h("div", null, h("h2", { id: "h-uploads" }, "Foto-Uploads"), h("p", null, "Anfragen über die Website"))), upHost),
    h("section", { class: "karte inbox-spalte", "aria-labelledby": "h-gmail" }, h("div", { class: "karte-kopf" }, h("div", { class: "kopf-icon" }, icon("mail")), h("div", null, h("h2", { id: "h-gmail" }, "Gmail"), h("p", null, "Letzte Mails im Posteingang"))), mailHost),
  );
  const { el } = shell({ id: "inbox", titel: "Posteingang", inhalt: [tabs.el, grid] });

  async function bilderLaden(u) {
    if (bilder.has(u.id)) return;
    bilder.set(u.id, { status: "laden", fotos: [], logo: [] });
    rendereUploads();
    try {
      const r = await getBackend().uploadBilder(u);
      bilder.set(u.id, { status: "ok", ...r });
    } catch (e) {
      bilder.set(u.id, { status: "fehler", fotos: [], logo: [], fehler: fehlerText(e) });
    }
    rendereUploads();
  }

  function zeile(k, v) {
    if (leer(v)) return null;
    return h("div", { class: "kv" }, h("dt", null, k), h("dd", null, v));
  }

  function uploadEl(u) {
    const istOffen = offen.has(u.id);
    const neu = neuVorher.has(u.id);
    const lead = leadZuUpload(u.id);
    const link = nurHttp(u.inserat_link);
    const b = bilder.get(u.id);
    const kopf = h("button", { type: "button", class: "upload-kopf", "aria-expanded": istOffen ? "true" : "false", "aria-controls": `up-${u.id}`, onclick: () => {
      if (offen.has(u.id)) offen.delete(u.id); else { offen.add(u.id); bilderLaden(u); }
      rendereUploads();
    } },
      h("span", { class: "upload-titel" },
        h("strong", null, u.maklerbuero || "Ohne Büro"),
        h("span", { class: "upload-sub" }, [u.ansprechpartner, u.objekt].filter((x) => !leer(x)).join(" · ")),
      ),
      h("span", { class: "upload-meta" },
        neu ? h("span", { class: "chip chip-neu" }, "Neu") : null,
        h("span", { class: `chip ${u.art === "auftrag" ? "chip-terra" : "chip-ruhig"}` }, ART[u.art] || u.art),
        h("span", { class: "upload-zeit" }, zeitRelativ(u.created_at)),
        h("span", { class: "upload-anzahl" }, icon("image"), String(u.anzahl_fotos ?? 0)),
      ),
      icon("chevron"),
    );

    let detail = null;
    if (istOffen) {
      const betreff = `Ihre Anfrage bei Art of Walks${u.objekt ? `: ${u.objekt}` : ""}`;
      const mailto = u.email ? `mailto:${encodeURIComponent(u.email).replace(/%40/g, "@")}?subject=${encodeURIComponent(betreff)}` : null;
      const galerie = !b || b.status === "laden" ? h("p", { class: "hinweis-klein" }, "Bilder werden geladen …")
        : b.status === "fehler" ? h("p", { class: "hinweis-klein fehler-text" }, `Bilder konnten nicht geladen werden: ${b.fehler}`)
        : !b.fotos.length && !b.logo.length ? h("p", { class: "hinweis-klein" }, "Keine Dateien gefunden.")
        : h("div", null,
          b.fotos.length ? h("ul", { class: "galerie", "aria-label": "Fotos" }, b.fotos.map((f, i) => h("li", null, h("a", { href: nurHttp(f.url) || "#", target: "_blank", rel: "noopener noreferrer", "aria-label": `Foto ${i + 1} in voller Größe öffnen` }, h("img", { src: f.url, alt: `Foto ${i + 1}: ${f.name}`, loading: "lazy" }))))) : null,
          b.logo.length ? h("div", { class: "logo-zeile" }, h("span", null, "Logo"), ...b.logo.map((f) => h("a", { href: nurHttp(f.url) || "#", target: "_blank", rel: "noopener noreferrer", class: "logo-bild" }, h("img", { src: f.url, alt: "Logo des Büros", loading: "lazy" })))) : null,
        );
      detail = h("div", { class: "upload-detail", id: `up-${u.id}` },
        h("dl", { class: "kvs" },
          zeile("Ansprechpartner", u.ansprechpartner), zeile("E-Mail", u.email), zeile("Telefon", u.telefon),
          link ? h("div", { class: "kv" }, h("dt", null, "Inserat"), h("dd", null, h("a", { class: "text-link", href: link, target: "_blank", rel: "noopener noreferrer" }, "Inserat öffnen"))) : null,
          zeile("Objekt", u.objekt), zeile("Energieausweis", u.energieausweis), zeile("Hinweise", u.hinweise),
          zeile("Fotos", plural(u.anzahl_fotos ?? 0, "Foto", "Fotos") + (u.mit_logo ? ", mit Logo" : "")),
        ),
        galerie,
        h("div", { class: "upload-aktionen" },
          mailto ? h("a", { class: "btn btn-terra btn-sm", href: mailto }, icon("mail"), "Antworten") : null,
          lead
            ? h("a", { class: "btn btn-line btn-sm", href: "#/leads" }, icon("leads"), "Lead ansehen")
            : h("button", { type: "button", class: "btn btn-line btn-sm", onclick: () => leadAnlegen(u) }, icon("plus"), "Als Lead anlegen"),
        ),
      );
    }
    return h("li", { class: `upload${istOffen ? " offen" : ""}${neu ? " neu" : ""}` }, kopf, detail);
  }

  function leadAnlegen(u) {
    const notiz = [u.objekt ? `Objekt: ${u.objekt}` : "", nurHttp(u.inserat_link) ? `Inserat: ${u.inserat_link}` : "", u.hinweise ? `Hinweise: ${u.hinweise}` : ""].filter(Boolean).join("\n");
    leadVorlage.daten = {
      firma: u.maklerbuero || "", ansprechpartner: u.ansprechpartner || "", email: u.email || "", telefon: u.telefon || "", kanal: "Website",
      stufe: u.art === "auftrag" ? "Angebot" : "Probevideo angefragt", wer: state.ich === "Arthur" || state.ich === "Dean" ? state.ich : "",
      notiz, upload_id: u.id,
    };
    location.hash = "#/leads/neu";
  }

  function rendereUploads() {
    const l = state.uploads;
    const kids = [];
    if (state.fehler.upload_anfragen) kids.push(h("p", { class: "fehler-text" }, `Uploads konnten nicht geladen werden: ${state.fehler.upload_anfragen}`));
    if (!l.length && !state.fehler.upload_anfragen) kids.push(h("div", { class: "leer-karte" }, h("div", { class: "leer-punkte", "aria-hidden": "true" }, h("span"), h("span"), h("span")), h("p", { class: "leer-gross" }, "Noch keine Uploads"), h("p", null, "Sobald jemand auf der Website Fotos hochlädt, erscheint die Anfrage hier.")));
    else kids.push(h("ul", { class: "uploads" }, l.map(uploadEl)));
    ersetze(upHost, kids);
    const n = uploadsNeu();
    tabs.setzeZahl("uploads", n || "");
  }

  function rendereMails() {
    const kids = [];
    const id = gmailClientId();
    const demoOk = getBackend()?.demoGmail;
    if (gmail.status === "ok") {
      kids.push(h("div", { class: "mail-kopf" },
        h("p", { class: "stand" }, gmail.ungelesen ? plural(gmail.ungelesen, "ungelesene Mail", "ungelesene Mails") : "Alles gelesen"),
        h("div", { class: "mail-aktionen" },
          h("button", { type: "button", class: "btn btn-line btn-sm", onclick: () => gmailLaden() }, icon("refresh"), "Aktualisieren"),
          h("a", { class: "btn btn-line btn-sm", href: "https://mail.google.com/", target: "_blank", rel: "noopener noreferrer" }, icon("external"), "Gmail öffnen"),
        ),
      ));
      kids.push(gmail.mails.length
        ? h("ul", { class: "mails" }, gmail.mails.map((m) => h("li", { class: `mail${m.ungelesen ? " ungelesen" : ""}` },
          h("a", { href: mailLink(m), target: "_blank", rel: "noopener noreferrer" },
            h("span", { class: "mail-von" }, m.von), h("span", { class: "mail-zeit" }, zeitRelativ(m.datum)),
            h("span", { class: "mail-betreff" }, m.betreff), h("span", { class: "mail-snippet" }, m.snippet),
          ))))
        : h("p", { class: "leer-hinweis" }, "Der Posteingang ist leer."));
    } else if (id || demoOk) {
      const text = gmail.status === "verbinden" || gmail.status === "laden" ? "Verbindung wird hergestellt …"
        : gmail.status === "abgelaufen" ? "Die Verbindung zu Gmail ist abgelaufen. Bitte neu verbinden."
        : gmail.status === "fehler" ? gmail.meldung || "Verbindung fehlgeschlagen."
        : "Gmail ist eingerichtet. Zum Lesen der letzten Mails verbinden (nur Lesezugriff, nichts wird gespeichert).";
      kids.push(h("div", { class: "gmail-karte" },
        h("p", { class: gmail.status === "fehler" ? "fehler-text" : "" }, text),
        h("div", { class: "mail-aktionen" },
          h("button", { type: "button", class: "btn btn-terra", disabled: gmail.status === "verbinden" || gmail.status === "laden", onclick: () => gmailVerbinden() }, icon("mail"), gmail.status === "abgelaufen" ? "Neu verbinden" : "Gmail verbinden"),
          h("a", { class: "btn btn-line", href: "https://mail.google.com/", target: "_blank", rel: "noopener noreferrer" }, icon("external"), "Gmail öffnen"),
        ),
      ));
    } else {
      kids.push(h("div", { class: "gmail-karte" },
        h("h3", null, "Gmail einmalig einrichten"),
        h("ol", { class: "schritte schritte-klein" },
          h("li", null, "In der Google Cloud Console einen OAuth-Client (Typ Webanwendung) anlegen und die Adresse dieses Dashboards als erlaubten JavaScript-Ursprung eintragen."),
          h("li", null, "Die Client-ID in den ", h("a", { class: "text-link", href: "#/einstellungen" }, "Einstellungen"), " einfügen."),
          h("li", null, "Hier auf „Gmail verbinden“ klicken."),
        ),
        h("div", { class: "mail-aktionen" },
          h("a", { class: "btn btn-terra", href: "#/einstellungen" }, icon("gear"), "Client-ID eintragen"),
          h("a", { class: "btn btn-line", href: "https://mail.google.com/", target: "_blank", rel: "noopener noreferrer" }, icon("external"), "Gmail öffnen"),
        ),
      ));
    }
    ersetze(mailHost, kids);
  }

  rendereUploads();
  rendereMails();
  // Uploads gelten erst beim Verlassen der Ansicht als gesehen, damit "Neu" sichtbar bleibt.
  const ab = onChange((art) => { if (art === "uploads" || art === "leads" || art === "alles") rendereUploads(); if (art === "gmail" || art === "einstellungen" || art === "alles") rendereMails(); });
  return {
    el,
    destroy() { ab(); gesehen.set("uploads"); },
  };
}
