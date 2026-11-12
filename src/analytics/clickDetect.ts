/**
 * Distinguish a genuine click/tap from camera drag (orbit/pan).
 * Used by the Three.js canvas — no raycast on pointermove.
 */

const MOVE_PX = 8;

export interface ClickGesture {
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: () => void;
  dispose: () => void;
}

export function attachClickGesture(
  el: HTMLElement,
  onClick: (e: PointerEvent) => void,
): ClickGesture {
  let down: { x: number; y: number; id: number } | null = null;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!down || down.id !== e.pointerId) {
      down = null;
      return;
    }
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (dx * dx + dy * dy > MOVE_PX * MOVE_PX) return;
    onClick(e);
  };

  const onPointerCancel = () => {
    down = null;
  };

  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerCancel);

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    dispose: () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
      down = null;
    },
  };
}

export function isClickNotDrag(
  down: { x: number; y: number },
  up: { x: number; y: number },
  threshold = MOVE_PX,
): boolean {
  const dx = up.x - down.x;
  const dy = up.y - down.y;
  return dx * dx + dy * dy <= threshold * threshold;
}
