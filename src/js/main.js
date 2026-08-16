import { mountRoomApp } from "./multiplayer/room-app.js";
import { loadSession } from "./multiplayer/session.js";

const root = document.getElementById("app");

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child) node.appendChild(child);
  return node;
}

function renderHome() {
  root.innerHTML = "";
  const screen = el("div", { class: "screen" });
  screen.appendChild(
    el("div", { class: "brand" }, [
      el("h1", {}, [document.createTextNode("Where's "), el("span", { class: "accent", text: "the Line" })]),
      el("p", { text: "A party game about knowing your friends — now playable across devices." }),
    ])
  );
  screen.appendChild(el("h2", { text: "Start a multiplayer game" }));
  screen.appendChild(
    el("div", { class: "btn-row" }, [
      el("button", { class: "btn-primary", text: "Host a room", onclick: () => mountRoomApp(root, "host-setup", renderHome) }),
      el("button", { class: "btn-secondary", text: "Join a room", onclick: () => mountRoomApp(root, "join", renderHome) }),
    ])
  );
  const passLink = el("p", { class: "subtitle pass-and-play-link" });
  passLink.appendChild(document.createTextNode("Only one device? "));
  passLink.appendChild(el("a", { href: "/pass-and-play/", text: "Play pass-and-play instead" }));
  passLink.appendChild(document.createTextNode("."));
  screen.appendChild(passLink);
  root.appendChild(screen);
}

// If we have a saved session (mid-game reconnect), skip straight into the room app.
if (loadSession()) {
  mountRoomApp(root, "lobby", renderHome);
} else {
  renderHome();
}
