import { useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

/**
 * Bottom info drawer. Collapsed it shows only a slim grabber bar; expanded it
 * fills its containing zone below the quiz, which stays interactive. Tap the
 * bar to toggle; drag it up/down too.
 */
export function Drawer({
  open,
  setOpen,
  children,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  children: ComponentChildren;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; base: number; closedY: number; moved: boolean } | null>(null);

  const closedOffset = () => {
    const el = sheet.current!;
    const handle = el.querySelector('.drawer-handle') as HTMLElement;
    return el.offsetHeight - (handle?.offsetHeight ?? 34);
  };

  const onPointerDown = (e: PointerEvent) => {
    const el = sheet.current;
    if (!el) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* pointer may already be gone (or synthetic) — drag still works uncaptured */
    }
    const closedY = closedOffset();
    drag.current = { startY: e.clientY, base: open ? 0 : closedY, closedY, moved: false };
    el.style.transition = 'none';
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    const el = sheet.current;
    if (!d || !el) return;
    const delta = e.clientY - d.startY;
    if (Math.abs(delta) > 6) d.moved = true;
    const y = Math.min(Math.max(d.base + delta, 0), d.closedY);
    el.style.transform = `translateY(${y}px)`;
  };

  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    const el = sheet.current;
    drag.current = null;
    if (!d || !el) return;
    el.style.transition = '';
    el.style.transform = '';
    const delta = e.clientY - d.startY;
    if (!d.moved) {
      setOpen(!open); // treat as tap
    } else if (open && delta > 60) {
      setOpen(false);
    } else if (!open && delta < -40) {
      setOpen(true);
    }
  };

  return (
    <div class={`drawer${open ? ' open' : ''}`} ref={sheet}>
      <button
        type="button"
        class="drawer-handle"
        aria-label={open ? 'Close info drawer' : 'Open info drawer'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span class="grabber" />
      </button>
      <div class="drawer-body">{children}</div>
    </div>
  );
}
