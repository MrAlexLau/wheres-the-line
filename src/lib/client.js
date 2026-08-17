// Poll loop + write actions for the multiplayer client. Reads/writes the
// stores in stores.js directly; components subscribe to those stores and
// don't need to know when a poll happened — Svelte's reactivity handles
// that. See SVELTE_SPEC.md §5.

import { get } from "svelte/store";
import { api } from "./api.js";
import { saveSession, loadSession, clearSession, randomToken, randomRoomCode } from "./session.js";
import * as engine from "./gameEngine.js";
import { sameId } from "./ids.js";
import { screen, form, session, room, players, round, submissions, judgingSlots, myHand, uiBusy, uiError, resetRoomState } from "./stores.js";

let pollHandle = null;
let onExitCallback = null;
// Per-round dedup guards for the self-heal checks in refresh() — see there.
let healedSubmissionRounds = new Set();
let healedHandRounds = new Set();
// A submission row "missing" on a single poll is more often a lagging read
// than an actually-missing row (see docs/SPEC.md §8b) — require it to look
// missing on two consecutive polls (~2s apart) before self-healing, so a
// single stale read can't trigger creating a real duplicate row.
let suspectedMissingSubmissionRounds = new Set();

/** Called once when entering the room app (host-setup/join/reconnect). */
export function initRoomClient(initialScreen, exitCallback) {
  onExitCallback = exitCallback;
  const existing = loadSession();
  resetRoomState();
  screen.set(existing ? "lobby" : initialScreen);
  session.set(existing);
  healedSubmissionRounds = new Set();
  healedHandRounds = new Set();
  suspectedMissingSubmissionRounds = new Set();

  if (existing) refresh();
  stopPolling();
  pollHandle = setInterval(() => {
    if (get(session)) refresh();
  }, 2000);
}

export function stopPolling() {
  clearInterval(pollHandle);
  pollHandle = null;
}

async function refresh() {
  const s = get(session);
  if (!s) return;
  const { roomId, playerId } = s;
  const [freshRoom, freshPlayers] = await Promise.all([api.readOne("rooms", roomId), api.read("players", { room_id: roomId })]);
  if (!freshRoom) {
    // A stale localStorage reconnect credential (for example, after a room
    // was deleted or only partially created) must not leave the UI trying
    // to render a null room.
    clearSession();
    session.set(null);
    stopPolling();
    onExitCallback?.();
    return;
  }
  room.set(freshRoom);
  players.set(freshPlayers);

  if (freshRoom.status === "IN_PROGRESS" || freshRoom.status === "COMPLETE") {
    screen.set("in-round");
    // sort/order pins this to the single current round deterministically —
    // without it, a backend with no default ordering could hand back a
    // different matching row on each poll.
    const [freshRound] = await api.read("rounds", {
      room_id: roomId,
      round_number: freshRoom.current_round_number,
      sort: "id",
      order: "desc",
      limit: 1,
    });
    round.set(freshRound ?? null);

    if (freshRound) {
      // Explicit limits well above the 8-player room cap (so at most 7
      // non-judge submitters/slots), rather than trusting whatever the
      // backend's default page size happens to be — a silent truncation
      // here would make the client think fewer players exist than
      // actually do.
      const freshSubmissions = await api.read("submissions", { round_id: freshRound.id, limit: 20 });
      submissions.set(freshSubmissions);

      if (freshRound.phase === "JUDGING" || freshRound.phase === "REVEAL") {
        judgingSlots.set(await api.read("judging_slots", { round_id: freshRound.id, limit: 20 }));
      }

      if (freshRound.phase === "SUBMITTING" && !sameId(freshRound.judge_player_id, playerId)) {
        // Self-heal a missing submission row (e.g. the round-start
        // bulk-create silently dropped one record) — without it this
        // player could never actually submit. Requires the row to look
        // missing on two consecutive polls before acting (see
        // suspectedMissingSubmissionRounds above), and even then
        // ensureSubmissionRow does its own fresh targeted re-check before
        // creating anything.
        let mySub = freshSubmissions.find((sub) => sameId(sub.player_id, playerId));
        if (!mySub && !healedSubmissionRounds.has(freshRound.id)) {
          if (!suspectedMissingSubmissionRounds.has(freshRound.id)) {
            suspectedMissingSubmissionRounds.add(freshRound.id);
          } else {
            healedSubmissionRounds.add(freshRound.id);
            mySub = await engine.ensureSubmissionRow(freshRound.id, playerId, freshSubmissions);
            submissions.update((list) => [...list, mySub]);
          }
        }

        let hand = await api.read("deck_cards", {
          room_id: roomId,
          deck_type: "ACTION",
          status: "IN_HAND",
          holder_player_id: playerId,
        });
        // Self-heal a genuinely empty hand (e.g. a late joiner who missed
        // the initial deal). Only fires once per round, and only for a
        // hard-zero hand — not merely "fewer than hand_size" — so a
        // momentarily-short read of an otherwise-fine hand can't trigger a
        // repeated top-up loop.
        if (hand.length === 0 && mySub && !mySub.submitted_at && !healedHandRounds.has(freshRound.id)) {
          healedHandRounds.add(freshRound.id);
          await engine.dealUpToHandSize(roomId, playerId, freshRoom.hand_size);
          hand = await api.read("deck_cards", {
            room_id: roomId,
            deck_type: "ACTION",
            status: "IN_HAND",
            holder_player_id: playerId,
          });
        }
        myHand.set(hand);
      }
    }
  } else {
    screen.set("lobby");
  }
}

// ---------- pre-session actions (home / host-setup / join screens) ----------

export function exitToHome() {
  stopPolling();
  onExitCallback?.();
}

function setFormError(msg) {
  form.update((f) => ({ ...f, error: msg }));
}

export async function createRoom() {
  const f = get(form);
  const name = f.name.trim();
  if (!name) return setFormError("Enter your name.");
  uiBusy.set(true);
  try {
    const roomId = await api.create("rooms", {
      room_code: randomRoomCode(),
      status: "LOBBY",
      target_score: Number(f.targetScore) || 3,
      hand_size: Number(f.handSize) || 5,
      current_round_number: 0,
    });
    const token = randomToken();
    const playerId = await api.create("players", {
      room_id: roomId,
      display_name: name,
      join_order: 0,
      session_token: token,
      is_host: true,
      score: 0,
    });
    await api.update("rooms", roomId, { host_player_id: playerId });
    const newSession = { roomId, playerId, sessionToken: token };
    session.set(newSession);
    saveSession(newSession);
    await refresh();
  } catch (err) {
    setFormError(err.message);
  } finally {
    uiBusy.set(false);
  }
}

export async function joinRoom() {
  const f = get(form);
  const name = f.name.trim();
  const code = f.roomCode.trim().toUpperCase();
  if (!name) return setFormError("Enter your name.");
  if (!code) return setFormError("Enter a room code.");
  uiBusy.set(true);
  try {
    const [foundRoom] = await api.read("rooms", { room_code: code, limit: 1 });
    if (!foundRoom) return setFormError("No room found with that code.");
    if (foundRoom.status !== "LOBBY") return setFormError("That game has already started.");
    const existingPlayers = await api.read("players", { room_id: foundRoom.id });
    if (existingPlayers.length >= 8) return setFormError("That room is full.");
    if (existingPlayers.some((p) => p.display_name.toLowerCase() === name.toLowerCase())) {
      return setFormError("Someone already has that name in this room.");
    }
    const token = randomToken();
    const playerId = await api.create("players", {
      room_id: foundRoom.id,
      display_name: name,
      join_order: existingPlayers.length,
      session_token: token,
      is_host: false,
      score: 0,
    });
    const newSession = { roomId: foundRoom.id, playerId, sessionToken: token };
    session.set(newSession);
    saveSession(newSession);
    await refresh();
  } catch (err) {
    setFormError(err.message);
  } finally {
    uiBusy.set(false);
  }
}

export function leaveRoom() {
  clearSession();
  session.set(null);
  stopPolling();
  onExitCallback?.();
}

// ---------- in-room actions ----------

// `optimisticPatch(result)`, when given, is applied to local state right
// after a successful write and again after the follow-up refresh() — the
// second application matters because refresh()'s read isn't guaranteed to
// reflect the write we just made (no read-after-write guarantee from the
// backend), which could otherwise let a stale read overwrite what we
// already know just happened (e.g. submitting a card not immediately
// showing as submitted).
export async function runRoomAction(action, { optimisticPatch } = {}) {
  if (get(uiBusy)) return;
  uiBusy.set(true);
  uiError.set("");
  try {
    const result = await action();
    if (optimisticPatch) optimisticPatch(result);
    await refresh();
    if (optimisticPatch) optimisticPatch(result);
  } catch (err) {
    uiError.set(err.message);
  } finally {
    uiBusy.set(false);
  }
}

export async function startGameAction() {
  uiBusy.set(true);
  uiError.set("");
  try {
    await engine.startGame(get(room), get(players));
    await refresh();
  } catch (err) {
    uiError.set(err.message);
  } finally {
    uiBusy.set(false);
  }
}

export function submitCardAction(submissionId, playerId, deckCardId, card) {
  return runRoomAction(() => engine.submitCard(get(room), get(round).id, submissionId, playerId, deckCardId, card), {
    optimisticPatch: (submittedAt) => {
      submissions.update((list) =>
        list.map((s) => (sameId(s.id, submissionId) ? { ...s, card_text: card, submitted_at: s.submitted_at || submittedAt } : s))
      );
    },
  });
}

// Confirmed empirically (see gameEngine.js's dealToMany comment): a read
// right after a write can lag behind *any* recent write, not just your own.
// Patching the store directly with what we know we just wrote — both
// immediately and again after refresh(), in case that read was stale —
// avoids two real failure modes: the judge's just-sorted cards visually
// "snapping back" to the neutral pile, and Confirm scoring off of a
// judgingSlots read that hasn't caught up yet (silently awarding 0 points).
function patchJudgingSlots(wouldIds, wouldntIds, neutralIds) {
  judgingSlots.update((slots) => {
    const byId = new Map(slots.map((s) => [String(s.id), { ...s }]));
    const setBucket = (ids, bucket) =>
      ids.forEach((id, i) => {
        const s = byId.get(String(id));
        if (s) {
          s.bucket = bucket;
          s.position = bucket === "NEUTRAL" ? null : i;
        }
      });
    setBucket(wouldIds, "WOULD");
    setBucket(wouldntIds, "WOULDNT");
    setBucket(neutralIds, "NEUTRAL");
    return [...byId.values()];
  });
}

// Drag-and-drop should feel instant, not gated on a network round-trip —
// only discrete "commit" actions (Confirm/Continue buttons, via
// runRoomAction's busy-gating) are meant to wait on the server. Patching
// the store is synchronous, so it's already applied by the time this
// function's first `await` is reached — callers rely on that to unfreeze
// their frozen render right after *calling* this (not after it resolves).
// The actual write happens in the background; refresh() + a second patch
// afterward reconcile in case that read was stale (see patchJudgingSlots'
// comment) or the write itself failed differently than expected.
export async function applyBucketsAction(wouldIds, wouldntIds, neutralIds) {
  patchJudgingSlots(wouldIds, wouldntIds, neutralIds);
  await engine.applyBuckets(wouldIds, wouldntIds, neutralIds);
  await refresh();
  patchJudgingSlots(wouldIds, wouldntIds, neutralIds);
}

// Step 1 -> step 2: lock in the Would/Wouldn't split.
export function confirmSplitAction() {
  return runRoomAction(async () => {
    const slots = get(judgingSlots);
    const wouldCount = slots.filter((s) => s.bucket === "WOULD").length;
    // With only one card in "Would do" there's nothing to rank — it's the
    // winner by default. Skip straight to scoring instead of showing a
    // ranking screen with a single, unmovable card on it.
    if (wouldCount === 1) {
      await engine.confirmJudging(get(room), get(round), get(submissions), slots, get(players));
    } else {
      await engine.confirmSplit(get(round), slots);
    }
  });
}

// Same "patch immediately + reapply after refresh" pattern as
// patchJudgingSlots above, for step 2's easiest-to-hardest reordering
// (positions only — bucket never changes in this step).
function patchJudgingOrder(orderedIds) {
  judgingSlots.update((slots) => {
    const byId = new Map(slots.map((s) => [String(s.id), { ...s }]));
    orderedIds.forEach((id, i) => {
      const s = byId.get(String(id));
      if (s) s.position = i;
    });
    return [...byId.values()];
  });
}

// Same "optimistic first, reconcile after" shape as applyBucketsAction —
// see its comment.
export async function applyOrderAction(orderedIds) {
  patchJudgingOrder(orderedIds);
  await engine.applyOrder(orderedIds);
  await refresh();
  patchJudgingOrder(orderedIds);
}

export function confirmJudgingAction() {
  return runRoomAction(() => engine.confirmJudging(get(room), get(round), get(submissions), get(judgingSlots), get(players)));
}

export function nextRoundAction() {
  return runRoomAction(() => engine.nextRound(get(room), get(round), get(players)));
}
