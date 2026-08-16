// Round-orchestration rules for networked play, mirroring game.js's Game
// class but operating on nocodebackend rows instead of in-memory arrays.
//
// Deviation from the original plan: rather than funneling every write
// through a single "host device," each player's own device drives the
// transitions that belong to their own role (submitting their card; the
// judge starting/confirming a round). This matches how the games are
// actually played (everyone has their own device, not one pass-and-play
// screen) while keeping the same "no server-side rule enforcement" posture
// — nothing here runs on the backend, it's all client logic that happens to
// write shared rows. See docs/SPEC.md §8 and SVELTE_SPEC.md for context.
//
// Framework-agnostic on purpose (no Svelte imports) — client.js is the only
// thing that wires this into stores.

import { api } from "./api.js";
import { CONDITIONS, ACTIONS } from "../data/cards.js";
import { shuffle } from "../js/game.js";
import { sameId } from "./ids.js";

async function materializeDecks(roomId) {
  const conditionRecords = shuffle(CONDITIONS).map((card_text, i) => ({
    room_id: roomId,
    deck_type: "CONDITION",
    card_text,
    status: "IN_DRAW_PILE",
    draw_order: i,
  }));
  const actionRecords = shuffle(ACTIONS).map((card_text, i) => ({
    room_id: roomId,
    deck_type: "ACTION",
    card_text,
    status: "IN_DRAW_PILE",
    draw_order: i,
  }));
  await api.bulkCreate("deck_cards", conditionRecords);
  await api.bulkCreate("deck_cards", actionRecords);
}

async function reshuffleIfNeeded(roomId, deckType) {
  const drawable = await api.read("deck_cards", { room_id: roomId, deck_type: deckType, status: "IN_DRAW_PILE", limit: 1 });
  if (drawable.length > 0) return;
  const discarded = await api.read("deck_cards", { room_id: roomId, deck_type: deckType, status: "DISCARDED", limit: 500 });
  if (discarded.length === 0) throw new Error(`${deckType} deck is empty and has nothing to reshuffle.`);
  const order = shuffle(discarded.map((r) => r.id));
  await Promise.all(order.map((id, i) => api.update("deck_cards", id, { status: "IN_DRAW_PILE", draw_order: i })));
}

/** Draws one Condition card, marking it discarded immediately (conditions never sit "in hand"). */
async function drawCondition(roomId) {
  await reshuffleIfNeeded(roomId, "CONDITION");
  const [row] = await api.read("deck_cards", { room_id: roomId, deck_type: "CONDITION", status: "IN_DRAW_PILE", sort: "draw_order", order: "asc", limit: 1 });
  await api.update("deck_cards", row.id, { status: "DISCARDED" });
  return row.card_text;
}

/**
 * Deals up to handSize cards to *multiple* players in one pass. Prefer this
 * over calling dealUpToHandSize once per player in a loop: each call to
 * dealUpToHandSize re-reads "what's still IN_DRAW_PILE," and that read is
 * not guaranteed to reflect another call's just-completed write (confirmed
 * empirically — see SVELTE_SPEC.md / docs/SPEC.md §8b "no read-after-write
 * guarantee," which turned out to apply across *different* writes too, not
 * just your own). Looping dealUpToHandSize sequentially over players let a
 * later player's read miss an earlier player's card assignment and
 * re-deal/steal those exact cards — the actual root cause of the "one
 * player ends up with zero cards" bug. This version reads the shared draw
 * pile exactly once, partitions it among players in memory, and writes each
 * card to its final holder directly, so there's no cross-player read to
 * race against.
 */
export async function dealToMany(roomId, players, handSize) {
  const heldCounts = await Promise.all(
    players.map((p) =>
      api
        .read("deck_cards", { room_id: roomId, deck_type: "ACTION", status: "IN_HAND", holder_player_id: p.id, limit: 500 })
        .then((h) => h.length)
    )
  );
  const needs = players.map((_, i) => Math.max(0, handSize - heldCounts[i]));
  let totalNeed = needs.reduce((a, b) => a + b, 0);
  if (totalNeed === 0) return;

  let drawable = [];
  while (drawable.length < totalNeed) {
    const batch = await api.read("deck_cards", {
      room_id: roomId,
      deck_type: "ACTION",
      status: "IN_DRAW_PILE",
      sort: "draw_order",
      order: "asc",
      limit: totalNeed - drawable.length,
    });
    if (batch.length === 0) {
      await reshuffleIfNeeded(roomId, "ACTION");
      continue;
    }
    drawable = drawable.concat(batch);
  }

  const writes = [];
  let cursor = 0;
  players.forEach((p, i) => {
    const slice = drawable.slice(cursor, cursor + needs[i]);
    cursor += needs[i];
    for (const card of slice) {
      writes.push(api.update("deck_cards", card.id, { status: "IN_HAND", holder_player_id: p.id }));
    }
  });
  await Promise.all(writes);
}

/**
 * Single-player top-up. Safe for the self-heal path (an isolated player
 * catching themselves up mid-round, not part of a tight multi-player dealing
 * loop) but prefer dealToMany() whenever dealing to more than one player at
 * once — see its comment for why looping this one is the actual bug that
 * caused "a player ends up with zero cards."
 */
export async function dealUpToHandSize(roomId, playerId, handSize) {
  const held = await api.read("deck_cards", { room_id: roomId, deck_type: "ACTION", status: "IN_HAND", holder_player_id: playerId, limit: 500 });
  let need = handSize - held.length;
  if (need <= 0) return;
  while (need > 0) {
    const drawable = await api.read("deck_cards", {
      room_id: roomId,
      deck_type: "ACTION",
      status: "IN_DRAW_PILE",
      sort: "draw_order",
      order: "asc",
      limit: need,
    });
    if (drawable.length === 0) {
      await reshuffleIfNeeded(roomId, "ACTION");
      continue;
    }
    await Promise.all(drawable.map((row) => api.update("deck_cards", row.id, { status: "IN_HAND", holder_player_id: playerId })));
    need -= drawable.length;
  }
}

/**
 * Self-heal: if this player is missing their round's submission row (e.g.
 * the bulk-create at round start silently dropped one record), create it.
 * A no-op if the row already exists. Returns the (possibly newly created)
 * submission row.
 */
export async function ensureSubmissionRow(roundId, playerId, existingSubmissions) {
  const existing = existingSubmissions.find((s) => sameId(s.player_id, playerId));
  if (existing) return existing;
  // The caller's existingSubmissions came from a list-read that may itself
  // be lagging (see docs/SPEC.md §8b) — re-check with a fresh, narrowly
  // scoped read before concluding the row is actually missing, rather than
  // creating a duplicate. A duplicate here is worse than the thing this
  // function exists to fix: it makes .find()-by-player-id ambiguous, which
  // showed up as a player's screen staying stuck on their hand after they'd
  // already submitted (the "wrong" duplicate row, still unsubmitted, kept
  // winning the lookup).
  const [reallyExisting] = await api.read("submissions", { round_id: roundId, player_id: playerId, limit: 1 });
  if (reallyExisting) return reallyExisting;
  const id = await api.create("submissions", { round_id: roundId, player_id: playerId });
  return { id, round_id: roundId, player_id: playerId, submitted_at: null, card_text: null };
}

async function createRound(room, players, roundNumber, judgePlayer) {
  const nonJudge = players.filter((p) => !sameId(p.id, judgePlayer.id));
  const condition = await drawCondition(room.id);

  // Rounds open straight into SUBMITTING — there's no separate "pass to the
  // judge" interstitial in multiplayer (everyone already has their own
  // device), so a manual "start round" gate would just be an extra tap.
  //
  // round_goal is always "MOST": scoring is always "the least likely thing
  // the judge would still do" — the card right on the edge of their "Would
  // do" bucket. There's no longer a per-round random goal; the enum column
  // stays for schema compat but only ever gets this one value now.
  const roundId = await api.create("rounds", {
    room_id: room.id,
    round_number: roundNumber,
    phase: "SUBMITTING",
    judge_player_id: judgePlayer.id,
    condition_card_text: condition,
    round_goal: "MOST",
  });
  await api.bulkCreate(
    "submissions",
    nonJudge.map((p) => ({ round_id: roundId, player_id: p.id }))
  );
  await api.update("rooms", room.id, { current_round_number: roundNumber, current_phase: "SUBMITTING" });
  return roundId;
}

/** Host-only: sets up decks, deals hands, and creates round 1. Call once from the Lobby "Start" button. */
export async function startGame(room, players) {
  // The host's own player list can be up to one poll interval (2s) stale —
  // a player who joined right before "Start game" was clicked could be
  // missing from it, which would deal them no cards at all and skip them
  // when creating round 1's submissions. Re-read the roster right before
  // acting on it to close that window.
  const freshPlayers = await api.read("players", { room_id: room.id });
  players = freshPlayers.length >= players.length ? freshPlayers : players;

  await materializeDecks(room.id);
  await dealToMany(room.id, players, room.hand_size);
  const judge = players[0];
  await createRound(room, players, 1, judge);
  await api.update("rooms", room.id, { status: "IN_PROGRESS" });
}

/**
 * Player-only: plays one card from their hand. Returns the submitted_at
 * timestamp actually written. Identifies the card by its deck_cards row id
 * (not by card text) — two identical card_text values would otherwise be
 * ambiguous to a text-based lookup (`limit: 1` on a text match could pick
 * either one). Not currently reachable (the shipped decks have no
 * duplicate strings — see docs/SPEC.md §6), but matching by id removes the
 * whole class of bug rather than relying on that staying true.
 */
export async function submitCard(room, roundId, submissionId, playerId, deckCardId, card) {
  const deckRow = await api.readOne("deck_cards", deckCardId);
  if (!deckRow || !sameId(deckRow.holder_player_id, playerId) || deckRow.status !== "IN_HAND") {
    throw new Error("That card isn't in your hand anymore.");
  }
  await api.update("deck_cards", deckRow.id, { status: "DISCARDED", holder_player_id: null });
  const submittedAt = ncbDatetime();
  await api.update("submissions", submissionId, { card_text: card, submitted_at: submittedAt });

  // Cap comfortably above the 8-player room limit (so at most 7 non-judge
  // submitters) rather than trusting whatever the backend's default page
  // size happens to be today — a silent truncation here would make this
  // check think fewer players exist than actually do, which could either
  // fire beginJudging early or never fire it at all.
  const allSubmissions = await api.read("submissions", { round_id: roundId, limit: 20 });
  // The row we just wrote to `submissions` may not be reflected in this
  // read yet (no read-after-write guarantee), which would silently strand
  // everyone on the "waiting" screen forever. We know our own submission
  // went through, so treat it as submitted regardless of what this read
  // says.
  const withOwnWrite = allSubmissions.map((s) => (sameId(s.id, submissionId) ? { ...s, submitted_at: s.submitted_at || submittedAt } : s));
  if (withOwnWrite.every((s) => s.submitted_at)) {
    await beginJudging(room, roundId, withOwnWrite);
  }
  return submittedAt;
}

async function beginJudging(room, roundId, submissions) {
  // Two submitters finishing at nearly the same moment (the last two
  // players remaining, both tapping their card within the same couple of
  // seconds — an entirely ordinary way for this to actually happen, not an
  // exotic edge case) can both reach this function with an empty read here,
  // since this check-then-act isn't atomic — nothing in this backend
  // supports a real compare-and-swap. Both would then bulkCreate a full set
  // of judging_slots, doubling every card in the judge's UI. Rather than
  // trying to prevent the race (not possible without backend support),
  // detect and clean up the duplicate afterward — see below.
  const existing = await api.read("judging_slots", { round_id: roundId, limit: 1 });
  if (existing.length > 0) return; // another device already opened judging
  const shuffled = shuffle(submissions);
  await api.bulkCreate(
    "judging_slots",
    shuffled.map((s) => ({ round_id: roundId, submission_id: s.id, bucket: "NEUTRAL" }))
  );
  await api.update("rounds", roundId, { phase: "JUDGING" });
  await api.update("rooms", room.id, { current_phase: "JUDGING" });
  await dedupeJudgingSlots(roundId);
}

/**
 * If two devices raced to create judging_slots for the same round (see
 * beginJudging above), this leaves each submission with two slots instead
 * of one. Keep the lowest-id slot per submission and delete the rest. A
 * no-op in the overwhelmingly common case where there was no race.
 *
 * Both racing devices run this same cleanup concurrently (confirmed
 * empirically, not just theorized), so two deletes can target the same
 * already-gone row — the second one 404s. That's the desired end state
 * arrived at twice, not a failure; swallow "not found" specifically and
 * let any other error still surface.
 */
async function dedupeJudgingSlots(roundId) {
  const slots = await api.read("judging_slots", { round_id: roundId, limit: 50 });
  const seenBySubmission = new Map();
  const extras = [];
  for (const slot of slots.slice().sort((a, b) => a.id - b.id)) {
    if (seenBySubmission.has(slot.submission_id)) extras.push(slot);
    else seenBySubmission.set(slot.submission_id, slot);
  }
  await Promise.all(
    extras.map((s) =>
      api.remove("judging_slots", s.id).catch((err) => {
        if (!/not found/i.test(err.message)) throw err;
      })
    )
  );
}

/** Judge-only: persists a full bucket rearrangement from the drag-sort UI. */
export async function applyBuckets(wouldOrder, wouldntOrder, neutralOrder) {
  const writes = [];
  wouldOrder.forEach((slotId, i) => writes.push(api.update("judging_slots", slotId, { bucket: "WOULD", position: i })));
  wouldntOrder.forEach((slotId, i) => writes.push(api.update("judging_slots", slotId, { bucket: "WOULDNT", position: i })));
  neutralOrder.forEach((slotId) => writes.push(api.update("judging_slots", slotId, { bucket: "NEUTRAL", position: null })));
  await Promise.all(writes);
}

/** Judge-only: scores the round, discards played cards, refills hands, advances to REVEAL. */
export async function confirmJudging(room, round, submissions, judgingSlots, players) {
  const would = judgingSlots.filter((s) => s.bucket === "WOULD").sort((a, b) => a.position - b.position);
  // The winner is always the card right on the edge of "Would do" — the
  // least likely thing the judge would still do. No more MOST/LEAST/BETWEEN
  // random goal; this is the only rule now.
  const winningSlot = would[would.length - 1] ?? null;
  const scorerSubmissionIds = winningSlot ? [winningSlot.submission_id] : [];

  const writes = [];
  for (const s of submissions) {
    const scored = scorerSubmissionIds.some((id) => sameId(id, s.id));
    writes.push(api.update("submissions", s.id, { round_score_delta: scored ? 1 : 0 }));
    if (scored) {
      const player = players.find((p) => sameId(p.id, s.player_id));
      writes.push(api.update("players", player.id, { score: player.score + 1 }));
    }
  }
  await Promise.all(writes);

  const submitters = submissions.map((s) => players.find((p) => sameId(p.id, s.player_id))).filter(Boolean);
  await dealToMany(room.id, submitters, room.hand_size);

  await api.update("rounds", round.id, { phase: "REVEAL", confirmed_at: ncbDatetime() });
  await api.update("rooms", room.id, { current_phase: "REVEAL" });
}

/** Host-only: rotates the judge and starts the next round, or ends the game. */
export async function nextRound(room, round, players) {
  const targetScore = room.target_score;
  if (players.some((p) => p.score >= targetScore)) {
    await api.update("rounds", round.id, { phase: "GAME_OVER" });
    await api.update("rooms", room.id, { status: "COMPLETE", current_phase: "GAME_OVER" });
    return;
  }
  const orderedByJoin = players.slice().sort((a, b) => a.join_order - b.join_order);
  const currentJudgeIdx = orderedByJoin.findIndex((p) => sameId(p.id, round.judge_player_id));
  const nextJudge = orderedByJoin[(currentJudgeIdx + 1) % orderedByJoin.length];
  await createRound(room, players, room.current_round_number + 1, nextJudge);
}

// NocodeBackend's MySQL datetime columns expect `YYYY-MM-DD HH:mm:ss`, not
// the ISO-8601 `T...Z` representation returned by Date#toISOString().
function ncbDatetime(date = new Date()) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
