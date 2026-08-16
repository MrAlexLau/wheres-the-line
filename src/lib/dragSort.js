// Svelte action porting the judge's drag-to-sort UI from the old vanilla
// room-app.js almost verbatim (Pointer Events, not native HTML5
// drag-and-drop, which is unreliable on mobile touch — this game targets
// mobile pass-and-play/multiplayer). See SVELTE_SPEC.md §7.
//
// Usage: <div class="judge-order" use:dragSort={{ onDrop, onDragStart, onDragEnd, enabled }}>
// wrapping three `.bucket-cards` containers in Would/Neutral/Wouldn't order.
// onDrop is called with (wouldIds, neutralIds, wouldntIds) after a drop.
// `enabled` (default true) gates the whole action — non-judges get a
// read-only view of the same markup, so this must be a real gate, not just
// a visual one, or a read-only viewer could still drag cards and write to
// the shared judging_slots table.
//
// onDragStart/onDragEnd exist so the host component can freeze the list it
// renders from the store for the duration of the drag. This action reaches
// into the DOM directly (reparenting the dragged row to document.body,
// swapping in a placeholder) while these same rows are *also* owned by a
// Svelte {#each} block reacting to store updates from the 2s poll. Without
// freezing, a poll landing mid-drag lets Svelte's own reconciliation and
// this action's manual DOM surgery fight over the same nodes — observed in
// practice as a dragged card getting stuck floating mid-list, duplicated
// against the reconciled list underneath it.
export function dragSort(node, { onDrop, onDragStart, onDragEnd, enabled = true }) {
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
      const ids = containers.map(idsFrom);
      onDragEnd?.();
      onDrop(...ids);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  node.addEventListener("pointerdown", handlePointerDown);

  return {
    update(newParams) {
      ({ onDrop, onDragStart, onDragEnd, enabled = true } = newParams);
    },
    destroy() {
      node.removeEventListener("pointerdown", handlePointerDown);
    },
  };
}
