// Framework-free game/state logic for "Where's the Line".
// No DOM access here — this module is the reusable core described in
// docs/SPEC.md section 8, so it can eventually be reused by a multiplayer
// (server-authoritative) version without rewriting the rules.

/**
 * @typedef {Object} Player
 * @property {string} id
 * @property {string} name
 * @property {number} score
 * @property {string[]} hand - Action card strings currently held.
 */

/**
 * @typedef {Object} Submission
 * @property {string} playerId
 * @property {string} card
 */

export const PHASES = {
  ROUND_INTRO: "ROUND_INTRO", // showing "pass to judge" + condition card
  SUBMITTING: "SUBMITTING", // cycling through non-judge players collecting a card each
  JUDGING: "JUDGING", // judge reviewing shuffled/anonymized submissions
  REVEAL: "REVEAL", // showing who played what + who scored
  GAME_OVER: "GAME_OVER",
};

/**
 * A round's goal decides which side(s) of the line actually score:
 * - MOST: only the card just above the line scores.
 * - LEAST: only the card just below the line scores.
 * - BETWEEN: both cards touching the line score (the original two-point
 *   rule). Only offered when there are enough submitters (3+, i.e. 4+
 *   players) for "the line" to be a meaningful middle rather than just the
 *   only two cards on the table.
 */
export const ROUND_GOALS = {
  MOST: "MOST",
  LEAST: "LEAST",
  BETWEEN: "BETWEEN",
};

function pickRoundGoal(submitterCount) {
  const options = [ROUND_GOALS.MOST, ROUND_GOALS.LEAST];
  if (submitterCount >= 3) options.push(ROUND_GOALS.BETWEEN);
  return options[Math.floor(Math.random() * options.length)];
}

function shuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** A drawable, reshuffling deck of strings. */
class Deck {
  constructor(cards) {
    this.drawPile = shuffle(cards);
    this.discardPile = [];
  }

  draw() {
    if (this.drawPile.length === 0) {
      if (this.discardPile.length === 0) {
        throw new Error("Deck is empty and has nothing to reshuffle.");
      }
      this.drawPile = shuffle(this.discardPile);
      this.discardPile = [];
    }
    return this.drawPile.pop();
  }

  discard(card) {
    this.discardPile.push(card);
  }
}

export class Game {
  /**
   * @param {Object} opts
   * @param {string[]} opts.playerNames
   * @param {string[]} opts.conditions
   * @param {string[]} opts.actions
   * @param {number} [opts.targetScore]
   * @param {number} [opts.handSize]
   */
  constructor({ playerNames, conditions, actions, targetScore = 7, handSize = 7 }) {
    if (playerNames.length < 3) {
      throw new Error("Where's the Line requires at least 3 players.");
    }
    this.targetScore = targetScore;
    this.handSize = handSize;

    this.conditionDeck = new Deck(conditions);
    this.actionDeck = new Deck(actions);

    this.players = playerNames.map((name, i) => ({
      id: `p${i}-${name}`,
      name,
      score: 0,
      hand: [],
    }));
    for (const player of this.players) {
      this.dealUpToHandSize(player);
    }

    this.judgeIndex = 0;
    this.phase = PHASES.ROUND_INTRO;
    this.condition = this.conditionDeck.draw();

    /** @type {Submission[]} */
    this.submissions = [];
    /** index into non-judge submission order, for pass-and-play turn taking */
    this.submitOrder = this.nonJudgePlayers().map((p) => p.id);
    this.submitCursor = 0;
    this.roundGoal = pickRoundGoal(this.submitOrder.length);

    /**
     * Ordering the judge is building during JUDGING: playerIds sorted from
     * "most likely to do" (index 0) to "least likely to do" (last index).
     * Anonymized — the judge only sees card text, not names, while sorting.
     */
    this.orderedIds = [];
    /**
     * Index of the dividing line within orderedIds: cards at indices
     * [0, linePosition) are on the "would do" side, cards at
     * [linePosition, length) are on the "wouldn't do" side. Can sit at
     * either end (0 or orderedIds.length) when the judge decides every card
     * — or none of them — clears their line.
     */
    this.linePosition = 0;
    this.winners = [];
  }

  dealUpToHandSize(player) {
    while (player.hand.length < this.handSize) {
      player.hand.push(this.actionDeck.draw());
    }
  }

  get judge() {
    return this.players[this.judgeIndex];
  }

  nonJudgePlayers() {
    return this.players.filter((_, i) => i !== this.judgeIndex);
  }

  currentSubmitter() {
    if (this.phase !== PHASES.SUBMITTING) return null;
    const id = this.submitOrder[this.submitCursor];
    return this.players.find((p) => p.id === id) || null;
  }

  startSubmissions() {
    if (this.phase !== PHASES.ROUND_INTRO) return;
    this.phase = PHASES.SUBMITTING;
  }

  /**
   * Current submitter plays one card from their hand (by exact string match,
   * removing only the first matching instance).
   */
  submitCard(card) {
    const player = this.currentSubmitter();
    if (!player) throw new Error("No player is currently submitting.");
    const idx = player.hand.indexOf(card);
    if (idx === -1) throw new Error("Card not in current submitter's hand.");
    player.hand.splice(idx, 1);
    this.submissions.push({ playerId: player.id, card });

    this.submitCursor += 1;
    if (this.submitCursor >= this.submitOrder.length) {
      this.beginJudging();
    }
  }

  beginJudging() {
    this.phase = PHASES.JUDGING;
    this.orderedIds = shuffle(this.submissions.map((s) => s.playerId));
    this.linePosition = Math.floor(this.orderedIds.length / 2);
  }

  /** Current judging order as {playerId, card} pairs, most-likely first. */
  orderedSubmissions() {
    return this.orderedIds.map((playerId) => ({
      playerId,
      card: this.submissions.find((s) => s.playerId === playerId).card,
    }));
  }

  /**
   * Set the full judging order and line position in one go — used by the
   * drag-to-sort UI, which resolves both the card order and the line's slot
   * from a single drop. `orderedIds` must be a permutation of this round's
   * submitting playerIds; `linePosition` may sit anywhere from 0 (line
   * above every card — the judge wouldn't do any of them) to
   * `orderedIds.length` (line below every card — they'd do all of them).
   */
  applyOrder(orderedIds, linePosition) {
    if (this.phase !== PHASES.JUDGING) return;
    const expected = new Set(this.submissions.map((s) => s.playerId));
    const isPermutation =
      orderedIds.length === expected.size && orderedIds.every((id) => expected.has(id));
    if (!isPermutation) {
      throw new Error("orderedIds must be a permutation of this round's submissions.");
    }
    this.orderedIds = orderedIds.slice();
    this.linePosition = Math.min(Math.max(linePosition, 0), orderedIds.length);
  }

  /** playerId whose submission is immediately above the line ("the MOST"). */
  get mostPick() {
    return this.orderedIds[this.linePosition - 1] ?? null;
  }

  /** playerId whose submission is immediately below the line ("the LEAST"). */
  get leastPick() {
    return this.orderedIds[this.linePosition] ?? null;
  }

  /** playerIds that would score a point if confirmed right now, given the round's goal. */
  pendingWinners() {
    const recipients = [];
    if (
      (this.roundGoal === ROUND_GOALS.MOST || this.roundGoal === ROUND_GOALS.BETWEEN) &&
      this.mostPick
    ) {
      recipients.push(this.mostPick);
    }
    if (
      (this.roundGoal === ROUND_GOALS.LEAST || this.roundGoal === ROUND_GOALS.BETWEEN) &&
      this.leastPick
    ) {
      recipients.push(this.leastPick);
    }
    return recipients;
  }

  canConfirmJudging() {
    return this.phase === PHASES.JUDGING;
  }

  confirmJudging() {
    if (!this.canConfirmJudging()) {
      throw new Error("Not currently judging.");
    }
    const recipients = this.pendingWinners();
    for (const id of recipients) {
      this.players.find((p) => p.id === id).score += 1;
    }
    this.winners = recipients;

    for (const { card } of this.submissions) {
      this.actionDeck.discard(card);
    }
    this.conditionDeck.discard(this.condition);

    for (const s of this.submissions) {
      const player = this.players.find((p) => p.id === s.playerId);
      this.dealUpToHandSize(player);
    }

    this.phase = PHASES.REVEAL;
  }

  isGameOver() {
    return this.players.some((p) => p.score >= this.targetScore);
  }

  standings() {
    return this.players.slice().sort((a, b) => b.score - a.score);
  }

  /** Advance to the next round, or to GAME_OVER if the target score was hit. */
  nextRound() {
    if (this.phase !== PHASES.REVEAL) return;

    if (this.isGameOver()) {
      const top = Math.max(...this.players.map((p) => p.score));
      this.winners = this.players.filter((p) => p.score >= top).map((p) => p.id);
      this.phase = PHASES.GAME_OVER;
      return;
    }

    this.judgeIndex = (this.judgeIndex + 1) % this.players.length;
    this.condition = this.conditionDeck.draw();
    this.submissions = [];
    this.orderedIds = [];
    this.linePosition = 0;
    this.submitOrder = this.nonJudgePlayers().map((p) => p.id);
    this.submitCursor = 0;
    this.roundGoal = pickRoundGoal(this.submitOrder.length);
    this.phase = PHASES.ROUND_INTRO;
  }
}
