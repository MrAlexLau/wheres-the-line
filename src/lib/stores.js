// Reactive state for the multiplayer client. This replaces the old
// room-app.js's single mutable `state` object plus its hand-rolled
// stateSnapshot()/diff-gate — see SVELTE_SPEC.md §5. Svelte's compiled
// reactivity means components subscribing to a store only re-render the
// specific DOM tied to a value that actually changed; poll updates can just
// `.set()` unconditionally.

import { writable, derived } from "svelte/store";
import { sameId } from "./ids.js";

export const screen = writable("host-setup"); // host-setup | join | lobby | in-round
export const form = writable({ name: "", roomCode: "", targetScore: 7, handSize: 5, error: "" });

export const session = writable(null); // {roomId, playerId, sessionToken}
export const room = writable(null);
export const players = writable([]);
export const round = writable(null);
export const submissions = writable([]);
export const judgingSlots = writable([]);
export const myHand = writable([]);

export const uiBusy = writable(false);
export const uiError = writable("");

export const me = derived([players, session], ([$players, $session]) => $players.find((p) => sameId(p.id, $session?.playerId)) ?? null);

export const judgeName = derived(
  [players, round],
  ([$players, $round]) => $players.find((p) => sameId(p.id, $round?.judge_player_id))?.display_name ?? "?"
);

export const isJudge = derived([me, round], ([$me, $round]) => sameId($me?.id, $round?.judge_player_id));

export function resetRoomState() {
  form.set({ name: "", roomCode: "", targetScore: 7, handSize: 5, error: "" });
  room.set(null);
  players.set([]);
  round.set(null);
  submissions.set([]);
  judgingSlots.set([]);
  myHand.set([]);
  uiBusy.set(false);
  uiError.set("");
}
