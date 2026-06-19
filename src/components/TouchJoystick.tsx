import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Called every frame the stick is held. dx/dy in [-1, 1]. */
  onMove: (dx: number, dy: number) => void;
  onRelease: () => void;
}

const RADIUS = 60;
const KNOB = 50;

/**
 * Floating virtual joystick for touch devices. Spawns at the touch point so
 * students can place their thumb anywhere in the bottom-left quarter of the
 * screen. Returning a normalised vector lets the parent reuse the same
 * movement loop as the keyboard.
 */
export default function TouchJoystick({ onMove, onRelease }: Props) {
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const touchIdRef = useRef<number | null>(null);

  useEffect(() => {
    function start(e: TouchEvent) {
      if (touchIdRef.current !== null) return;
      const t = e.changedTouches[0];
      if (!t) return;
      // Only react to touches that start in the lower-left third of the screen
      // (don't fight buttons in the side panel).
      if (t.clientX > window.innerWidth * 0.5 || t.clientY < window.innerHeight * 0.4) return;
      touchIdRef.current = t.identifier;
      setOrigin({ x: t.clientX, y: t.clientY });
      setKnob({ x: 0, y: 0 });
      e.preventDefault();
    }
    function move(e: TouchEvent) {
      if (touchIdRef.current === null) return;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== touchIdRef.current) continue;
        setOrigin((origin) => {
          if (!origin) return origin;
          let dx = t.clientX - origin.x;
          let dy = t.clientY - origin.y;
          const dist = Math.hypot(dx, dy);
          if (dist > RADIUS) {
            dx = (dx / dist) * RADIUS;
            dy = (dy / dist) * RADIUS;
          }
          setKnob({ x: dx, y: dy });
          onMove(dx / RADIUS, dy / RADIUS);
          return origin;
        });
        e.preventDefault();
      }
    }
    function end(e: TouchEvent) {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== touchIdRef.current) continue;
        touchIdRef.current = null;
        setOrigin(null);
        setKnob({ x: 0, y: 0 });
        onRelease();
      }
    }
    window.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, [onMove, onRelease]);

  if (!origin) return null;
  return (
    <>
      <div
        className="fixed rounded-full bg-white/15 border-2 border-white/40 pointer-events-none z-40"
        style={{
          left: origin.x - RADIUS,
          top: origin.y - RADIUS,
          width: RADIUS * 2,
          height: RADIUS * 2,
        }}
      />
      <div
        className="fixed rounded-full bg-white/70 border-2 border-white pointer-events-none z-40"
        style={{
          left: origin.x + knob.x - KNOB / 2,
          top: origin.y + knob.y - KNOB / 2,
          width: KNOB,
          height: KNOB,
        }}
      />
    </>
  );
}
