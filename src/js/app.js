import { Game, PHASES } from "./game.js";
import { CONDITIONS, ACTIONS } from "../data/cards.js";

/** A big, hard-to-miss callout answering "what card should I play?" */
function renderCriteriaCallout(judgeName) {
  return el("div", { class: "criteria-callout" }, [
    el("p", { class: "criteria-main" }, [
      document.createTextNode("Goal: play the "),
      el("u", { text: "most intense" }),
      document.createTextNode(` card that ${judgeName} would do for:`),
    ]),
  ]);
}

const root = document.getElementById("app");

/** @type {Game|null} */
let game = null;

/** Setup-screen draft state, kept until a game is created. */
function defaultPlayerNames(count) {
  return Array.from({ length: count }, (_, i) => `Player ${i + 1}`);
}

let setup = {
  players: defaultPlayerNames(3),
  targetScore: 3,
  handSize: 5,
  error: "",
};

/** Local UI-only state that doesn't belong in Game (pass-and-play interstitials). */
let ui = {
  revealed: false, // has the current player tapped through the "pass device" screen?
};

function resetReveal() {
  ui.revealed = false;
}

/** Shown once automatically on first load, and replayable from the setup screen. */
let showIntro = true;
let introStep = 0;

function render() {
  root.innerHTML = "";
  if (showIntro) {
    root.appendChild(renderIntro());
  } else if (!game) {
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

// ---------- how-to-play intro ----------

const INTRO_SLIDES = [
  {
    title: "",
    body: "Each round, one player is the judge. Everyone else secretly submits an action card — their dare.",
    scene: sceneWelcome,
  },
  {
    title: "Read the condition",
    body: 'Each round starts with a condition — a reward everyone\'s chasing. Something like "win a new car."',
    scene: sceneCondition,
  },
  {
    title: "Play your dare",
    body: "Everyone but the judge secretly picks a card from their hand — something you think the judge WOULD actually do for it.",
    scene: sceneDares,
  },
  {
    title: "The judge sorts them",
    body: "The judge reads every dare anonymously and sorts each one: would they actually do it, or not?",
    scene: sceneSort,
  },
  {
    title: "Then ranks them",
    body: 'Within "Would do," the judge orders every card from easiest to hardest.',
    scene: sceneRank,
  },
  {
    title: "Only the hardest wins",
    body: "The hardest thing the judge would still do — the best dare — is the only card that scores a point.",
    scene: sceneScore,
  },
  {
    title: "First to the target wins",
    body: "The judge rotates every round. First player to reach the target score takes it.",
    scene: sceneWin,
  },
];

function renderIntro() {
  const screen = el("div", { class: "screen howto-screen" });
  screen.appendChild(brand());

  const slide = INTRO_SLIDES[introStep];

  const dots = el("div", { class: "howto-dots" });
  INTRO_SLIDES.forEach((_, i) => {
    dots.appendChild(el("span", { class: `howto-dot${i === introStep ? " active" : ""}` }));
  });
  screen.appendChild(dots);

  screen.appendChild(el("div", { class: "howto-stage" }, [slide.scene()]));
  screen.appendChild(el("h2", { class: "howto-title", text: slide.title }));
  screen.appendChild(el("p", { class: "subtitle howto-body", text: slide.body }));

  const nav = el("div", { class: "btn-row howto-nav" });
  if (introStep > 0) {
    nav.appendChild(
      el("button", {
        class: "btn-secondary",
        text: "Back",
        onclick: () => {
          introStep -= 1;
          render();
        },
      })
    );
  } else {
    nav.appendChild(
      el("button", {
        class: "btn-secondary",
        text: "Skip",
        onclick: () => {
          showIntro = false;
          render();
        },
      })
    );
  }
  const isLast = introStep === INTRO_SLIDES.length - 1;
  nav.appendChild(
    el("button", {
      class: "btn-primary",
      text: isLast ? "Let's play!" : "Next",
      onclick: () => {
        if (isLast) {
          showIntro = false;
          introStep = 0;
        } else {
          introStep += 1;
        }
        render();
      },
    })
  );
  screen.appendChild(nav);

  return screen;
}

function sceneWelcome() {
  const wrap = el("div", { class: "howto-scene howto-scene-welcome" });
  wrap.appendChild(el("div", { class: "howto-mini-card howto-anim-fall", style: "animation-delay:0s;" }));
  wrap.appendChild(el("div", { class: "howto-mini-card howto-anim-fall", style: "animation-delay:0.15s;" }));
  wrap.appendChild(el("div", { class: "howto-mini-card howto-anim-fall", style: "animation-delay:0.3s;" }));
  return wrap;
}

function sceneCondition() {
  const wrap = el("div", { class: "howto-scene" });
  wrap.appendChild(
    el("div", { class: "card condition howto-anim-fall howto-condition-card" }, [
      el("span", { class: "card-kicker", text: "The condition is…" }),
      document.createTextNode("win a new car"),
    ])
  );
  return wrap;
}

function sceneDares() {
  const wrap = el("div", { class: "howto-scene howto-scene-dares" });
  const captions = ["run a mile in jeans", "eat a ghost pepper", "sing karaoke solo"];
  captions.forEach((text, i) => {
    const isPicked = i === captions.length - 1;
    wrap.appendChild(
      el(
        "div",
        {
          class: `card action howto-dare-card howto-anim-fan${isPicked ? " howto-picked" : ""}`,
          style: `animation-delay:${i * 0.18}s;`,
        },
        [
          document.createTextNode(text),
          isPicked ? el("span", { class: "howto-picked-badge howto-anim-pop", style: "animation-delay:0.65s;", text: "✓ picked" }) : null,
        ]
      )
    );
  });
  return wrap;
}

function sceneSort() {
  const wrap = el("div", { class: "howto-scene howto-scene-sort" });
  wrap.appendChild(
    el("div", { class: "howto-sort-zone would" }, [
      el("div", { class: "howto-sort-zone-label", text: "✅ Would do" }),
      el("div", { class: "card action howto-sort-card howto-anim-drop", style: "animation-delay:0.3s;", text: "run a mile in jeans" }),
    ])
  );
  wrap.appendChild(
    el("div", { class: "howto-sort-zone wouldnt" }, [
      el("div", { class: "howto-sort-zone-label", text: "🚫 Wouldn't do" }),
      el("div", { class: "card action howto-sort-card howto-anim-drop", style: "animation-delay:0.6s;", text: "eat a ghost pepper" }),
    ])
  );
  return wrap;
}

function sceneRank() {
  const wrap = el("div", { class: "howto-scene howto-scene-rank" });
  const zone = el("div", { class: "howto-sort-zone would howto-rank-zone" });
  zone.appendChild(el("div", { class: "howto-sort-zone-label", text: "✅ Would do" }));
  zone.appendChild(el("div", { class: "rank-label rank-label-top", text: "Easiest" }));
  zone.appendChild(
    el("div", { class: "card action howto-sort-card howto-anim-drop", style: "animation-delay:0.2s;", text: "run a mile in jeans" })
  );
  zone.appendChild(
    el("div", { class: "card action howto-sort-card howto-anim-drop", style: "animation-delay:0.45s;", text: "eat a ghost pepper" })
  );
  zone.appendChild(el("div", { class: "rank-label rank-label-bottom", text: "Hardest" }));
  wrap.appendChild(zone);
  return wrap;
}

function sceneScore() {
  const wrap = el("div", { class: "howto-scene howto-scene-score" });
  const zone = el("div", { class: "howto-sort-zone would howto-rank-zone" });
  zone.appendChild(el("div", { class: "howto-sort-zone-label", text: "✅ Would do" }));
  zone.appendChild(el("div", { class: "card action howto-sort-card howto-dimmed", text: "run a mile in jeans" }));
  zone.appendChild(
    el("div", { class: "card action howto-sort-card howto-scored" }, [
      document.createTextNode("eat a ghost pepper"),
      el("span", { class: "winner-badge howto-anim-pop", style: "animation-delay:0.3s;", text: "🏆 wins" }),
    ])
  );
  wrap.appendChild(zone);
  return wrap;
}

function sceneWin() {
  const wrap = el("div", { class: "howto-scene howto-scene-win" });
  wrap.appendChild(el("div", { class: "howto-trophy howto-anim-bounce", text: "🏆" }));
  return wrap;
}

// ---------- setup screen ----------

function renderSetup() {
  const screen = el("div", { class: "screen" });
  screen.appendChild(brand());

  screen.appendChild(el("h2", { text: "Set up your game" }));
  screen.appendChild(
    el("p", { class: "subtitle", text: "Add 3–8 players, then start. Judge order follows this list." })
  );
  screen.appendChild(
    el("button", {
      class: "btn-secondary howto-replay",
      text: "❔ How to play",
      onclick: () => {
        showIntro = true;
        introStep = 0;
        render();
      },
    })
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
          setup.targetScore = Number(e.target.value) || 3;
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
          setup.handSize = Number(e.target.value) || 5;
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
    new car"). Everyone but the judge secretly plays an action card — their
    dare for it. The judge sorts every dare into "Would do" or "Wouldn't
    do," then ranks the "Would do" pile from easiest to hardest. The
    <strong>hardest one they'd still do</strong> wins the round — the best
    dare. First to the target score wins the game.
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
    case PHASES.ORDERING:
      return renderOrdering();
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
      text: "Everyone else is about to secretly submit a card. Read the goal below before you start.",
    })
  );
  screen.appendChild(renderCriteriaCallout(game.judge.name));
  screen.appendChild(
    el("div", { class: "card condition" }, [
      el("span", { class: "card-kicker", text: "The condition is…" }),
      document.createTextNode(game.condition),
    ])
  );
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
  screen.appendChild(el("p", { class: "subtitle", text: `${player.name}, pick your card for:` }));
  screen.appendChild(renderCriteriaCallout(game.judge.name));
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

function renderJudging() {
  const screen = el("div", { class: "screen" });
  screen.appendChild(el("h2", { text: "Step 1: Would you do it?" }));
  screen.appendChild(
    el("div", { class: "card condition" }, [
      el("span", { class: "card-kicker", text: "Condition" }),
      document.createTextNode(game.condition),
    ])
  );
  screen.appendChild(
    el("p", {
      class: "subtitle",
      text: 'Sort every card into Would do or Wouldn\'t do. You need at least one in "Would do" to continue — you\'ll rank those next.',
    })
  );

  const container = el("div", { class: "judge-order" });

  const wouldCards = el("div", { class: "bucket-cards", "data-bucket": "would" });
  const wouldBucket = el("div", { class: "bucket would-bucket" }, [
    el("div", { class: "bucket-header would-header", text: "✅ Would do" }),
    wouldCards,
  ]);

  const neutralCards = el("div", { class: "bucket-cards", "data-bucket": "neutral" });
  const neutralBucket = el("div", { class: "bucket neutral-bucket" }, [
    el("div", { class: "bucket-header neutral-header", text: "🤔 Not sorted yet" }),
    neutralCards,
  ]);

  const wouldntCards = el("div", { class: "bucket-cards", "data-bucket": "wouldnt" });
  const wouldntBucket = el("div", { class: "bucket wouldnt-bucket" }, [
    el("div", { class: "bucket-header wouldnt-header", text: "🚫 Wouldn't do" }),
    wouldntCards,
  ]);

  game.wouldIds.forEach((id) => wouldCards.appendChild(renderJudgeCardRow(id, game.cardFor(id))));
  game.neutralIds.forEach((id) => neutralCards.appendChild(renderJudgeCardRow(id, game.cardFor(id))));
  game.wouldntIds.forEach((id) => wouldntCards.appendChild(renderJudgeCardRow(id, game.cardFor(id))));

  container.appendChild(wouldBucket);
  container.appendChild(neutralBucket);
  container.appendChild(wouldntBucket);
  screen.appendChild(container);

  initBucketDragSort([wouldCards, neutralCards, wouldntCards], (wouldIds, neutralIds, wouldntIds) => {
    game.applyBuckets(wouldIds, wouldntIds, neutralIds);
    render();
  });

  if (game.neutralIds.length > 0) {
    screen.appendChild(
      el("p", {
        class: "subtitle",
        text: `${game.neutralIds.length} card${game.neutralIds.length === 1 ? "" : "s"} still need${game.neutralIds.length === 1 ? "s" : ""} to be sorted.`,
      })
    );
  } else if (game.wouldIds.length === 0) {
    screen.appendChild(el("p", { class: "subtitle", text: 'You need at least one "Would do" card to continue.' }));
  }

  screen.appendChild(
    el("button", {
      class: "btn-primary",
      text: game.wouldIds.length === 1 ? "Confirm" : 'Next: Rank your "Would do" cards',
      disabled: !game.canConfirmSplit(),
      onclick: () => {
        game.confirmSplit();
        render();
      },
    })
  );
  return screen;
}

function renderOrdering() {
  const screen = el("div", { class: "screen" });
  screen.appendChild(el("h2", { text: "Step 2: Rank them" }));
  screen.appendChild(
    el("div", { class: "card condition" }, [
      el("span", { class: "card-kicker", text: "Condition" }),
      document.createTextNode(game.condition),
    ])
  );
  screen.appendChild(
    el("p", {
      class: "subtitle",
      text: "Drag to order from easiest (top) to hardest (bottom). The bottom card wins — the best dare, the most difficult thing you'd still do for it.",
    })
  );

  const container = el("div", { class: "judge-order" });
  const wouldCards = el("div", { class: "bucket-cards", "data-bucket": "would" });
  const wouldBucket = el("div", { class: "bucket would-bucket" }, [
    el("div", { class: "bucket-header would-header", text: "✅ Would do" }),
  ]);
  wouldBucket.appendChild(el("div", { class: "rank-label rank-label-top", text: "Easiest" }));
  wouldBucket.appendChild(wouldCards);
  wouldBucket.appendChild(el("div", { class: "rank-label rank-label-bottom", text: "Hardest" }));

  game.wouldIds.forEach((id, i) => {
    const row = renderJudgeCardRow(id, game.cardFor(id));
    if (i === game.wouldIds.length - 1) {
      row.appendChild(el("span", { class: "winner-badge", text: "🏆 wins" }));
    }
    wouldCards.appendChild(row);
  });

  container.appendChild(wouldBucket);
  screen.appendChild(container);

  initBucketDragSort([wouldCards], (orderedIds) => {
    game.applyOrder(orderedIds);
    render();
  });

  screen.appendChild(
    el("button", {
      class: "btn-primary",
      text: "Confirm",
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

/**
 * Enables pointer-based drag-to-sort across an ordered list of bucket
 * `containers`, each holding rows with a unique
 * `data-sort-key="card:<playerId>"`. Works uniformly for mouse, touch, and
 * pen via Pointer Events. A card can be dragged to reorder within its
 * bucket or dropped into any other bucket entirely — including an empty
 * one. Calls `onDrop(...idsPerContainer)` once a drag ends — one array per
 * container, in the same order as `containers` — derived from the final DOM
 * order of each.
 */
function initBucketDragSort(containers, onDrop) {
  const wrapper = containers[0].closest(".judge-order");

  wrapper.addEventListener("pointerdown", (e) => {
    const row = e.target.closest("[data-sort-key]");
    if (!row) return;
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
      if (targetIndex >= rows.length) {
        targetContainer.appendChild(placeholder);
      } else {
        targetContainer.insertBefore(placeholder, rows[targetIndex]);
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

      const idsFrom = (container) =>
        Array.from(container.querySelectorAll("[data-sort-key]")).map((el) =>
          el.getAttribute("data-sort-key").slice("card:".length)
        );

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
  screen.appendChild(
    el("p", { class: "subtitle", text: `Judged by ${game.judge.name} — for: "${game.condition}"` })
  );

  const list = el("div", { class: "submission-list" });
  for (const { playerId, card } of game.submissions) {
    const player = game.players.find((p) => p.id === playerId);
    const scored = game.winners.includes(playerId);
    const row = el("div", { class: `reveal-row${scored ? " winner" : ""}` });
    row.appendChild(el("span", { class: "player-name", text: player.name }));
    row.appendChild(document.createTextNode(card));
    if (scored) {
      row.appendChild(el("span", { class: "pick-tag most", text: "🏆 Best dare (+1)" }));
    }
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
          setup = { players: defaultPlayerNames(3), targetScore: 3, handSize: 5, error: "" };
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
    board.appendChild(
      el("div", { class: "score-row" }, [
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
