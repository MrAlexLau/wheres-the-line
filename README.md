# Where's the Line

A pass-and-play party game in the spirit of *Cards Against Humanity*. Each
round poses a condition ("win a new car"); everyone but the judge secretly
plays an action card answering "what would you do for this?" The judge picks
the **MOST** they'd do and the **LEAST** they'd do — those two players score.
First to the target score wins.

Full rules and design decisions: [`docs/SPEC.md`](docs/SPEC.md). The
multiplayer client's Svelte rewrite is documented in
[`SVELTE_SPEC.md`](SVELTE_SPEC.md). It offers two ways to play:

- **Multiplayer:** players join the same room from their own devices. Shared
  game state is stored in NocodeBackend through a Netlify Function, so the
  NocodeBackend secret never reaches the browser. Built with Svelte + Vite.
- **Pass-and-play:** the original single-device mode at `/pass-and-play/` —
  plain HTML/CSS/JS with no build step, kept deliberately separate from the
  Svelte build (see `SVELTE_SPEC.md` §2).

## Project structure

```
index.html               Vite entry point (multiplayer)
vite.config.js            build config; copies pass-and-play verbatim into dist/
package.json              npm scripts, including the "build" step
netlify.toml               Netlify build/dev/redirect config
netlify/functions/data.js  secure proxy for NocodeBackend's Data API
pass-and-play/index.html   pass-and-play entry point (no build step)
src/
  App.svelte               top-level screen switch
  main.js                   Svelte app mount
  css/styles.css            all styling (bundled for multiplayer, copied as-is for pass-and-play)
  js/game.js                pass-and-play's pure game logic/state machine (no DOM)
  js/app.js                 pass-and-play DOM rendering + event wiring
  data/cards.js              starter Condition/Action decks, shared by both apps
  lib/
    api.js                   NocodeBackend proxy client
    session.js               browser-local reconnect credentials
    ids.js                   sameId() — loose id comparison (see docs/SPEC.md §8b)
    gameEngine.js             multiplayer round-orchestration rules
    stores.js                 shared reactive state
    client.js                 poll loop + write actions
    dragSort.js               judge's drag-to-sort UI, as a Svelte action
    components/               one component per screen
docs/
  SPEC.md                    full game & project spec
```

## Running locally

`npm run dev` starts Vite, which serves both apps from source — pass-and-play
included, with no build step needed for local development. Multiplayer needs
the Netlify Function, so use `npm run dev:mp` after configuring the
environment variables below.

```bash
npm install
npm run dev
# Multiplayer (proxies the Netlify Function too):
npm run dev:mp
```

`npm run dev` serves the site at `http://localhost:5173` (`npm run devl` is
an alias for the same command). `npm run dev:mp` serves it through
`netlify dev` instead, which also proxies `/api/data/*` to the local
Netlify Function.

### Configure NocodeBackend

The database schema is included in [`schema.json`](schema.json). Import or
apply it to your NocodeBackend instance, then configure these variables in
Netlify (or in a local `.env` file for `netlify dev`):

- `NCB_INSTANCE` — the NocodeBackend instance name (the checked-in schema
  uses `56358_wheres_the_line`)
- `NCB_DATA_API_URL` — normally `https://openapi.nocodebackend.com`
- `NCB_SECRET_KEY` — the instance's server-side Data API key

Use [`.env.example`](.env.example) as the non-secret template. The secret is
only read by `netlify/functions/data.js`; do not add it to frontend code.

## Deploying to Netlify

Netlify runs `npm run build` (`vite build`) and publishes `dist/`, per
`netlify.toml`.

### Option A: Netlify CLI

```bash
npm install -g netlify-cli   # one-time
netlify login                 # one-time, opens a browser to authorize
netlify init                  # links this folder to a new or existing Netlify site
netlify deploy --prod         # builds and ships to production
```

When `netlify init` asks for build settings, accept the defaults from
`netlify.toml`:

- **Build command:** `npm run build`
- **Publish directory:** `dist`

### Option B: Netlify dashboard (Git-based deploys)

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In the [Netlify dashboard](https://app.netlify.com), click **Add new
   site → Import an existing project**, and pick this repo.
3. Netlify will read `netlify.toml` automatically:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Click **Deploy site**. Every push to the connected branch redeploys
   automatically.

### Option C: Drag-and-drop

Run `npm run build` first, then drag the resulting `dist/` folder onto
[app.netlify.com/drop](https://app.netlify.com/drop) for an instant one-off
deploy — useful for a quick share link without setting up Git or the CLI.
(Note this only deploys static files — the Netlify Function proxy needs a
CLI or Git-based deploy to go live.)

## Notes on the `netlify.toml`

- `command = "npm run build"` / `publish = "dist"` — Netlify builds the
  Svelte multiplayer client with Vite; `vite-plugin-static-copy` copies
  pass-and-play's files into `dist/` verbatim as part of that same build
  (see `vite.config.js`), so both apps end up in the one publish directory.
- A catch-all redirect sends any path to `/index.html` with a 200, so
  refreshing or deep-linking never 404s (the app itself is a single page).
- Basic security headers (`X-Frame-Options`, `X-Content-Type-Options`) are
  set for all routes.

## Customizing the card decks

Conditions and actions are just string arrays in
[`src/data/cards.js`](src/data/cards.js). Edit, add, or replace them freely
— the game logic doesn't care about deck size beyond needing enough cards
to avoid immediately exhausting the deck (it reshuffles the discard pile
automatically when a deck runs dry).
