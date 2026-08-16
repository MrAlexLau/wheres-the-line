# Svelte Rewrite Plan — Multiplayer Client

Status: **planning only** — nothing in this doc is implemented yet. Repo
state before this work begins is tagged `pre-svelte`.

## 1. Why

The multiplayer client (`src/js/multiplayer/room-app.js`) hand-rolls its own
re-render gate: every 2-second poll builds a JSON snapshot of the parts of
state that matter, compares it to the previous snapshot, and only if
something differs does it `root.innerHTML = ""` and rebuild the *entire*
current screen from scratch. That's cost us real debugging time this
session — id-serialization mismatches, unset-vs-null field quirks, and a
self-heal write we added ourselves all manifested as "the screen flashes,"
because *any* field we didn't think to normalize looks like a full-screen
change to that diff.

Svelte's compiled reactivity makes this whole bug class structurally
impossible: components subscribe to the specific store values they render,
and only the DOM nodes tied to a value that actually changed get touched.
Polling can fire every 2 seconds forever and, if nothing meaningful changed,
literally nothing will happen — no diffing code required to make that true.

This is **not** a fix for the backend data-consistency issues we found
(id-type instability, no read-after-write guarantee, bulk-create partial
failure). Those are real and stay real under any framework. This rewrite
targets the rendering architecture, not the API layer.

## 2. Scope

**In scope:** the multiplayer client only —
`src/js/multiplayer/room-app.js`, `host-engine.js`, `api.js`, `session.js`,
and `src/js/main.js`'s home screen.

**Out of scope, unchanged:**
- Pass-and-play (`src/js/app.js`, `src/js/game.js`) — a separate, already-
  stable single-device app with none of the polling/flicker problems this
  rewrite exists to solve. Stays plain JS, stays build-free, stays served
  from `/pass-and-play/`.
- `src/data/cards.js` — shared card data, framework-agnostic, imported
  as-is by both apps.
- `netlify/functions/data.js` — the NocodeBackend proxy. No change.
- `schema.json` / `swagger.json` — reference docs for the deployed backend.
  No change.
- Game/scoring rules themselves — `host-engine.js`'s functions
  (`startGame`, `submitCard`, `applyBuckets`, `confirmJudging`, `nextRound`,
  the self-heal helpers, `sameId`) are framework-agnostic already; they get
  ported close to verbatim, wrapped to write into stores instead of a
  manual `state` object.

## 3. Tooling

Plain **Svelte + Vite**, not SvelteKit. This app has no routing needs
beyond "which screen am I on" (already just a piece of state) and no SSR
requirement — it's a client that talks to one Netlify Function proxy.
SvelteKit would add a server runtime and a routing/conventions layer this
project doesn't need.

New dependencies: `svelte`, `@sveltejs/vite-plugin-svelte`, `vite` (all
devDependencies — Svelte compiles away, nothing ships to the browser but
the compiled output).

This is the one real, honest tradeoff: **the project stops being a
zero-build static-file publish** (documented as a deliberate property in
`docs/SPEC.md` §10 today). `npm run build` becomes a required step before
deploy. Netlify already runs a build command for us, so this doesn't change
the deploy *workflow* (`git push` → Netlify builds → live), just what
happens during that build.

## 4. Project layout

```
/
  index.html                    # Vite entry — replaces the current static one
  vite.config.js
  package.json                  # adds "build"/"preview" scripts, svelte deps
  netlify.toml                  # build.command = "npm run build", publish = "dist"

  public/
    pass-and-play/              # copied as-is into dist/pass-and-play/ by Vite
      index.html
    favicon, etc.

  src/
    main.js                     # Svelte app mount (replaces current main.js)
    App.svelte                  # top-level screen switch (home vs. room app)

    lib/
      api.js                    # unchanged, moved under lib/
      session.js                # unchanged, moved under lib/
      ids.js                    # sameId() — extracted, shared by engine + UI
      gameEngine.js              # host-engine.js, ported close to verbatim
      stores.js                 # writable stores replacing the `state` object
      poll.js                   # the 2s interval, now just "assign into stores"

      components/
        HostSetup.svelte
        Join.svelte
        Lobby.svelte
        Round.svelte             # phase switch: Submitting / Judging / Reveal / GameOver
        Submitting.svelte
        Judging.svelte
        Reveal.svelte
        GameOver.svelte
        shared/
          ScoreBoard.svelte
          ScoreStrip.svelte
          CriteriaCallout.svelte
          ConditionCard.svelte
          GameMenu.svelte

    data/
      cards.js                  # unchanged, existing path preserved

    css/
      styles.css                # imported globally to start (see §7)

  docs/
    SPEC.md                     # updated once the rewrite ships (§8 rewritten,
                                 # §10 tech stack updated)
```

`src/js/game.js` and `src/js/app.js` (pass-and-play) stay exactly where
they are, untouched, outside this restructure.

## 5. State: stores replace the diff-gate entirely

Today, `room-app.js` owns one big mutable `state` object plus
`snapshotParts()`/`stateSnapshot()` to decide whether to re-render. All of
that goes away. In its place, a small set of writable stores in
`lib/stores.js`:

```js
export const session = writable(null);       // {roomId, playerId, sessionToken}
export const room = writable(null);
export const players = writable([]);
export const round = writable(null);
export const submissions = writable([]);
export const judgingSlots = writable([]);
export const myHand = writable([]);
export const uiError = writable("");
export const uiBusy = writable(false);
```

`lib/poll.js` runs the same `setInterval(..., 2000)` and the same
`refresh()` logic that's in `room-app.js` today (read room/players/round/
submissions/judgingSlots/deck_cards, same self-heal calls), but instead of
building a snapshot and deciding whether to call `render()`, it just does
`room.set(freshRoom)`, `players.set(freshPlayers)`, etc. — unconditionally,
every poll. Svelte's own reactivity handles the "did anything actually
change" question per-value, for free, at the DOM level. No manual diffing
code ships in this rewrite at all.

`sameId()` stays. It's a data-layer fact (id serialization isn't stable
across NocodeBackend's create-vs-read responses), not a rendering concern —
Svelte doesn't change what the backend sends. Every place that currently
does `.find(p => p.id === x)` becomes `.find(p => sameId(p.id, x))`, same as
today, just inside Svelte's reactive `$:` blocks / derived stores instead of
inside a manually-called render function.

Optimistic updates (the submit-card fix from this session) become simpler,
not harder: an action handler just writes the known-true value straight
into the store (`submissions.update(...)`) before or instead of waiting on
the next poll. No `optimisticPatch` plumbing needed — that plumbing existed
specifically to survive a full state object getting overwritten by
`refresh()`; stores don't have that problem because each field updates
independently.

## 6. Components

One component per screen, matching the existing `render*()` functions
close to 1:1 so the port is mostly mechanical:

| Current function | Becomes |
|---|---|
| `renderHostSetup` | `HostSetup.svelte` |
| `renderJoin` | `Join.svelte` |
| `renderLobby` | `Lobby.svelte` |
| `renderSubmitting` | `Submitting.svelte` |
| `renderJudging` | `Judging.svelte` |
| `renderReveal` | `Reveal.svelte` |
| `renderGameOver` | `GameOver.svelte` |
| `scoreboard()` / `scoreStrip()` | `ScoreBoard.svelte` / `ScoreStrip.svelte` |
| `renderCriteriaCallout` (+ `goalHeadline`) | `CriteriaCallout.svelte` |
| `gameMenu()` | `GameMenu.svelte` |

`Round.svelte` replaces the `renderRound()` phase switch — a plain
`{#if $round.phase === "SUBMITTING"}...{/if}` chain. (No `ROUND_INTRO` case
— that screen is already gone per this session's QoL change, and stays
gone.)

## 7. Judging drag-and-drop

The custom Pointer-Events drag-sort in `initBucketDragSort` is the one piece
of real, nontrivial, *proven-working* logic in the UI layer. Plan is to
port it as a **Svelte action** (`use:dragSort`) rather than rewrite it
against a DnD library:

```svelte
<div class="bucket-cards" use:dragSort={{ bucket: "WOULD", onDrop: handleDrop }}>
```

The action gets the same pointerdown/pointermove/pointerup logic, minus the
raw-DOM bucket lookups (`containers[0].closest(...)`) — those become
Svelte-idiomatic (the action receives its own node, dispatches a custom
event or calls a passed-in callback on drop). This keeps the drag mechanics
— which took real iteration to get right (Pointer Events specifically
because native HTML5 DnD is unreliable on mobile touch, per the existing
code comment) — completely unchanged in behavior, just relocated.

## 8. CSS

Start by keeping `src/css/styles.css` as a single global stylesheet
imported once in `main.js`, unchanged. Splitting styles into
component-scoped `<style>` blocks is a nice-to-have, not a goal of this
rewrite — mixing "port the app" and "restyle the app" in one pass makes
regressions hard to attribute. Revisit scoping later if it's ever actually
useful (e.g. wanting per-component style isolation), as a separate,
independent pass.

## 9. Netlify / build config changes

`netlify.toml`:
```diff
 [build]
-  publish = "."
+  command = "npm run build"
+  publish = "dist"
   functions = "netlify/functions"
```

`package.json`:
```diff
 "scripts": {
-  "dev": "http-server . -p 8080 -c-1 -o",
-  "devl": "npm run dev",
+  "dev": "vite",
+  "devl": "npm run dev",
+  "build": "vite build",
+  "preview": "vite preview",
   "dev:mp": "netlify dev"
 }
```

`netlify dev` (used for testing the Netlify Function proxy locally) picks
up Vite automatically once it detects the framework via
`@netlify/vite-plugin` or the build command — needs a local spike to
confirm `dev:mp` still proxies `/api/data/*` correctly through Vite's dev
server rather than only working against the built output.

`public/pass-and-play/` — Vite copies anything under `public/` to the
build output root untouched, which is how `/pass-and-play/` keeps working
exactly as it does today without becoming part of the Svelte build.

## 10. Migration phases

1. **Scaffold.** `npm create vite@latest` (svelte template) into the repo,
   get a trivial page building and deploying to a Netlify preview branch.
   No app logic yet — just confirm the build/publish pipeline works,
   including the Function proxy and `/pass-and-play/` passthrough.
2. **Port the data layer.** `api.js`, `session.js`, `ids.js`
   (extract `sameId` out of `room-app.js`/`host-engine.js` into one
   shared module), `gameEngine.js` (host-engine.js port). No UI yet —
   verify against the real backend via a scratch script or the browser
   console, same way the current logic was originally validated.
3. **Stores + poll loop.** Wire `stores.js` and `poll.js`. At this point
   there's real reactive state flowing from the backend with no UI
   consuming it yet.
4. **Screens, in order of complexity:** HostSetup → Join → Lobby →
   Submitting → Reveal → GameOver → Judging (drag-and-drop last, since
   it's the highest-risk port).
5. **Parity pass.** Walk every fix from this session's conversation against
   the new code and confirm each is actually preserved: sameId() used
   everywhere ids cross a read/write boundary, self-heal guards
   (once-per-round), the zero-score fix, optimistic submit-state.
6. **Cutover.** Point `netlify.toml` at the Vite build, remove
   `src/js/multiplayer/room-app.js` / `host-engine.js` / the old
   `src/js/main.js` (or archive them until confidence is high), update
   `docs/SPEC.md` §8 and §10.
7. **Playtest.** Same manual checklist as always: host + 2 joiners across
   real devices, full round (submit → judge → reveal → next round →
   game over), a deliberate mid-round leave/reconnect, and — the actual
   point of this rewrite — leave a device idle mid-round for a few poll
   cycles and confirm nothing visibly flashes.

## 11. What this rewrite explicitly does not promise to fix

Carried over as-is, because they're backend/data facts, not rendering
facts (see `docs/SPEC.md` §8b, "Known Backend Quirks"):
- Id values not serializing consistently between create/read responses —
  still needs `sameId()` everywhere a cross-table or cross-call id
  comparison happens.
- No read-after-write guarantee — still needs the "trust what we just
  wrote" pattern (submitCard's own-write patch, optimistic store writes).
- `bulk/create` returning HTTP 207 on partial failure — still needs the
  self-heal checks (missing submission row, empty hand), still gated to
  run once per round rather than every poll.

If flashing continues after this rewrite ships, that's the signal those
data-layer issues were the real cause all along, not the render architecture
— worth remembering before assuming the rewrite failed.
