# Where's the Line — Pass & Play

A pass-and-play party game in the spirit of *Cards Against Humanity*. Each
round poses a condition ("win a new car"); everyone but the judge secretly
plays an action card — their dare for it. The judge sorts every dare into
**Would do** / **Wouldn't do**, then ranks the "Would do" pile from easiest
to hardest. The hardest one — the **best dare** — is the only card that
scores. First to the target score wins.

This branch is a trimmed, standalone build of just the pass-and-play mode —
no multiplayer, no backend, no build step — meant for uploading to
[itch.io](https://itch.io) as an HTML5 project. (The full project, including
the cross-device multiplayer mode, lives on `main`.)

## Running locally

It's a plain static site — open `index.html` directly in a browser, or serve
it so relative paths behave exactly like they will on itch.io:

```bash
npm run dev
```

This starts a static server (via `http-server`) at `http://localhost:8080`.
Any other static server works too:

```bash
python3 -m http.server 8000
# or
npx serve .
```

## Project structure

```
index.html          entry point
src/
  css/styles.css     all styling
  js/game.js          pure game logic/state machine (no DOM)
  js/app.js           DOM rendering + event wiring, including the
                       animated "How to play" intro
  data/cards.js        starter Condition/Action decks
```

## Publishing to itch.io

1. Zip the contents of this branch (or just `index.html` + `src/`) — no
   `node_modules`, no build output needed.
2. On itch.io, create a new project, set **Kind of project** to **HTML**,
   and upload the zip.
3. Check **"This file will be played in the browser"** on the uploaded zip,
   and set `index.html` as the embed's entry point if asked.
4. Set a reasonable embed size (the layout is responsive but designed
   mobile-first/portrait — a viewport around 480×800 or "fullscreen"
   works well).

## Customizing the card decks

Conditions and actions are just string arrays in
[`src/data/cards.js`](src/data/cards.js). Edit, add, or replace them freely
— the game logic doesn't care about deck size beyond needing enough cards
to avoid immediately exhausting the deck (it reshuffles the discard pile
automatically when a deck runs dry).
