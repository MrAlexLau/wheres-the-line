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
// write shared rows. See docs/SPEC.md §8 and the plan file for context.

import { api } from "./api.js";
import { CONDITIONS, ACTIONS } from "../data/cards.js";
import { pickRoundGoal, shuffle } from "../game.js";

async function materializeDecks(roomId) {
  const conditionRecords = shuffle(CONDITIONS).map((card_text, i) => ({
    room_id: roomId,
    deck_type: "condition",
    card_text,
    status: "in_draw_pile",
    draw_order: i,
  }));
  const actionRecords = shuffle(ACTIONS).map((card_text, i) => ({
    room_id: roomId,
    deck_type: "action",
    card_text,
    status: "in_draw_pile",
    draw_order: i,
  }));
  await api.bulkCreate("deck_cards", conditionRecords);
  await api.bulkCreate("deck_cards", actionRecords);
}

async function reshuffleIfNeeded(roomId, deckType) {
  const drawable = await api.read("deck_cards", { room_id: roomId, deck_type: deckType, status: "in_draw_pile", limit: 1 });
  if (drawable.length > 0) return;
  const discarded = await api.read("deck_cards", { room_id: roomId, deck_type: deckType, status: "discarded", limit: 500 });
  if (discarded.length === 0) throw new Error(`${deckType} deck is empty and has nothing to reshuffle.`);
  const order = shuffle(discarded.map((r) => r.id));
  await Promise.all(order.map((id, i) => api.update("deck_cards", id, { status: "in_draw_pile", draw_order: i })));
}

/** Draws one Condition card, marking it discarded immediately (conditions never sit "in hand"). */
async function drawCondition(roomId) {
  await reshuffleIfNeeded(roomId, "condition");
  const [row] = await api.read("deck_cards", { room_id: roomId, deck_type: "condition", status: "in_draw_pile", sort: "draw_order", order: "asc", limit: 1 });
  await api.update("deck_cards", row.id, { status: "discarded" });
  return row.card_text;
}

async function dealUpToHandSize(roomId, playerId, handSize) {
  const held = await api.read("deck_cards", { room_id: roomId, deck_type: "action", status: "in_hand", holder_player_id: playerId, limit: 500 });
  let need = handSize - held.length;
  if (need <= 0) return;
  while (need > 0) {
    const drawable = await api.read("deck_cards", {
      room_id: roomId,
      deck_type: "action",
      status: "in_draw_pile",
      sort: "draw_order",
      order: "asc",
      limit: need,
    });
    if (drawable.length === 0) {
      await reshuffleIfNeeded(roomId, "action");
      continue;
    }
    await Promise.all(drawable.map((row) => api.update("deck_cards", row.id, { status: "in_hand", holder_player_id: playerId })));
    need -= drawable.length;
  }
}

async function createRound(room, players, roundNumber, judgePlayer) {
  const nonJudge = players.filter((p) => p.id !== judgePlayer.id);
  const condition = await drawCondition(room.id);
  const roundGoal = pickRoundGoal(nonJudge.length).toLowerCase();

  const roundId = await api.create("rounds", {
    room_id: room.id,
    round_number: roundNumber,
    phase: "round_intro",
    judge_player_id: judgePlayer.id,
    condition_card_text: condition,
    round_goal: roundGoal,
  });
  await api.bulkCreate(
    "submissions",
    nonJudge.map((p) => ({ round_id: roundId, player_id: p.id }))
  );
  await api.update("rooms", room.id, { current_round_number: roundNumber, current_phase: "round_intro" });
  return roundId;
}

/** Host-only: sets up decks, deals hands, and creates round 1. Call once from the Lobby "Start" button. */
export async function startGame(room, players) {
  await materializeDecks(room.id);
  // Deal in order: concurrent reads of the draw pile could otherwise give
  // multiple players the same card before either update reaches the API.
  for (const player of players) {
    await dealUpToHandSize(room.id, player.id, room.hand_size);
  }
  const judge = players[0];
  await createRound(room, players, 1, judge);
  await api.update("rooms", room.id, { status: "in_progress" });
}

/** Judge-only: reveals the condition and opens submissions. */
export async function startSubmissions(room, round) {
  await api.update("rounds", round.id, { phase: "submitting" });
  await api.update("rooms", room.id, { current_phase: "submitting" });
}

/** Player-only: plays one card from their hand. */
export async function submitCard(room, roundId, submissionId, playerId, card) {
  const [deckRow] = await api.read("deck_cards", { room_id: room.id, holder_player_id: playerId, card_text: card, status: "in_hand", limit: 1 });
  if (!deckRow) throw new Error("That card isn't in your hand anymore.");
  await api.update("deck_cards", deckRow.id, { status: "discarded", holder_player_id: null });
  await api.update("submissions", submissionId, { card_text: card, submitted_at: new Date().toISOString() });

  const allSubmissions = await api.read("submissions", { round_id: roundId });
  if (allSubmissions.every((s) => s.submitted_at)) {
    await beginJudging(room, roundId, allSubmissions);
  }
}

async function beginJudging(room, roundId, submissions) {
  const existing = await api.read("judging_slots", { round_id: roundId, limit: 1 });
  if (existing.length > 0) return; // another device already opened judging
  const shuffled = shuffle(submissions);
  await api.bulkCreate(
    "judging_slots",
    shuffled.map((s) => ({ round_id: roundId, submission_id: s.id, bucket: "neutral" }))
  );
  await api.update("rounds", roundId, { phase: "judging" });
  await api.update("rooms", room.id, { current_phase: "judging" });
}

/** Judge-only: persists a full bucket rearrangement from the drag-sort UI. */
export async function applyBuckets(wouldOrder, wouldntOrder, neutralOrder) {
  const writes = [];
  wouldOrder.forEach((slotId, i) => writes.push(api.update("judging_slots", slotId, { bucket: "would", position: i })));
  wouldntOrder.forEach((slotId, i) => writes.push(api.update("judging_slots", slotId, { bucket: "wouldnt", position: i })));
  neutralOrder.forEach((slotId) => writes.push(api.update("judging_slots", slotId, { bucket: "neutral", position: null })));
  await Promise.all(writes);
}

/** Judge-only: scores the round, discards played cards, refills hands, advances to REVEAL. */
export async function confirmJudging(room, round, submissions, judgingSlots, players) {
  const would = judgingSlots.filter((s) => s.bucket === "would").sort((a, b) => a.position - b.position);
  const wouldnt = judgingSlots.filter((s) => s.bucket === "wouldnt").sort((a, b) => a.position - b.position);
  const mostSlot = would[would.length - 1] ?? null;
  const leastSlot = wouldnt[0] ?? null;

  const scorerSubmissionIds = [];
  if (round.round_goal === "most") {
    if (mostSlot) scorerSubmissionIds.push(mostSlot.submission_id);
  } else if (round.round_goal === "least") {
    if (leastSlot) scorerSubmissionIds.push(leastSlot.submission_id);
  } else {
    if (mostSlot) scorerSubmissionIds.push(mostSlot.submission_id);
    if (leastSlot) scorerSubmissionIds.push(leastSlot.submission_id);
  }

  const writes = [];
  for (const s of submissions) {
    const scored = scorerSubmissionIds.includes(s.id);
    writes.push(api.update("submissions", s.id, { round_score_delta: scored ? 1 : 0 }));
    if (scored) {
      const player = players.find((p) => p.id === s.player_id);
      writes.push(api.update("players", player.id, { score: player.score + 1 }));
    }
  }
  await Promise.all(writes);

  // Same constraint as the initial deal: reserve cards one player at a time.
  for (const submission of submissions) {
    await dealUpToHandSize(room.id, submission.player_id, room.hand_size);
  }

  await api.update("rounds", round.id, { phase: "reveal", confirmed_at: new Date().toISOString() });
  await api.update("rooms", room.id, { current_phase: "reveal" });
}

/** Host-only: rotates the judge and starts the next round, or ends the game. */
export async function nextRound(room, round, players) {
  const targetScore = room.target_score;
  if (players.some((p) => p.score >= targetScore)) {
    await api.update("rounds", round.id, { phase: "game_over" });
    await api.update("rooms", room.id, { status: "complete", current_phase: "game_over" });
    return;
  }
  const orderedByJoin = players.slice().sort((a, b) => a.join_order - b.join_order);
  const currentJudgeIdx = orderedByJoin.findIndex((p) => p.id === round.judge_player_id);
  const nextJudge = orderedByJoin[(currentJudgeIdx + 1) % orderedByJoin.length];
  await createRound(room, players, room.current_round_number + 1, nextJudge);
}
