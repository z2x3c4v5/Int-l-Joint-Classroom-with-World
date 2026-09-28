import { useEffect, useRef, useState } from 'react';
import { MAP_HEIGHT, MAP_WIDTH, MOVE_SPEED, AVATAR_SIZE, findPaAt } from '../lib/mapConfig';

export interface MovementState {
  x: number;
  y: number;
  paId: string | null;
}

export interface MovementHandle {
  pos: MovementState;
  setAnalog: (dx: number, dy: number) => void;
  clearAnalog: () => void;
}

/**
 * Drives avatar movement from keyboard (arrow keys / WASD) AND from an
 * external analog source (touch joystick). The joystick passes vectors in
 * [-1, 1] via setAnalog/clearAnalog.
 */
export function useKeyboardMovement(
  initial: { x: number; y: number },
  onChange: (s: MovementState) => void,
): MovementHandle {
  const [pos, setPos] = useState<MovementState>({
    ...initial,
    paId: findPaAt(initial.x, initial.y)?.id ?? null,
  });
  const keys = useRef<Set<string>>(new Set());
  const analog = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    function down(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
        keys.current.add(k);
        e.preventDefault();
      }
    }
    function up(e: KeyboardEvent) {
      keys.current.delete(e.key.toLowerCase());
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    function tick() {
      let { x, y } = posRef.current;
      let dx = 0;
      let dy = 0;
      if (keys.current.has('arrowup') || keys.current.has('w')) dy -= 1;
      if (keys.current.has('arrowdown') || keys.current.has('s')) dy += 1;
      if (keys.current.has('arrowleft') || keys.current.has('a')) dx -= 1;
      if (keys.current.has('arrowright') || keys.current.has('d')) dx += 1;
      // Joystick wins when active.
      if (analog.current.x !== 0 || analog.current.y !== 0) {
        dx = analog.current.x;
        dy = analog.current.y;
      }
      const mag = Math.hypot(dx, dy);
      if (mag > 0.05) {
        const speed = MOVE_SPEED * Math.min(1, mag);
        x = Math.min(MAP_WIDTH - AVATAR_SIZE, Math.max(0, x + (dx / mag) * speed));
        y = Math.min(MAP_HEIGHT - AVATAR_SIZE, Math.max(0, y + (dy / mag) * speed));
        const newPaId = findPaAt(x, y)?.id ?? null;
        const next = { x, y, paId: newPaId };
        setPos(next);
        onChange(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [onChange]);

  return {
    pos,
    setAnalog: (dx: number, dy: number) => {
      analog.current = { x: dx, y: dy };
    },
    clearAnalog: () => {
      analog.current = { x: 0, y: 0 };
    },
  };
}
