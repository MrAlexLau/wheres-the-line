// Svelte action porting the judge's drag-to-sort UI from the old vanilla
// room-app.js almost verbatim (Pointer Events, not native HTML5
// drag-and-drop, which is unreliable on mobile touch — this game targets
// mobile pass-and-play/multiplayer). See SVELTE_SPEC.md §7.
//
// Usage: <div class="judge-order" use:dragSort={{ onDrop, onDragStart, enabled }}>
// wrapping three `.bucket-cards` containers in Would/Neutral/Wouldn't order.
// onDrop is called with (wouldIds, neutralIds, wouldntIds) after a drop.
// `enabled` (default true) gates the whole action — non-judges get a
// read-only view of the same markup, so this must be a real gate, not just
// a visual one, or a read-only viewer could still drag cards and write to
// the shared judging_slots table.
//
// This action reaches into the DOM directly (reparenting the dragged row,
// swapping in a placeholder) while these same rows are *also* owned by a
// Svelte {#each} block. Two things follow from that:
//
// 1. onDragStart exists so the host component can freeze the list it
//    renders from the store for the duration of the drag. Without
//    freezing, a poll landing mid-drag updates the store and triggers
//    Svelte's own reconciliation of the same container this action is
//    mid-mutation on — observed in practice as a dragged card getting
//    stuck floating mid-list.
//
// 2. On drop, this action never leaves the dragged row physically sitting
//    inside a *different* bucket's container than where it started. If it
//    did, that bucket's {#each} block would have a real DOM node in its
//    container that it never created and has no key for — then once the
//    write completes and the frozen snapshot unfreezes with the corrected
//    data, that block creates its *own* fresh node for the same card
//    (having never known about the one already sitting there), and now
//    there are two. This was reproduced and is the actual cause of a
//    "card sometimes doubles after dropping" bug. So instead: the ids
//    array is computed straight from the DOM (using the placeholder's
//    position to stand in for the dragged card, since the placeholder has
//    no {#each} key to worry about), the row is put back exactly where it
//    started, and the host component stays frozen until the write
//    resolves and the store holds the real, correct arrangement — at
//    which point Svelte's own reconciliation, not this action, performs
//    the actual cross-bucket move.
export function dragSort(node, { onDrop, onDragStart, enabled = true }) {
  function handlePointerDown(e) {
    if (!enabled) return;
    const row = e.target.closest("[data-sort-key]");
    if (row) startDrag(row);
  }

  function startDrag(row) {
    onDragStart?.();
    // Queried fresh per-drag rather than cached at action-init: Svelte's
    // own reconciliation can replace these container nodes between drags
    // as store data changes.
    const containers = Array.from(node.querySelectorAll(".bucket-cards"));
    const draggedId = Number(row.getAttribute("data-sort-key").slice("slot:".length));
    const originalParent = row.parentNode;
    const originalNextSibling = row.nextSibling;

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

      // Read the final order straight from the DOM, with the placeholder
      // (still sitting at the drop position) standing in for the dragged
      // card's id — see file header for why we don't just query
      // [data-sort-key] on the row itself.
      const idsFrom = (container) => {
        const ids = [];
        for (const child of container.children) {
          if (child === placeholder) ids.push(draggedId);
          else if (child.hasAttribute?.("data-sort-key")) {
            ids.push(Number(child.getAttribute("data-sort-key").slice("slot:".length)));
          }
        }
        return ids;
      };
      const ids = containers.map(idsFrom);

      // Undo every manual DOM mutation before handing back to Svelte — put
      // the row back exactly where it started (not the drop target; see
      // file header) and drop the placeholder.
      placeholder.remove();
      row.classList.remove("dragging");
      row.style.position = "";
      row.style.top = "";
      row.style.left = "";
      row.style.width = "";
      if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
        originalParent.insertBefore(row, originalNextSibling);
      } else {
        originalParent.appendChild(row);
      }

      // Intentionally not unfreezing here — the host component should stay
      // frozen (still showing the pre-drop arrangement, which the DOM
      // above now matches again) until onDrop's write actually lands and
      // the store holds the corrected data, then unfreeze once, straight
      // to the correct final state.
      onDrop(...ids);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  node.addEventListener("pointerdown", handlePointerDown);

  return {
    update(newParams) {
      ({ onDrop, onDragStart, enabled = true } = newParams);
    },
    destroy() {
      node.removeEventListener("pointerdown", handlePointerDown);
    },
  };
}
