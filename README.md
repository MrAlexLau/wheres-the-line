# Where's the Line

A pass-and-play party game in the spirit of *Cards Against Humanity*. Each
round poses a condition ("win a new car"); everyone but the judge secretly
plays an action card answering "what would you do for this?" The judge picks
the **MOST** they'd do and the **LEAST** they'd do — those two players score.
First to the target score wins.

Full rules and design decisions: [`docs/SPEC.md`](docs/SPEC.md).

This is a plain HTML/CSS/JS app with ES modules and no build step. It offers
two ways to play:

- **Multiplayer:** players join the same room from their own devices. Shared
  game state is stored in NocodeBackend through a Netlify Function, so the
  NocodeBackend secret never reaches the browser.
- **Pass-and-play:** the original single-device mode at `/pass-and-play/`.

## Project structure

```
index.html              entry point
package.json             npm scripts (dev server only — no build step)
netlify.toml             Netlify build/redirect config
netlify/functions/data.js secure proxy for NocodeBackend's Data API
src/
  css/styles.css         all styling
  js/game.js              pure game logic/state machine (no DOM)
  js/app.js               pass-and-play DOM rendering + event wiring
  js/main.js              multiplayer entry point
  js/multiplayer/         room UI, NocodeBackend client, and game engine
  data/cards.js            starter Condition/Action decks
docs/
  SPEC.md                 full game & project spec
```

## Running locally

For pass-and-play, `npm run dev` starts a static server. Multiplayer needs
the Netlify Function, so use `npm run dev:mp` after configuring the
environment variables below.

```bash
npm install
npm run dev
# Multiplayer:
npm run dev:mp
```

This serves the site at `http://localhost:8080` and opens it in your
browser (`npm run devl` is an alias for the same command).

Any other static server works too, if you'd rather not use npm at all:

```bash
python3 -m http.server 8000
# or
npx serve .
```

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

This repo is ready to deploy as-is — there's no build command, it just
publishes the repository root and deploys the proxy function.

### Option A: Netlify CLI

```bash
npm install -g netlify-cli   # one-time
netlify login                 # one-time, opens a browser to authorize
netlify init                  # links this folder to a new or existing Netlify site
netlify deploy --prod         # ships the current directory to production
```

When `netlify init` asks for build settings, accept the defaults from
`netlify.toml`:

- **Build command:** *(leave blank — there is none)*
- **Publish directory:** `.`

### Option B: Netlify dashboard (Git-based deploys)

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In the [Netlify dashboard](https://app.netlify.com), click **Add new
   site → Import an existing project**, and pick this repo.
3. Netlify will read `netlify.toml` automatically:
   - Build command: *(none)*
   - Publish directory: `.`
4. Click **Deploy site**. Every push to the connected branch redeploys
   automatically.

### Option C: Drag-and-drop

Netlify also supports dragging the project folder straight onto
[app.netlify.com/drop](https://app.netlify.com/drop) for an instant one-off
deploy — useful for a quick share link without setting up Git or the CLI.

## Notes on the `netlify.toml`

- `publish = "."` — the whole repo is the deployable site since there's no
  build output directory.
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
