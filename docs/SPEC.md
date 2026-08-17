# Where's the Line — Project Spec

## 1. Concept

"Where's the Line" is a party game in the spirit of *Cards Against Humanity*.
It can be played pass-and-play on one device or multiplayer from separate
devices in a shared room.

Each round poses a **Condition** — a hypothetical scenario/reward ("win a
new car", "get out of a speeding ticket", "become mayor of your town").
Every non-judging player secretly submits an **Action** card from their
hand — their **dare** — answering the implicit question: *"What's the most
intense thing you think the judge would do for this?"*

The judge reads all of the submitted dares (anonymously, shuffled) in two
steps:

1. **Split.** Sort every dare into **Would do** or **Wouldn't do**. At least
   one dare has to land in "Would do" to continue — otherwise there's
   nothing to judge.
2. **Rank.** Order the "Would do" pile from easiest to hardest. **The
   hardest one — the best dare** — is the only card that scores. Everyone
   else, including every card in "Wouldn't do," scores nothing that round.

Only one player scores per round. Play continues, rotating the judge, until
a player reaches the target score (default: 7 points), at which point the
game ends and a winner is declared.

Because scoring always comes down to the single most extreme thing the
*specific judge* would actually do, the game rewards players who read that
judge well, not just whoever can write the funniest card.

## 2. Terminology

| Term | Meaning |
|---|---|
| Condition card | The round's prompt/scenario/reward, read aloud by the judge. |
| Action card / dare | A card describing a hypothetical action, played face-down as an answer. |
| Judge | The player who reads submissions and judges the round. Rotates every round. |
| Best dare | The single dare that scores: the hardest thing in the judge's "Would do" pile — the most extreme thing they'd still do. |
| Hand | The set of Action cards a player currently holds (default size: 5). |
| Round | One full cycle: condition drawn → submissions → judging (split, then rank) → scoring → hand refill. |

## 3. Players & Setup

- **Minimum players:** 3 (1 judge + 2 submitters, so both scoring slots can
  be filled by different people). The app enforces this minimum.
- **Maximum players:** 8 (soft cap, tunable), to keep a single hand-sized
  device and a single deck of default content usable.
- Setup screen collects:
  - Player names (add/remove, reorder).
  - Target score to win (default 7, editable 3–15).
  - Hand size (default 5, editable 5–10).
- Judge order is the order players were added; judge rotates left each
  round.

## 4. Round Flow (Pass & Play)

1. **Judge reveal.** Screen announces the round's judge and shows a "pass
   the device to <Judge>" interstitial, then displays the drawn Condition
   card. The judge taps "Start round" once everyone is ready.
2. **Blind submission, one player at a time.** For each non-judge player in
   turn:
   - Interstitial: "Pass the device to <Player>."
   - That player sees a large, high-contrast **criteria callout** — "Goal:
     play the <u>most intense</u> card that <Judge> would do for:" — directly
     above the Condition card, before they view their hand and tap one
     Action card to submit face-down. The card leaves their hand.
   - Screen advances to the next submitting player. The judge does not
     submit a card.
3. **Judging, step 1 — split.** Device passes back to the judge. All
   submitted actions are shown shuffled and anonymized (no player names
   attached), starting in a dashed, neutral **"🤔 Not sorted yet"** pile
   between two labeled drag-and-drop buckets: **"✅ Would do"** above it and
   **"🚫 Wouldn't do"** below it. The judge drags each card into whichever
   bucket it belongs in. This step can't be confirmed until the neutral pile
   is empty **and** at least one card is in "Would do" — with zero, there's
   nothing to rank or score.
4. **Judging, step 2 — rank.** Only the "Would do" pile carries forward. The
   judge drags to order it from **easiest (top) to hardest (bottom)**. The
   bottom card — the **best dare** — is shown live with a 🏆 badge as the
   judge drags. If exactly one card made it into "Would do" in step 1, this
   step is skipped entirely (nothing to rank) and it wins by default.
5. **Reveal & scoring.** The app reveals which player played each submitted
   card, tags the winning dare with "🏆 Best dare (+1)", and awards it one
   point. Every other card — including the whole "Wouldn't do" pile —
   scores nothing.
6. **Hand refill.** Every player who submitted a card draws back up to their
   hand size from the Action deck. If the deck runs out, the discard pile
   (previously submitted/seen cards) is reshuffled into a new deck.
7. **Next judge.** Judge role passes to the next player in order; a new
   Condition card is drawn; return to step 1.
8. **Win check.** After scoring, if any player's total ≥ target score, the
   game ends immediately and the Game Over screen is shown instead of
   advancing to the next round.

## 5. Scoring & End of Game

- +1 point for the best dare (the hardest card in "Would do") per round.
  Nothing else scores — landing in "Wouldn't do," or anywhere in "Would do"
  except the very hardest, is worth zero, with no penalty either.
- First player to reach the target score wins. Since only one card can
  score per round, a tie can only happen if the game somehow ends with two
  players sharing the same top score with no further rounds played — both
  are shown as winners.
- Game Over screen shows final standings (sorted by score) and offers
  "Play again" (same players/settings, fresh shuffled decks) and "New game"
  (return to setup).

## 6. Content Model

Two card decks, defined as simple data (see `src/data/cards.js`):

```js
export const CONDITIONS = ["win a new car", "become mayor of your town", ...];
export const ACTIONS = ["drink a gallon of milk in an hour", "go 24 hours without sleep", ...];
```

- Conditions and Actions are plain strings — no card metadata/rarity/packs
  in v1.
- Shipped with a starter deck (~80 conditions, ~150 actions) large enough
  for multiple full games without repeats before reshuffling.
- Decks are shuffled at game start (Fisher–Yates). Conditions are drawn
  without replacement per game, reshuffling the discard when exhausted, same
  as Actions.
- Content is data-only and swappable — replacing `cards.js` (or loading a
  custom deck) reskins the whole game without touching game logic. This is
  intentionally the seam for a future "custom deck" / NSFW-toggle feature.

## 7. Non-Goals

- No accounts. A browser-local reconnect credential identifies a player in a
  room, and shared state persists in NocodeBackend for the life of that room.
- No card authoring UI.
- No sound/animation polish beyond basic transitions.
- No spectator mode.

## 8. Multiplayer

Multiplayer uses room codes, browser-local reconnect credentials, and a
NocodeBackend Data API instance. The browser polls every two seconds for
room changes, but only redraws when stable, user-visible state changes. A
Netlify Function injects the NocodeBackend API key, keeping it off clients.
The host starts games and advances rounds; judges control their judging
phases; each submitter plays their own card. The deployed NocodeBackend
schema uses uppercase enum values (`LOBBY`, `IN_PROGRESS`, `ROUND_INTRO`,
and so on), which the client preserves for reads and writes.

Players can leave an active game from the in-game **Menu**. Leaving clears
only that device's browser session and stops its polling; it does not delete
the shared room or remove other players.

All NocodeBackend datetime writes use `YYYY-MM-DD HH:mm:ss`, matching the
database's MySQL datetime columns rather than JavaScript's ISO-8601 format.

**Judging is two steps.** Scoring is a single fixed rule: the winner is the
least likely thing the judge would still do. The judge reaches that in two
steps, both while `round.phase` stays `"JUDGING"`:

1. **Split.** Sort every submission into "Would do" / "Wouldn't do." At
   least one card must land in "Would do" to continue.
2. **Rank.** Order only the "Would do" cards from easiest (top) to hardest
   (bottom). The bottom card wins — shown live with a 🏆 badge as the judge
   drags.

There's no separate phase enum value for step 2 — `rounds.phase` is a real
MySQL enum with a fixed value set (confirmed empirically: writing anything
else throws "Data truncated for column 'phase'"), so introducing an
`"ORDERING"` phase isn't possible without a schema change. Instead
`rounds.confirmed_at` — otherwise only ever set once, at the final
confirm — is repurposed as the step-1-done marker: `!round.confirmed_at`
means step 1 (split), `round.confirmed_at` truthy means step 2 (rank). See
`Round.svelte` and `gameEngine.js`'s `confirmSplit`/`confirmJudging`.

### 8a. Database Schema

Six tables, all with an auto-incrementing integer `id` primary key. Generated
from the deployed NocodeBackend schema (instance `56358_wheres_the_line`);
see `schema.json` at the repo root for the machine-readable source.

**rooms**

| Column | Type | Notes |
|---|---|---|
| `room_code` | string | not null |
| `status` | enum | default `LOBBY` |
| `host_player_id` | integer | nullable |
| `target_score` | integer | default 7 |
| `hand_size` | integer | default 5 |
| `current_round_number` | integer | default 0 |
| `current_phase` | string | nullable |

**players**

| Column | Type | Notes |
|---|---|---|
| `room_id` | integer | FK → rooms.id, cascade delete |
| `display_name` | string | not null |
| `join_order` | integer | not null |
| `session_token` | string | not null |
| `connection_status` | enum | default `CONNECTED` |
| `last_seen_at` | datetime | nullable |
| `is_host` | integer | 0/1, default 0 |
| `score` | integer | default 0 |

**rounds**

| Column | Type | Notes |
|---|---|---|
| `room_id` | integer | FK → rooms.id, cascade delete |
| `round_number` | integer | not null |
| `phase` | enum | default `ROUND_INTRO` |
| `judge_player_id` | integer | FK → players.id, sets null on player delete |
| `condition_card_text` | string | nullable |
| `round_goal` | enum | nullable — `MOST` / `LEAST` / `BETWEEN` |
| `confirmed_at` | datetime | nullable |

**submissions**

| Column | Type | Notes |
|---|---|---|
| `round_id` | integer | FK → rounds.id, cascade delete |
| `player_id` | integer | FK → players.id, cascade delete |
| `submitted_at` | datetime | nullable — unset until the player plays a card |
| `round_score_delta` | integer | nullable — set during `confirmJudging` |
| `card_text` | string | nullable — unset until submitted |

One row is pre-created per non-judge player when a round starts (see §8b).

**deck_cards**

| Column | Type | Notes |
|---|---|---|
| `room_id` | integer | FK → rooms.id, cascade delete |
| `deck_type` | enum | `CONDITION` / `ACTION` |
| `card_text` | string | not null |
| `status` | enum | default `IN_DRAW_PILE`; also `IN_HAND` / `DISCARDED` |
| `holder_player_id` | integer | FK → players.id, sets null on player delete |
| `draw_order` | integer | nullable — shuffle position within the draw pile |

**judging_slots**

| Column | Type | Notes |
|---|---|---|
| `round_id` | integer | FK → rounds.id, cascade delete |
| `submission_id` | integer | FK → submissions.id, cascade delete |
| `bucket` | enum | default `NEUTRAL`; also `WOULD` / `WOULDNT` |
| `position` | integer | nullable — order within a bucket; unset while `NEUTRAL` |

There's also an internal `ncba_rls_config` table (row-level-security policy
config) that's part of the NocodeBackend instance itself, not app data; the
Netlify Function proxy's table allowlist excludes it.

### 8b. Known Backend Quirks

These are real inconsistencies observed from the deployed instance, not
assumptions — code that reads/writes these tables should account for them:

- **Enum casing**: the schema declares enums uppercase (`LOBBY`,
  `IN_PROGRESS`, `NEUTRAL`, ...) except `players.connection_status`, whose
  swagger doc lists lowercase values (`connected` / `disconnected`) — the
  one enum column the client doesn't currently read or write.
- **Id type stability**: `POST /create` responses type `id` as an integer,
  but list/read responses aren't guaranteed to serialize every integer
  column the same way on every call. Client code should compare ids loosely
  (string-coerced) rather than with `===` — see `sameId()` in `src/lib/ids.js`.
- **Read-after-write**: a row you just wrote isn't guaranteed to reflect in
  the very next read of that table — and this isn't limited to reading back
  your own write. Confirmed empirically: dealing cards to multiple players
  in a sequential per-player loop (read the draw pile → assign N cards →
  move to the next player) let a later player's "what's still in the draw
  pile" read miss an *earlier* player's just-completed assignment, causing
  the later player to re-draw and steal the earlier player's exact cards —
  the actual root cause of a "one player ends up with zero cards" bug that
  looked, from the outside, like a dealing logic error. Fixed by
  `dealToMany()` in `src/lib/gameEngine.js`, which reads the shared draw
  pile exactly once and partitions it among players in memory instead of
  re-reading it once per player. The same lag also affects reading back a
  bucket rearrangement immediately after writing it (see `submitCard`'s
  "did everyone submit?" check and `applyBucketsAction`'s store patch in
  `src/lib/client.js`, both of which patch in the known-true write rather
  than trusting the very next read).
- **Bulk-create partial failure**: `bulk/create` can return HTTP 207 for a
  partially-successful batch; the client currently treats 207 the same as a
  full success (see `api.bulkCreate`). Round-start self-heals
  (`ensureSubmissionRow`, `dealUpToHandSize`) exist specifically to recover
  from a dropped record in one of these batches.

## 9. Implementation Status

The multiplayer phase is implemented in the current app, as a Svelte
client (see §10 and `SVELTE_SPEC.md` for the rationale and migration plan —
that doc's plan is now implemented). The following operational items are
part of the implementation:

- Multiplayer home screen with host, join, lobby, round, judging, reveal,
  and game-over views.
- Netlify Function proxy with an allowlist for the six game tables; the
  NocodeBackend secret remains server-side.
- Browser-local reconnect sessions, stale-session recovery, and a leave-game
  menu.
- Svelte stores for shared state — polling just calls `.set()` on the
  relevant stores every 2s; Svelte's own reactivity decides what actually
  needs to repaint, so there's no more hand-rolled "did anything actually
  change" diffing in the client.
- NocodeBackend-compatible enum and datetime serialization.
- Pass-and-play remains available at `/pass-and-play/`, kept outside the
  Svelte build (see §10) — its scoring rule and judging flow were brought in
  line with multiplayer's (best dare / two-step judging, see §1/§4) even
  though its UI stays plain HTML/CSS/JS. It also has its own animated "How
  to play" intro, shown on first load and replayable from the setup screen.

When testing startup repeatedly, use a fresh room after a failed or
interrupted start. A start that was interrupted after deck creation can leave
partial game rows in the backend; room cleanup is intentionally not performed
automatically because it could delete another player's active game.

## 10. Tech Stack

- **Multiplayer client** (`src/App.svelte`, `src/lib/`): Svelte + Vite.
  Chosen specifically to eliminate a whole class of bug this project hit
  repeatedly under the original hand-rolled vanilla-JS renderer — a
  snapshot-diff gate deciding whether to tear down and rebuild the entire
  screen on every poll, which was fragile to backend field-serialization
  quirks and caused visible flashing. Svelte's compiled reactivity only
  touches the DOM nodes tied to a value that actually changed, so polling
  can update stores freely without that gate. See `SVELTE_SPEC.md` for the
  full rationale and design.
  - `src/lib/api.js` — thin client for the `/api/data/*` proxy.
  - `src/lib/session.js` — browser-local reconnect credentials.
  - `src/lib/ids.js` — `sameId()`, the loose id-comparison helper needed by
    the id-type-stability quirk in §8b.
  - `src/lib/gameEngine.js` — round-orchestration rules (mirrors
    `src/js/game.js`'s rules but operates on NocodeBackend rows).
  - `src/lib/stores.js` — the shared reactive state.
  - `src/lib/client.js` — the poll loop and all write actions.
  - `src/lib/dragSort.js` — the judge's Pointer-Events drag-to-sort UI,
    ported as a Svelte action.
  - `src/lib/components/` — one component per screen.
- **Pass-and-play** (`src/js/app.js`, `src/js/game.js`,
  `pass-and-play/index.html`): plain HTML + CSS + JavaScript (ES modules),
  no build step, no dependencies — deliberately kept outside the Svelte
  build (see `SVELTE_SPEC.md` §2). `src/js/game.js` is the framework-free
  game/state logic; `src/js/app.js` is the DOM rendering/event wiring.
  Copied verbatim into the production build by `vite-plugin-static-copy`
  (configured in `vite.config.js`) so their existing relative
  `<script>`/`<link>` references keep working unmodified.
- `src/data/cards.js` — the starter Condition/Action decks, shared by both
  the pass-and-play app and the multiplayer game engine.
- `src/css/styles.css` — styling, shared by both apps (bundled for the
  Svelte app, copied verbatim for pass-and-play).
- The project is no longer a zero-build static-file publish: `npm run
  build` (`vite build`) runs during Netlify's build step and produces
  `dist/`, which is what actually gets published. `npm run dev` (`vite`)
  serves everything, including pass-and-play, directly from source with no
  build step needed for local development.
- Target: modern evergreen browsers (mobile Safari/Chrome included, since
  this game is primarily played on phones/tablets).
