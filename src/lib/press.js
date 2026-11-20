import { useRef } from 'react';

/**
 * Holding something down, as a gesture the app owns rather than the browser.
 *
 * Pointer events rather than touch events, so one implementation covers a
 * finger and a mouse, and a right click is treated as the same intent on a
 * desktop.
 *
 * Three things make the difference between this feeling right and feeling
 * broken, and all three are about NOT firing:
 *
 *  - A scroll starts as a press. Any real movement cancels, and iOS also
 *    sends pointercancel the moment it takes the gesture over for scrolling.
 *  - A second finger is a pinch, not a hold.
 *  - The tap that ends the hold must not also reach whatever was under it,
 *    or opening the menu would press the button behind it as well.
 */
const HOLD = 450;   // ms. Below about 350 an ordinary tap starts triggering it.
const SLOP = 12;    // px of travel before it is a scroll rather than a hold.

export function useLongPress(onHold, enabled = true) {
  const timer = useRef(0);
  const from = useRef(null);
  const fired = useRef(false);

  const stop = () => {
    clearTimeout(timer.current);
    timer.current = 0;
    from.current = null;
  };

  if (!enabled) return {};

  return {
    onPointerDown(e) {
      // Right and middle buttons come back through onContextMenu instead.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (timer.current) return stop();
      fired.current = false;
      from.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        timer.current = 0;
        fired.current = true;
        onHold();
      }, HOLD);
    },

    onPointerMove(e) {
      if (!from.current) return;
      if (Math.abs(e.clientX - from.current.x) > SLOP
       || Math.abs(e.clientY - from.current.y) > SLOP) stop();
    },

    onPointerUp: stop,
    onPointerCancel: stop,

    onClickCapture(e) {
      if (!fired.current) return;
      e.preventDefault();
      e.stopPropagation();
      fired.current = false;
    },

    // Always suppress the native menu: on a phone ours is already open by
    // now, and iOS would otherwise stack its own on top. On a desktop the
    // right click IS the gesture, so open ours instead.
    onContextMenu(e) {
      e.preventDefault();
      if (fired.current) return;
      stop();
      onHold();
    },
  };
}
