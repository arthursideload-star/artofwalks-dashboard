// Notizen als eigene Ansicht (derselbe Chat wie in der Mitte des Plans, nur größer).
import { h } from "../util.js";
import { icon } from "../icons.js";
import { onChange } from "../store.js";
import { shell } from "./shell.js";
import { createChat } from "./chat.js";

export function mountNotizen() {
  const chat = createChat();
  const { el } = shell({
    id: "notizen",
    titel: "Notizen",
    inhalt: h("section", { class: "karte notizen-karte", "aria-label": "Notizen" },
      h("div", { class: "karte-kopf" }, h("div", { class: "kopf-icon" }, icon("notizen")), h("div", null, h("h2", null, "Gemeinsame Notizen"), h("p", null, "Für Arthur und Dean. Wichtiges lässt sich oben anheften."))),
      chat.el,
    ),
  });
  const ab = onChange((art) => chat.update(art));
  return { el, afterMount() { chat.zeigen(); chat.fokus(); }, destroy() { ab(); } };
}
