// Networked (host + room-code) UI. Mounted by main.js at "/", separate from
// the single-device pass-and-play app at "/pass-and-play/" (src/js/app.js).
//
// Each player's own device drives the transitions for their own role — see
// the comment at the top of host-engine.js for why that's a deliberate
// deviation from "only the host device writes."

import { api } from "./api.js";
import { saveSession, loadSession, clearSession, randomToken, randomRoomCode } from "./session.js";
import * as engine from "./host-engine.js";

let root = null;
let onExit = null;
let pollHandle = null;
// Per-round dedup guards for the self-heal checks in refresh() — see there.
let healedSubmissionRounds = new Set();
let healedHandRounds = new Set();

let state = {
  screen: "host-setup", // host-setup | join | lobby | in-round
  form: { name: "", roomCode: "", targetScore: 7, handSize: 5, error: "" },
  session: null, // {roomId, playerId, sessionToken}
  room: null,
  players: [],
  round: null,
  submissions: [],
  judgingSlots: [],
  myHand: [],
  ui: { revealed: false, busy: false, error: "" },
};

export function mountRoomApp(container, initialScreen, exitCallback) {
  root = container;
  onExit = exitCallback;
  const existing = loadSession();
  state = {
    ...state,
    screen: existing ? "lobby" : initialScreen,
    session: existing,
    form: { name: "", roomCode: "", targetScore: 7, handSize: 5, error: "" },
    room: null,
    players: [],
    round: null,
    submissions: [],
    judgingSlots: [],
    myHand: [],
    ui: { revealed: false, busy: false, error: "" },
  };
  healedSubmissionRounds = new Set();
  healedHandRounds = new Set();
  if (existing) refreshAndRender();
  else render();
  clearInterval(pollHandle);
  pollHandle = setInterval(() => {
    if (state.session) refreshAndRender();
  }, 2000);
}

function unmount() {
  clearInterval(pollHandle);
  pollHandle = null;
}

// ---------- data refresh ----------

async function refreshAndRender() {
  const before = snapshotParts();
  try {
    const hasRoom = await refresh();
    if (!hasRoom) return;
    state.ui.error = "";
  } catch (err) {
    state.ui.error = err.message;
  }
  const after = snapshotParts();
  // Polling happens every two seconds. Replacing the entire DOM when the
  // shared game state is unchanged makes the lobby visibly flash (and can
  // interrupt typing), so only render when the snapshot actually changed.
  const changedKeys = Object.keys(before).filter((k) => before[k] !== after[k]);
  if (changedKeys.length > 0) {
    // Temporary diagnostic: pinpoints exactly which part of state a poll
    // thought had changed, since a full-screen re-render on every 2s poll
    // was reported as constant flickering even after normalizing known
    // type-serialization mismatches. Safe to remove once that's root-caused.
    console.log("[wtl] poll-triggered re-render, changed:", changedKeys, {
      before: Object.fromEntries(changedKeys.map((k) => [k, before[k]])),
      after: Object.fromEntries(changedKeys.map((k) => [k, after[k]])),
    });
    render(false);
  }
}

async function refresh() {
  const { roomId, playerId } = state.session;
  const [room, players] = await Promise.all([api.readOne("rooms", roomId), api.read("players", { room_id: roomId })]);
  if (!room) {
    // A stale localStorage reconnect credential (for example, after a room
    // was deleted or only partially created) must not leave the UI trying to
    // render a null room.
    clearSession();
    state.session = null;
    unmount();
    onExit();
    return false;
  }
  state.room = room;
  state.players = players;

  if (room.status === "IN_PROGRESS" || room.status === "COMPLETE") {
    state.screen = "in-round";
    // sort/order pins this to the single current round deterministically —
    // without it, a backend with no default ordering could hand back a
    // different matching row on each poll, which looked like constant
    // flashing and, worse, briefly showed a stale round's data.
    const [round] = await api.read("rounds", {
      room_id: roomId,
      round_number: room.current_round_number,
      sort: "id",
      order: "desc",
      limit: 1,
    });
    state.round = round;
    if (round) {
      state.submissions = await api.read("submissions", { round_id: round.id });
      if (round.phase === "JUDGING" || round.phase === "REVEAL") {
        state.judgingSlots = await api.read("judging_slots", { round_id: round.id });
      }
      if (round.phase === "SUBMITTING" && !sameId(round.judge_player_id, playerId)) {
        // Self-heal a missing submission row (e.g. the round-start
        // bulk-create silently dropped one record) — without it this
        // player could never actually submit. Guarded to run once per round:
        // it's cheap to check every poll, but only ever needs to *write*
        // once, and re-checking a count-based condition every 2s risks
        // reacting to a momentarily-inconsistent read rather than a real gap
        // (which would otherwise keep dealing extra cards forever).
        let mySub = state.submissions.find((s) => sameId(s.player_id, playerId));
        if (!mySub && !healedSubmissionRounds.has(round.id)) {
          healedSubmissionRounds.add(round.id);
          mySub = await engine.ensureSubmissionRow(round.id, playerId, state.submissions);
          state.submissions = [...state.submissions, mySub];
        }

        state.myHand = await api.read("deck_cards", {
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
        if (state.myHand.length === 0 && mySub && !mySub.submitted_at && !healedHandRounds.has(round.id)) {
          healedHandRounds.add(round.id);
          await engine.dealUpToHandSize(roomId, playerId, room.hand_size);
          state.myHand = await api.read("deck_cards", {
            room_id: roomId,
            deck_type: "ACTION",
            status: "IN_HAND",
            holder_player_id: playerId,
          });
        }
      }
    }
  } else {
    state.screen = "lobby";
  }
  return true;
}

// Row ids come back from two different code paths — api.create()'s response
// body and api.read()'s row payloads — which aren't guaranteed to agree on
// number-vs-string typing. Comparing loosely (as strings) avoids "who am I"
// checks silently failing and misidentifying the current player.
function sameId(a, b) {
  return a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
}

function me() {
  return state.players.find((p) => sameId(p.id, state.session?.playerId)) || null;
}

// ---------- actions ----------

async function createRoom() {
  const name = state.form.name.trim();
  if (!name) return setFormError("Enter your name.");
  state.ui.busy = true;
  render();
  try {
    const roomId = await api.create("rooms", {
      room_code: randomRoomCode(),
      status: "LOBBY",
      target_score: Number(state.form.targetScore) || 7,
      hand_size: Number(state.form.handSize) || 5,
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
    state.session = { roomId, playerId, sessionToken: token };
    saveSession(state.session);
    await refresh();
  } catch (err) {
    state.ui.busy = false;
    return setFormError(err.message);
  }
  state.ui.busy = false;
  render();
}

async function joinRoom() {
  const name = state.form.name.trim();
  const code = state.form.roomCode.trim().toUpperCase();
  if (!name) return setFormError("Enter your name.");
  if (!code) return setFormError("Enter a room code.");
  state.ui.busy = true;
  render();
  try {
    const [room] = await api.read("rooms", { room_code: code, limit: 1 });
    if (!room) return fail("No room found with that code.");
    if (room.status !== "LOBBY") return fail("That game has already started.");
    const players = await api.read("players", { room_id: room.id });
    if (players.length >= 8) return fail("That room is full.");
    if (players.some((p) => p.display_name.toLowerCase() === name.toLowerCase())) {
      return fail("Someone already has that name in this room.");
    }
    const token = randomToken();
    const playerId = await api.create("players", {
      room_id: room.id,
      display_name: name,
      join_order: players.length,
      session_token: token,
      is_host: false,
      score: 0,
    });
    state.session = { roomId: room.id, playerId, sessionToken: token };
    saveSession(state.session);
    await refresh();
  } catch (err) {
    return fail(err.message);
  } finally {
    state.ui.busy = false;
    render();
  }

  function fail(msg) {
    state.ui.busy = false;
    setFormError(msg);
  }
}

function setFormError(msg) {
  state.form.error = msg;
  render();
}

function leaveRoom() {
  clearSession();
  unmount();
  onExit();
}

// `optimisticPatch(result)`, when given, is applied to local state right
// after a successful write and again after the follow-up refresh() — the
// second application matters because refresh()'s read isn't guaranteed to
// reflect the write we just made (no read-after-write guarantee from the
// backend), which otherwise let a stale read silently overwrite what we
// already know just happened (e.g. submitting a card not immediately
// showing as submitted).
async function runRoomAction(action, { optimisticPatch } = {}) {
  if (state.ui.busy) return;
  state.ui.busy = true;
  state.ui.error = "";
  render();
  try {
    const result = await action();
    if (optimisticPatch) optimisticPatch(result);
    await refresh();
    if (optimisticPatch) optimisticPatch(result);
  } catch (err) {
    state.ui.error = err.message;
  } finally {
    state.ui.busy = false;
    render();
  }
}

// ---------- render ----------

function render(animate = true) {
  root.innerHTML = "";
  let view;
  switch (state.screen) {
    case "host-setup":
      view = renderHostSetup();
      break;
    case "join":
      view = renderJoin();
      break;
    case "lobby":
      view = renderLobby();
      break;
    case "in-round":
      view = renderRound();
      break;
    default:
      view = el("div", { text: "Unknown screen." });
  }
  if (!animate && view.classList.contains("screen")) view.classList.add("no-animation");
  root.appendChild(view);
}

// Backend reads/writes aren't guaranteed to agree on scalar typing for a
// given field (e.g. an id or position coming back as "3" on one poll and 3
// on the next, or a null-valued column being omitted from the JSON one time
// and present-as-null the next) — differences that are meaningless to the
// UI but would still make two JSON.stringify snapshots compare unequal,
// forcing an unnecessary full re-render. Normalize before comparing.
function normalizeField(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

// Keyed per top-level piece of state (rather than one big string) so a
// changed poll can report *which* piece changed instead of just that
// something did.
function snapshotParts() {
  const pick = (row, fields) =>
    row ? fields.reduce((out, field) => ({ ...out, [field]: normalizeField(row[field]) }), {}) : null;
  const sorted = (rows, fields) =>
    rows
      .map((row) => pick(row, fields))
      .sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));

  return {
    screen: state.screen,
    room: JSON.stringify(
      pick(state.room, ["id", "room_code", "status", "target_score", "hand_size", "current_round_number", "current_phase"])
    ),
    players: JSON.stringify(sorted(state.players, ["id", "display_name", "join_order", "is_host", "score"])),
    round: JSON.stringify(pick(state.round, ["id", "round_number", "phase", "judge_player_id", "condition_card_text", "round_goal"])),
    submissions: JSON.stringify(sorted(state.submissions, ["id", "player_id", "card_text", "submitted_at", "round_score_delta"])),
    judgingSlots: JSON.stringify(sorted(state.judgingSlots, ["id", "submission_id", "bucket", "position"])),
    myHand: JSON.stringify(sorted(state.myHand, ["id", "card_text"])),
    error: state.ui.error,
  };
}

function renderHostSetup() {
  const screen = el("div", { class: "screen" });
  screen.appendChild(brand());
  screen.appendChild(el("h2", { text: "Host a room" }));
  screen.appendChild(nameField());
  const grid = el("div", { class: "settings-grid" });
  grid.appendChild(
    el("div", {}, [
      el("label", { text: "Points to win" }),
      el("input", {
        type: "number",
        min: "3",
        max: "15",
        value: String(state.form.targetScore),
        oninput: (e) => (state.form.targetScore = e.target.value),
      }),
    ])
  );
  grid.appendChild(
    el("div", {}, [
      el("label", { text: "Hand size" }),
      el("input", {
        type: "number",
        min: "5",
        max: "10",
        value: String(state.form.handSize),
        oninput: (e) => (state.form.handSize = e.target.value),
      }),
    ])
  );
  screen.appendChild(grid);
  screen.appendChild(el("div", { class: "error-text", text: state.form.error }));
  screen.appendChild(
    el("div", { class: "btn-row" }, [
      el("button", {
        class: "btn-primary",
        text: state.ui.busy ? "Creating…" : "Create room",
        disabled: state.ui.busy,
        onclick: createRoom,
      }),
      el("button", { class: "btn-secondary", text: "Back", onclick: () => onExit() }),
    ])
  );
  return screen;
}

function renderJoin() {
  const screen = el("div", { class: "screen" });
  screen.appendChild(brand());
  screen.appendChild(el("h2", { text: "Join a room" }));
  screen.appendChild(nameField());
  screen.appendChild(
    el("div", {}, [
      el("label", { text: "Room code" }),
      el("input", {
        type: "text",
        maxlength: "5",
        style: "text-transform:uppercase;",
        value: state.form.roomCode,
        oninput: (e) => (state.form.roomCode = e.target.value),
      }),
    ])
  );
  screen.appendChild(el("div", { class: "error-text", text: state.form.error }));
  screen.appendChild(
    el("div", { class: "btn-row" }, [
      el("button", {
        class: "btn-primary",
        text: state.ui.busy ? "Joining…" : "Join room",
        disabled: state.ui.busy,
        onclick: joinRoom,
      }),
      el("button", { class: "btn-secondary", text: "Back", onclick: () => onExit() }),
    ])
  );
  return screen;
}

function nameField() {
  return el("div", {}, [
    el("label", { text: "Your name" }),
    el("input", {
      type: "text",
      maxlength: "24",
      value: state.form.name,
      oninput: (e) => (state.form.name = e.target.value),
    }),
  ]);
}

function renderLobby() {
  const screen = el("div", { class: "screen" });
  screen.appendChild(brand());
  screen.appendChild(el("h2", { text: `Room code: ${state.room.room_code}` }));
  screen.appendChild(el("p", { class: "subtitle", text: "Share this code — everyone joins from their own device." }));

  const list = el("div", { class: "player-list" });
  state.players
    .slice()
    .sort((a, b) => a.join_order - b.join_order)
    .forEach((p) => {
      list.appendChild(
        el("div", { class: "player-row" }, [
          el("span", { text: p.display_name + (p.is_host ? " (host)" : "") }),
        ])
      );
    });
  screen.appendChild(list);

  const iAmHost = me()?.is_host;
  if (iAmHost) {
    const canStart = state.players.length >= 3;
    screen.appendChild(
      el("button", {
        class: "btn-primary",
        text: state.ui.busy ? "Starting…" : "Start game",
        disabled: !canStart || state.ui.busy,
        onclick: async () => {
          state.ui.busy = true;
          render();
          try {
            await engine.startGame(state.room, state.players);
            await refresh();
          } catch (err) {
            state.ui.error = err.message;
          }
          state.ui.busy = false;
          render();
        },
      })
    );
    if (!canStart) screen.appendChild(el("p", { class: "subtitle", text: "Need at least 3 players to start." }));
  } else {
    screen.appendChild(el("p", { class: "subtitle", text: "Waiting for the host to start…" }));
  }

  screen.appendChild(el("div", { class: "error-text", text: state.ui.error }));
  screen.appendChild(el("button", { class: "btn-secondary", text: "Leave room", onclick: leaveRoom }));
  return screen;
}

function renderRound() {
  const round = state.round;
  if (!round) return roundView(el("div", { class: "screen", text: "Setting up the round…" }));
  if (round.phase === "GAME_OVER" || state.room.status === "COMPLETE") return renderGameOver();

  let view;
  switch (round.phase) {
    case "SUBMITTING":
      view = renderSubmitting();
      break;
    case "JUDGING":
      view = renderJudging();
      break;
    case "REVEAL":
      view = renderReveal();
      break;
    default:
      view = el("div", { class: "screen", text: "Unknown phase." });
  }
  return roundView(view);
}

function roundView(view) {
  if (view.classList?.contains("screen")) view.prepend(gameMenu());
  return view;
}

function gameMenu() {
  return el("details", { class: "game-menu" }, [
    el("summary", { text: "Menu" }),
    el("button", {
      class: "menu-leave",
      type: "button",
      text: "Leave game",
      onclick: () => {
        if (window.confirm("Leave this game on this device? The room will remain available to the other players.")) {
          leaveRoom();
        }
      },
    }),
  ]);
}

function judgeName() {
  return state.players.find((p) => sameId(p.id, state.round.judge_player_id))?.display_name ?? "?";
}

function goalHeadline(goal, judgeName) {
  if (goal === "LEAST") return `Goal: Submit an action that ${judgeName} WOULD NOT do`;
  if (goal === "BETWEEN") return `Goal: Submit an action that ${judgeName} WOULD do, or WOULD NOT do`;
  return `Goal: Submit an action that ${judgeName} WOULD do`;
}

function renderSubmitting() {
  const screen = el("div", { class: "screen" });
  screen.appendChild(scoreStrip());
  screen.appendChild(el("h2", { text: `Judge: ${judgeName()}` }));
  screen.appendChild(el("div", { class: "card condition" }, [document.createTextNode(state.round.condition_card_text)]));
  screen.appendChild(
    el("div", { class: "criteria-callout" }, [el("p", { class: "criteria-main", text: goalHeadline(state.round.round_goal, judgeName()) })])
  );

  if (sameId(me()?.id, state.round.judge_player_id)) {
    screen.appendChild(el("p", { class: "subtitle", text: "You're judging this round — sit tight while everyone else submits." }));
    return screen;
  }

  const mySubmission = state.submissions.find((s) => sameId(s.player_id, me()?.id));
  if (mySubmission?.submitted_at) {
    screen.appendChild(el("p", { class: "subtitle", text: "Card submitted! Waiting on the others…" }));
    return screen;
  }

  screen.appendChild(el("h3", { text: "Your hand" }));
  const grid = el("div", { class: "hand-grid" });
  state.myHand.forEach((row) => {
    grid.appendChild(
      el("div", {
        class: "card action",
        text: row.card_text,
        onclick: async () => {
          if (!mySubmission) return;
          const submissionId = mySubmission.id;
          const card = row.card_text;
          await runRoomAction(() => engine.submitCard(state.room, state.round.id, submissionId, me().id, card), {
            optimisticPatch: (submittedAt) => {
              state.submissions = state.submissions.map((s) =>
                sameId(s.id, submissionId) ? { ...s, card_text: card, submitted_at: s.submitted_at || submittedAt } : s
              );
            },
          });
        },
      })
    );
  });
  screen.appendChild(grid);
  screen.appendChild(el("div", { class: "error-text", text: state.ui.error }));
  return screen;
}

function renderJudging() {
  const screen = el("div", { class: "screen" });
  screen.appendChild(el("div", { class: "card condition" }, [document.createTextNode(state.round.condition_card_text)]));

  if (!sameId(me()?.id, state.round.judge_player_id)) {
    screen.appendChild(el("p", { class: "subtitle", text: `${judgeName()} is deciding where the line is…` }));
    return screen;
  }

  screen.appendChild(el("h2", { text: "Where's the line?" }));
  screen.appendChild(
    el("p", { class: "subtitle", text: "Drag every card out of the middle pile into a bucket, ordering by how extreme it is." })
  );

  const cardText = (submissionId) => state.submissions.find((s) => sameId(s.id, submissionId))?.card_text ?? "";
  const slotsFor = (bucket) =>
    state.judgingSlots.filter((s) => s.bucket === bucket).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const wouldCards = el("div", { class: "bucket-cards" });
  const neutralCards = el("div", { class: "bucket-cards" });
  const wouldntCards = el("div", { class: "bucket-cards" });
  slotsFor("WOULD").forEach((s) => wouldCards.appendChild(judgeRow(s.id, cardText(s.submission_id))));
  slotsFor("NEUTRAL").forEach((s) => neutralCards.appendChild(judgeRow(s.id, cardText(s.submission_id))));
  slotsFor("WOULDNT").forEach((s) => wouldntCards.appendChild(judgeRow(s.id, cardText(s.submission_id))));

  const container = el("div", { class: "judge-order" }, [
    el("div", { class: "bucket would-bucket" }, [el("div", { class: "bucket-header would-header", text: "✅ Would do" }), wouldCards]),
    el("div", { class: "bucket neutral-bucket" }, [el("div", { class: "bucket-header neutral-header", text: "🤔 Not sorted yet" }), neutralCards]),
    el("div", { class: "bucket wouldnt-bucket" }, [el("div", { class: "bucket-header wouldnt-header", text: "🚫 Wouldn't do" }), wouldntCards]),
  ]);
  screen.appendChild(container);

  initBucketDragSort([wouldCards, neutralCards, wouldntCards], async (wouldIds, neutralIds, wouldntIds) => {
    await engine.applyBuckets(wouldIds, wouldntIds, neutralIds);
    await refreshAndRender();
  });

  const neutralCount = slotsFor("NEUTRAL").length;
  screen.appendChild(
    el("button", {
      class: "btn-primary",
      text: "Confirm",
      disabled: neutralCount > 0 || state.ui.busy,
      onclick: async () => {
        await runRoomAction(() => engine.confirmJudging(state.room, state.round, state.submissions, state.judgingSlots, state.players));
      },
    })
  );
  return screen;
}

function judgeRow(slotId, card) {
  return el("div", { class: "order-row card-row", "data-sort-key": `slot:${slotId}` }, [
    el("span", { class: "drag-handle", "aria-hidden": "true", text: "⠿" }),
    el("div", { class: "card action order-card", text: card }),
  ]);
}

function initBucketDragSort(containers, onDrop) {
  const wrapper = containers[0].closest(".judge-order");
  wrapper.addEventListener("pointerdown", (e) => {
    const row = e.target.closest("[data-sort-key]");
    if (row) startDrag(row);
  });

  function startDrag(row) {
    const rowRect = row.getBoundingClientRect();
    const placeholder = document.createElement("div");
    placeholder.className = "sort-placeholder";
    placeholder.style.height = `${rowRect.height}px`;
    row.replaceWith(placeholder);
    row.classList.add("dragging");
    row.style.position = "fixed";
    row.style.top = `${rowRect.top}px`;
    row.style.left = `${rowRect.left}px`;
    row.style.width = `${rowRect.width}px`;
    document.body.appendChild(row);

    const onMove = (e) => {
      row.style.top = `${e.clientY - rowRect.height / 2}px`;
      const dragCenter = e.clientY;
      let targetContainer = containers[0];
      let bestDist = Infinity;
      for (const c of containers) {
        const r = c.getBoundingClientRect();
        const dist = dragCenter < r.top ? r.top - dragCenter : dragCenter > r.bottom ? dragCenter - r.bottom : 0;
        if (dist < bestDist) {
          bestDist = dist;
          targetContainer = c;
        }
      }
      const rows = Array.from(targetContainer.querySelectorAll("[data-sort-key]"));
      let targetIndex = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (dragCenter < r.top + r.height / 2) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex >= rows.length) targetContainer.appendChild(placeholder);
      else targetContainer.insertBefore(placeholder, rows[targetIndex]);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      placeholder.replaceWith(row);
      row.classList.remove("dragging");
      row.style.position = "";
      row.style.top = "";
      row.style.left = "";
      row.style.width = "";
      const idsFrom = (container) =>
        Array.from(container.querySelectorAll("[data-sort-key]")).map((el) => Number(el.getAttribute("data-sort-key").slice("slot:".length)));
      onDrop(...containers.map(idsFrom));
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }
}

function renderReveal() {
  const screen = el("div", { class: "screen" });
  screen.appendChild(el("h2", { text: "Results" }));
  screen.appendChild(el("p", { class: "subtitle", text: `Judged by ${judgeName()} — for: "${state.round.condition_card_text}"` }));

  const list = el("div", { class: "submission-list" });
  for (const s of state.submissions) {
    const player = state.players.find((p) => sameId(p.id, s.player_id));
    const scored = (s.round_score_delta || 0) > 0;
    const row = el("div", { class: `reveal-row${scored ? " winner" : ""}` });
    row.appendChild(el("span", { class: "player-name", text: player?.display_name ?? "?" }));
    row.appendChild(document.createTextNode(s.card_text || ""));
    if (scored) row.appendChild(el("span", { class: "pick-tag most", text: "+1" }));
    list.appendChild(row);
  }
  screen.appendChild(list);

  screen.appendChild(el("h3", { text: "Scoreboard" }));
  screen.appendChild(scoreboard());

  if (me()?.is_host) {
    screen.appendChild(
      el("button", {
        class: "btn-primary",
        text: "Next round",
        disabled: state.ui.busy,
        onclick: async () => {
          await runRoomAction(() => engine.nextRound(state.room, state.round, state.players));
        },
      })
    );
  } else {
    screen.appendChild(el("p", { class: "subtitle", text: "Waiting for the host to continue…" }));
  }
  return screen;
}

function renderGameOver() {
  const screen = el("div", { class: "screen" });
  screen.appendChild(brand());
  const standings = state.players.slice().sort((a, b) => b.score - a.score);
  const top = standings[0]?.score ?? 0;
  const winners = standings.filter((p) => p.score >= top);
  screen.appendChild(
    el("h2", {
      text: winners.length > 1 ? `It's a tie! ${winners.map((w) => w.display_name).join(" & ")} win!` : `${winners[0].display_name} wins!`,
    })
  );
  screen.appendChild(el("h3", { text: "Final standings" }));
  screen.appendChild(scoreboard(standings));
  screen.appendChild(el("button", { class: "btn-secondary", text: "Leave room", onclick: leaveRoom }));
  return screen;
}

// ---------- shared bits ----------

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

function brand() {
  return el("div", { class: "brand" }, [
    el("h1", {}, [document.createTextNode("Where's "), el("span", { class: "accent", text: "the Line" })]),
    el("p", { text: "Multiplayer — everyone plays from their own device." }),
  ]);
}

function scoreStrip() {
  const strip = el("div", { class: "btn-row", style: "font-size:0.8rem;color:var(--text-muted);" });
  strip.textContent = state.players.map((p) => `${p.display_name}: ${p.score}`).join("  ·  ");
  return strip;
}

function scoreboard(list) {
  const board = el("div", { class: "scoreboard" });
  const sorted = list || state.players.slice().sort((a, b) => b.score - a.score);
  sorted.forEach((p, i) => {
    board.appendChild(
      el("div", { class: "score-row" }, [
        el("span", {}, [el("span", { class: "rank", text: `${i + 1}.` }), document.createTextNode(p.display_name)]),
        el("span", { class: "points", text: String(p.score) }),
      ])
    );
  });
  return board;
}
