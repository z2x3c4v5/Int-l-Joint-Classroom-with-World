import { useEffect, useRef } from 'react';
import { MAP_HEIGHT, MAP_WIDTH, getMapCanvas } from '../game/map';

/** The school map, slowly drifting behind the entry card. */
export default function MapBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    c.width = MAP_WIDTH;
    c.height = MAP_HEIGHT;
    c.getContext('2d')!.drawImage(getMapCanvas(), 0, 0);
  }, []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: MAP_WIDTH, height: MAP_HEIGHT, marginLeft: -MAP_WIDTH / 2, marginTop: -MAP_HEIGHT / 2 }}
      >
        <canvas ref={ref} className="gc-drift block opacity-70" style={{ imageRendering: 'pixelated' }} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/40 via-indigo-950/20 to-indigo-950/60" />
    </div>
  );
}
