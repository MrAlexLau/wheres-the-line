# Where's the Line — Project Spec

## 1. Concept

"Where's the Line" is a party game in the spirit of *Cards Against Humanity*,
played pass-and-play on a single device (multiplayer is a planned future
phase).

Each round poses a **Condition** — a hypothetical scenario ("win a new car",
"get out of a speeding ticket", "become mayor of your town"). Every
non-judging player secretly submits an **Action** card from their hand,
answering the implicit question: *"What would you do to make this happen?"*

The judge reads all of the submitted actions (anonymously, shuffled) and
decides where the line is:

- **The MOST card** — the most extreme action the judge decides they
  personally *would* do for the condition.
- **The LEAST card** — the least extreme action the judge decides they
  personally would *not* do — i.e. the point past which they refuse.

The two players who submitted those two cards each score a point. Everyone
else scores nothing that round. Play continues, rotating the judge, until a
player reaches the target score (default: 7 points), at which point the game
ends and a winner is declared.

Because the judge is picking two ends of a spectrum rather than one "best"
card, the game rewards players who read the *specific judge* well at both
extremes, not just whoever can write the funniest card.

## 2. Terminology

| Term | Meaning |
|---|---|
| Condition card | The round's prompt/scenario, read aloud by the judge. |
| Action card | A card describing a hypothetical action, played face-down as an answer. |
| Judge | The player who reads submissions and places the line for the round. Rotates every round. |
| The MOST pick | The action the judge would go furthest to do. Scores a point for its player. |
| The LEAST pick | The action that crosses the judge's line — the least they'd do / first thing they'd refuse. Scores a point for its player. |
| Hand | The set of Action cards a player currently holds (default size: 7). |
| Round | One full cycle: condition drawn → submissions → judging → scoring → hand refill. |
| Round Goal | Which pick(s) score this round: MOST only, LEAST only, or both ("in between"). Randomly chosen each round; see §4a. |

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
   card and the round's **Goal** (see §4a). The judge taps "Start round"
   once everyone is ready.
2. **Blind submission, one player at a time.** For each non-judge player in
   turn:
   - Interstitial: "Pass the device to <Player>."
   - That player sees the Condition and a large, high-contrast **criteria
     callout** — "Goal: Submit an action the judge <u>WOULD</u> do" /
     "<u>WOULD NOT</u> do" / either, depending on this round's Goal — before
     they view their hand and tap one Action card to submit face-down. The
     card leaves their hand.
   - Screen advances to the next submitting player. The judge does not
     submit a card.
3. **Judging.** Device passes back to the judge. All submitted actions are
   shown shuffled and anonymized (no player names attached), starting in a
   dashed, neutral **"🤔 Not sorted yet"** pile between two labeled
   drag-and-drop buckets: **"✅ Would do"** above it and **"🚫 Wouldn't do"**
   below it. The judge:
   - Drags each card out of the neutral pile into whichever bucket it
     belongs in. **Judging can't be confirmed until the neutral pile is
     empty** — every card must be sorted one way or the other.
   - Drags within a bucket to order cards by how extreme they are — the
     card nearest the middle in each bucket is the one that counts.
   - Either bucket may end up empty (they wouldn't do any of them, or
     they'd do all of them) once everything is sorted.
   The bottom-most card in "Would do" is **the MOST** pick; the top-most
   card in "Wouldn't do" is **the LEAST** pick. Either pick is simply
   absent when its bucket is empty.
4. **Reveal & scoring.** The app reveals which player played each submitted
   card, highlights whichever picks actually scored per the round's Goal,
   and awards one point each to those players' totals. Since each player
   submits at most one card per round and the line always separates two
   distinct cards, MOST and LEAST — when both apply — are always two
   different players.
5. **Hand refill.** Every player who submitted a card draws back up to their
   hand size from the Action deck. If the deck runs out, the discard pile
   (previously submitted/seen cards) is reshuffled into a new deck.
6. **Next judge.** Judge role passes to the next player in order; a new
   Condition card is drawn and a new round Goal is chosen; return to step 1.
7. **Win check.** After scoring, if any player's total ≥ target score, the
   game ends immediately and the Game Over screen is shown instead of
   advancing to the next round.

### 4a. Round Goals

Each round is randomly assigned one of these Goals, shown to the table
alongside the Condition card:

| Goal | Who scores (+1) | Eligibility |
|---|---|---|
| **Most likely to do** | MOST pick (card just above the line) | Always available |
| **Least likely to do** | LEAST pick (card just below the line) | Always available |
| **Anything in between scores** | Both the MOST and LEAST picks | Only offered when there are **3+ submitters (4+ total players)** |

Landing on the wrong side of the line simply scores nothing — there's no
penalty. Submitters are told the active Goal before they pick a card, since
it changes the right answer: in a "most" round you're aiming for something
the judge would actually do; too tame and it just won't score.

The "in between" goal is excluded below 4 players because with only 2
submitters, the line has nowhere else to go — MOST and LEAST are always
just the same two cards, so there's no real judgment being tested. If the
line ends up at an extreme (above/below every card) in a round whose Goal
needs that missing side, nobody scores that round — a legitimate outcome,
not an error state.

## 5. Scoring & End of Game

- +1 point for the MOST pick, +1 point for the LEAST pick, per round.
- First player to reach the target score wins. Ties are possible only if
  the judge's two picks belong to two different players who are both at or
  above target after the same round; both are shown as winners.
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

## 7. Non-Goals for v1 (Pass & Play)

- No accounts, no network play, no persistence across browser sessions
  beyond the current tab's in-memory game state.
- No card authoring UI.
- No sound/animation polish beyond basic transitions.
- No spectator mode.

## 8. Future: Multiplayer (Phase 2, not built yet)

Documented here so v1's architecture doesn't paint us into a corner:

- Game state (players, hands, judge index, scores, deck position) should
  live behind a single `Game` class/module with a serializable state object
  and pure transition functions (`submitCard`, `judgePick`, `nextRound`,
  etc.), decoupled from DOM rendering. This is what makes it portable to a
  server-authoritative model later.
- Planned approach: a small realtime backend (e.g. WebSocket relay or a
  hosted realtime DB) so each player uses their own device/hand instead of
  passing one device around; host device or server holds authoritative
  state; Netlify would host only the static client, with the realtime
  service hosted separately (Netlify Functions can proxy/auth but aren't a
  great fit for long-lived WebSocket state).
- Room codes for joining a game, reconnect handling, and a lobby screen are
  the main new UI surfaces multiplayer will need.
- None of this is implemented in v1; the only requirement on v1 is to keep
  game logic separate from pass-and-play-specific UI so it can be reused.

## 9. Tech Stack

- Plain HTML + CSS + JavaScript (ES modules), no build step, no
  dependencies — keeps the Netlify deploy a pure static-file publish.
- `src/js/game.js` — framework-free game/state logic (the reusable core
  described in §8).
- `src/js/app.js` — DOM rendering and event wiring for the pass-and-play UI.
- `src/data/cards.js` — the starter Condition/Action decks.
- `src/css/styles.css` — styling.
- Target: modern evergreen browsers (mobile Safari/Chrome included, since
  pass-and-play is primarily played on phones/tablets).
