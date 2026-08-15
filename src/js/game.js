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

    /** shuffled, anonymized view built when entering JUDGING */
    this.shuffledSubmissions = [];
    this.mostPick = null; // playerId
    this.leastPick = null; // playerId
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
    this.shuffledSubmissions = shuffle(this.submissions);
    this.mostPick = null;
    this.leastPick = null;
  }

  /** playerId whose submission is currently marked as "the MOST". */
  pickMost(playerId) {
    if (this.phase !== PHASES.JUDGING) return;
    if (playerId === this.leastPick) return; // can't be both
    this.mostPick = playerId;
  }

  pickLeast(playerId) {
    if (this.phase !== PHASES.JUDGING) return;
    if (playerId === this.mostPick) return;
    this.leastPick = playerId;
  }

  canConfirmJudging() {
    return (
      this.phase === PHASES.JUDGING &&
      this.mostPick !== null &&
      this.leastPick !== null &&
      this.mostPick !== this.leastPick
    );
  }

  confirmJudging() {
    if (!this.canConfirmJudging()) {
      throw new Error("Both a MOST and a LEAST pick (two different players) are required.");
    }
    const mostPlayer = this.players.find((p) => p.id === this.mostPick);
    const leastPlayer = this.players.find((p) => p.id === this.leastPick);
    mostPlayer.score += 1;
    leastPlayer.score += 1;
    this.winners = [mostPlayer.id, leastPlayer.id];

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
    this.shuffledSubmissions = [];
    this.mostPick = null;
    this.leastPick = null;
    this.submitOrder = this.nonJudgePlayers().map((p) => p.id);
    this.submitCursor = 0;
    this.phase = PHASES.ROUND_INTRO;
  }
}
