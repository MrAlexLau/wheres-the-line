import { Game, PHASES, ROUND_GOALS } from "./game.js";
import { CONDITIONS, ACTIONS } from "../data/cards.js";

const GOAL_INFO = {
  [ROUND_GOALS.MOST]: {
    title: "Goal: Find the MOST",
    detail: "Only the single card the judge would most do scores a point.",
  },
  [ROUND_GOALS.LEAST]: {
    title: "Goal: Find the LEAST",
    detail: "Only the single card the judge would least do scores a point.",
  },
  [ROUND_GOALS.BETWEEN]: {
    title: "Goal: Draw the line",
    detail: "Both the card just above and just below the line score a point.",
  },
};

const root = document.getElementById("app");

/** @type {Game|null} */
let game = null;

/** Setup-screen draft state, kept until a game is created. */
function defaultPlayerNames(count) {
  return Array.from({ length: count }, (_, i) => `Player ${i + 1}`);
}

let setup = {
  players: defaultPlayerNames(3),
  targetScore: 7,
  handSize: 7,
  error: "",
};

/** Local UI-only state that doesn't belong in Game (pass-and-play interstitials). */
let ui = {
  revealed: false, // has the current player tapped through the "pass device" screen?
};

function resetReveal() {
  ui.revealed = false;
}

function render() {
  root.innerHTML = "";
  if (!game) {
    root.appendChild(renderSetup());
  } else {
    root.appendChild(renderGame());
  }
}

// ---------- helpers ----------

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2), value);
    } else if (value !== false && value !== null && value !== undefined) {
      node.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children)) {
    if (child) node.appendChild(child);
  }
  return node;
}

function brand() {
  return el("div", { class: "brand" }, [
    el("h1", {}, [
      document.createTextNode("Where's "),
      el("span", { class: "accent", text: "the Line" }),
    ]),
    el("p", { text: "A pass-and-play party game about knowing your friends." }),
  ]);
}

// ---------- setup screen ----------

function renderSetup() {
  const screen = el("div", { class: "screen" });
  screen.appendChild(brand());

  screen.appendChild(el("h2", { text: "Set up your game" }));
  screen.appendChild(
    el("p", { class: "subtitle", text: "Add 3–8 players, then start. Judge order follows this list." })
  );

  const list = el("div", { class: "player-list" });
  setup.players.forEach((name, i) => {
    const row = el("div", { class: "player-row" }, [
      el("span", { class: "player-number", text: `${i + 1}.` }),
      el("input", {
        type: "text",
        placeholder: `Player ${i + 1} name`,
        value: name,
        maxlength: "24",
        oninput: (e) => {
          setup.players[i] = e.target.value;
        },
      }),
    ]);
    if (setup.players.length > 3) {
      row.appendChild(
        el("button", {
          class: "btn-danger",
          text: "Remove",
          onclick: () => {
            setup.players.splice(i, 1);
            render();
          },
        })
      );
    }
    list.appendChild(row);
  });
  screen.appendChild(list);

  screen.appendChild(
    el("div", { class: "add-player-row" }, [
      el("button", {
        class: "btn-secondary",
        text: "+ Add player",
        disabled: setup.players.length >= 8,
        onclick: () => {
          if (setup.players.length < 8) {
            setup.players.push(`Player ${setup.players.length + 1}`);
            render();
          }
        },
      }),
    ])
  );

  const settingsGrid = el("div", { class: "settings-grid" });
  settingsGrid.appendChild(
    el("div", {}, [
      el("label", { text: "Points to win" }),
      el("input", {
        type: "number",
        min: "3",
        max: "15",
        value: String(setup.targetScore),
        oninput: (e) => {
          setup.targetScore = Number(e.target.value) || 7;
        },
      }),
    ])
  );
  settingsGrid.appendChild(
    el("div", {}, [
      el("label", { text: "Hand size" }),
      el("input", {
        type: "number",
        min: "5",
        max: "10",
        value: String(setup.handSize),
        oninput: (e) => {
          setup.handSize = Number(e.target.value) || 7;
        },
      }),
    ])
  );
  screen.appendChild(settingsGrid);

  screen.appendChild(el("div", { class: "error-text", text: setup.error }));

  screen.appendChild(
    el("div", { class: "btn-row" }, [
      el("button", {
        class: "btn-primary",
        text: "Start game",
        onclick: () => startGame(),
      }),
    ])
  );

  screen.appendChild(renderRulesBlurb());

  return screen;
}

function renderRulesBlurb() {
  const wrap = el("div", { class: "card", style: "font-weight: 400; font-size: 0.9rem;" });
  wrap.innerHTML = `
    <strong>How to play:</strong> Each round a condition is read (e.g. "win a
    new car"). Everyone but the judge secretly plays an action card
    answering "what would you do for this?" The judge then picks the
    <strong>MOST</strong> extreme thing they'd do, and the
    <strong>LEAST</strong> — the first thing they wouldn't. Both of those
    players score a point. First to the target score wins.
  `;
  return wrap;
}

function startGame() {
  const names = setup.players.map((n) => n.trim()).filter(Boolean);
  const uniqueNames = new Set(names.map((n) => n.toLowerCase()));

  if (names.length < 3) {
    setup.error = "Enter at least 3 player names.";
    render();
    return;
  }
  if (uniqueNames.size !== names.length) {
    setup.error = "Player names must be unique.";
    render();
    return;
  }

  try {
    game = new Game({
      playerNames: names,
      conditions: CONDITIONS,
      actions: ACTIONS,
      targetScore: setup.targetScore,
      handSize: setup.handSize,
    });
  } catch (err) {
    setup.error = err.message;
    render();
    return;
  }

  setup.error = "";
  resetReveal();
  render();
}

// ---------- game screens ----------

function renderGame() {
  switch (game.phase) {
    case PHASES.ROUND_INTRO:
      return ui.revealed ? renderConditionReveal() : renderPassScreen(game.judge.name, "The judge is:", () => {
        ui.revealed = true;
        render();
      });
    case PHASES.SUBMITTING:
      return renderSubmitting();
    case PHASES.JUDGING:
      return ui.revealed ? renderJudging() : renderPassScreen(game.judge.name, "Pass the device back to the judge:", () => {
        ui.revealed = true;
        render();
      });
    case PHASES.REVEAL:
      return renderReveal();
    case PHASES.GAME_OVER:
      return renderGameOver();
    default:
      return el("div", { text: "Unknown phase." });
  }
}

function renderPassScreen(name, label, onReady) {
  const screen = el("div", { class: "screen pass-screen" });
  screen.appendChild(el("div", { class: "icon", text: "📱" }));
  screen.appendChild(el("p", { class: "subtitle", text: label }));
  screen.appendChild(el("h2", { text: name }));
  screen.appendChild(
    el("button", {
      class: "btn-primary",
      text: "I have the device — reveal",
      onclick: onReady,
    })
  );
  return screen;
}

function renderConditionReveal() {
  const screen = el("div", { class: "screen" });
  screen.appendChild(scoreStrip());
  screen.appendChild(el("h2", { text: `Judge: ${game.judge.name}` }));
  screen.appendChild(
    el("p", {
      class: "subtitle",
      text: "Everyone else, get ready to answer: what would you do for this?",
    })
  );
  screen.appendChild(
    el("div", { class: "card condition" }, [
      el("span", { class: "card-kicker", text: "The condition is…" }),
      document.createTextNode(game.condition),
    ])
  );
  screen.appendChild(renderGoalBadge());
  screen.appendChild(
    el("button", {
      class: "btn-primary",
      text: "Start submitting cards",
      onclick: () => {
        game.startSubmissions();
        resetReveal();
        render();
      },
    })
  );
  return screen;
}

function renderSubmitting() {
  const player = game.currentSubmitter();
  if (!ui.revealed) {
    return renderPassScreen(player.name, "Pass the device to:", () => {
      ui.revealed = true;
      render();
    });
  }

  const screen = el("div", { class: "screen" });
  screen.appendChild(
    el("p", { class: "subtitle", text: `${player.name}, pick your card for:` })
  );
  screen.appendChild(el("div", { class: "card condition" }, [document.createTextNode(game.condition)]));
  screen.appendChild(el("h3", { text: "Your hand" }));

  const grid = el("div", { class: "hand-grid" });
  player.hand.forEach((card) => {
    grid.appendChild(
      el("div", {
        class: "card action",
        text: card,
        onclick: () => {
          game.submitCard(card);
          resetReveal();
          render();
        },
      })
    );
  });
  screen.appendChild(grid);
  return screen;
}

function renderGoalBadge() {
  const info = GOAL_INFO[game.roundGoal];
  return el("div", { class: "goal-badge" }, [
    el("span", { class: "goal-title", text: info.title }),
    el("span", { class: "goal-detail", text: info.detail }),
  ]);
}

function renderJudging() {
  const screen = el("div", { class: "screen" });
  screen.appendChild(el("h2", { text: `${game.judge.name}, where's the line?` }));
  screen.appendChild(renderGoalBadge());
  screen.appendChild(
    el("div", { class: "card condition" }, [
      el("span", { class: "card-kicker", text: "Condition" }),
      document.createTextNode(game.condition),
    ])
  );
  screen.appendChild(
    el("p", {
      class: "subtitle",
      text: "Drag to sort from most likely to least likely you'd actually do it, and drag the line to where you'd draw it — even above or below every card.",
    })
  );

  const ordered = game.orderedSubmissions();
  const container = el("div", { class: "judge-order" });

  ordered.forEach(({ playerId, card }, index) => {
    if (index === game.linePosition) {
      container.appendChild(renderJudgeLineRow());
    }
    container.appendChild(renderJudgeCardRow(playerId, card));
  });
  if (game.linePosition === ordered.length) {
    container.appendChild(renderJudgeLineRow());
  }

  screen.appendChild(container);
  initDragSort(container, (orderedIds, linePosition) => {
    game.applyOrder(orderedIds, linePosition);
    render();
  });

  const pending = game.pendingWinners().map((id) => game.players.find((p) => p.id === id).name);
  screen.appendChild(
    el("p", {
      class: "subtitle",
      text: pending.length > 0 ? `Would score right now: ${pending.join(", ")}` : "No one would score right now.",
    })
  );

  screen.appendChild(
    el("button", {
      class: "btn-primary",
      text: "Confirm the line",
      disabled: !game.canConfirmJudging(),
      onclick: () => {
        game.confirmJudging();
        render();
      },
    })
  );
  return screen;
}

function renderJudgeCardRow(playerId, card) {
  return el("div", { class: "order-row card-row", "data-sort-key": `card:${playerId}` }, [
    el("span", { class: "drag-handle", "aria-hidden": "true", text: "⠿" }),
    el("div", { class: "card action order-card", text: card }),
  ]);
}

function renderJudgeLineRow() {
  return el("div", { class: "order-row line-row", "data-sort-key": "line" }, [
    el("span", { class: "drag-handle", "aria-hidden": "true", text: "⠿" }),
    el("div", { class: "line-marker" }, [
      el("span", { class: "line-label left", text: "← Would do" }),
      el("span", { class: "line-label right", text: "Wouldn't do →" }),
    ]),
  ]);
}

/**
 * Enables pointer-based drag-to-reorder on `container`'s direct children
 * (each must carry a unique `data-sort-key`, e.g. "card:<playerId>" or
 * "line"). Works uniformly for mouse, touch, and pen via Pointer Events.
 * Calls `onDrop(orderedIds, linePosition)` once a drag ends, derived from
 * the final DOM order.
 */
function initDragSort(container, onDrop) {
  container.addEventListener("pointerdown", (e) => {
    const row = e.target.closest("[data-sort-key]");
    if (!row || row.parentElement !== container) return;
    startDrag(row);
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

      const siblings = Array.from(container.querySelectorAll("[data-sort-key]"));
      let targetIndex = siblings.length;
      for (let i = 0; i < siblings.length; i++) {
        const r = siblings[i].getBoundingClientRect();
        if (dragCenter < r.top + r.height / 2) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex >= siblings.length) {
        container.appendChild(placeholder);
      } else {
        container.insertBefore(placeholder, siblings[targetIndex]);
      }
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

      const finalKeys = Array.from(container.querySelectorAll("[data-sort-key]")).map((el) =>
        el.getAttribute("data-sort-key")
      );
      const orderedIds = finalKeys
        .filter((key) => key.startsWith("card:"))
        .map((key) => key.slice("card:".length));
      const linePosition = finalKeys
        .slice(0, finalKeys.indexOf("line"))
        .filter((key) => key.startsWith("card:")).length;

      onDrop(orderedIds, linePosition);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }
}

function renderReveal() {
  const screen = el("div", { class: "screen" });
  screen.appendChild(el("h2", { text: "Results" }));
  screen.appendChild(
    el("p", { class: "subtitle", text: `Judged by ${game.judge.name} — for: "${game.condition}"` })
  );
  screen.appendChild(renderGoalBadge());

  const list = el("div", { class: "submission-list" });
  for (const { playerId, card } of game.submissions) {
    const player = game.players.find((p) => p.id === playerId);
    const isMost = game.mostPick === playerId;
    const isLeast = game.leastPick === playerId;
    const scored = game.winners.includes(playerId);
    const row = el("div", { class: `reveal-row${scored ? " winner" : ""}` });
    if (isMost) {
      row.appendChild(
        el("span", {
          class: `pick-tag most${scored ? "" : " unscored"}`,
          text: scored ? "MOST (+1)" : "MOST",
        })
      );
    }
    if (isLeast) {
      row.appendChild(
        el("span", {
          class: `pick-tag least${scored ? "" : " unscored"}`,
          text: scored ? "LEAST (+1)" : "LEAST",
        })
      );
    }
    row.appendChild(el("span", { class: "player-name", text: player.name }));
    row.appendChild(document.createTextNode(card));
    list.appendChild(row);
  }
  screen.appendChild(list);

  screen.appendChild(el("h3", { text: "Scoreboard" }));
  screen.appendChild(scoreboard());

  screen.appendChild(
    el("button", {
      class: "btn-primary",
      text: game.isGameOver() ? "See final results" : "Next round",
      onclick: () => {
        game.nextRound();
        resetReveal();
        render();
      },
    })
  );
  return screen;
}

function renderGameOver() {
  const screen = el("div", { class: "screen" });
  screen.appendChild(brand());
  const standings = game.standings();
  const winners = game.players.filter((p) => game.winners.includes(p.id));
  screen.appendChild(
    el("h2", {
      text:
        winners.length > 1
          ? `It's a tie! ${winners.map((w) => w.name).join(" & ")} win!`
          : `${winners[0].name} wins!`,
    })
  );
  screen.appendChild(el("h3", { text: "Final standings" }));
  screen.appendChild(scoreboard(standings));

  screen.appendChild(
    el("div", { class: "btn-row" }, [
      el("button", {
        class: "btn-primary",
        text: "Play again (same players)",
        onclick: () => {
          const names = game.players.map((p) => p.name);
          game = new Game({
            playerNames: names,
            conditions: CONDITIONS,
            actions: ACTIONS,
            targetScore: setup.targetScore,
            handSize: setup.handSize,
          });
          resetReveal();
          render();
        },
      }),
      el("button", {
        class: "btn-secondary",
        text: "New game",
        onclick: () => {
          game = null;
          setup = { players: defaultPlayerNames(3), targetScore: 7, handSize: 7, error: "" };
          render();
        },
      }),
    ])
  );
  return screen;
}

// ---------- shared bits ----------

function scoreStrip() {
  const strip = el("div", { class: "btn-row", style: "font-size:0.8rem;color:var(--text-muted);" });
  strip.textContent = game.players.map((p) => `${p.name}: ${p.score}`).join("  ·  ");
  return strip;
}

function scoreboard(list) {
  const board = el("div", { class: "scoreboard" });
  const sorted = list || game.standings();
  sorted.forEach((p, i) => {
    const isJudge = game.phase !== PHASES.GAME_OVER && p.id === game.judge.id;
    board.appendChild(
      el("div", { class: `score-row${isJudge ? " judge-marker" : ""}` }, [
        el("span", {}, [
          el("span", { class: "rank", text: `${i + 1}.` }),
          document.createTextNode(p.name),
        ]),
        el("span", { class: "points", text: String(p.score) }),
      ])
    );
  });
  return board;
}

render();
