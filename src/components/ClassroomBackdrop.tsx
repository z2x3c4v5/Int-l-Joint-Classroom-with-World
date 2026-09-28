import { DECOR_SEATS, MAP_HEIGHT, MAP_WIDTH, PRIVATE_AREAS } from '../lib/mapConfig';

/**
 * Static visual layer for the classroom — rooms, corridor, bookshelves,
 * windows, seats, room labels. Designed to evoke the ZEP classroom layout
 * (4 rooms around a cross corridor). Pure CSS / SVG, no images required.
 */
export default function ClassroomBackdrop() {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ width: MAP_WIDTH, height: MAP_HEIGHT }}>
      {/* Beige cross corridor */}
      <div
        className="absolute"
        style={{
          left: 820,
          top: 0,
          width: 160,
          height: MAP_HEIGHT,
          background: 'repeating-linear-gradient(0deg, #e6c8a0 0 40px, #d9b88e 40px 80px)',
        }}
      />
      <div
        className="absolute"
        style={{
          left: 0,
          top: 480,
          width: MAP_WIDTH,
          height: 120,
          background: 'repeating-linear-gradient(90deg, #e6c8a0 0 40px, #d9b88e 40px 80px)',
        }}
      />

      {/* Window strip with sky/city silhouette along the very top */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: 0,
          height: 70,
          background:
            'linear-gradient(180deg, #87ceeb 0%, #b6dff7 60%, #ffffff 100%)',
        }}
      >
        <div
          className="absolute inset-0 opacity-80"
          style={{
            backgroundImage:
              'linear-gradient(180deg, transparent 60%, #6b7280 60%, #6b7280 70%, #4b5563 70%, #4b5563 80%, #6b7280 80%, #6b7280 90%, #374151 90%)',
            backgroundSize: '120px 100%',
            backgroundRepeat: 'repeat-x',
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-3"
          style={{ background: 'repeating-linear-gradient(90deg, #ffffff 0 60px, #d1d5db 60px 64px)' }}
        />
      </div>

      {/* Bookshelf bands across the central horizontal corridor edges */}
      <Bookshelf y={462} />
      <Bookshelf y={596} />

      {/* Each room: floor + label + decorative seats */}
      {PRIVATE_AREAS.map((pa) => (
        <div key={pa.id} className="absolute" style={{ left: pa.x, top: pa.y, width: pa.w, height: pa.h }}>
          {/* Solid blue floor */}
          <div
            className="absolute inset-0 rounded-md"
            style={{
              background: pa.color,
              boxShadow: 'inset 0 0 0 4px rgba(255,255,255,0.06)',
            }}
          />
          {/* Subtle tile pattern */}
          <div
            className="absolute inset-0 opacity-20 rounded-md"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
          {/* Big room label */}
          <div
            className="absolute text-white font-extrabold tracking-wide select-none"
            style={{ left: 24, bottom: 16, fontSize: 34, textShadow: '2px 2px 0 rgba(0,0,0,0.4)' }}
          >
            {pa.name}
          </div>
        </div>
      ))}

      {/* Decorative seat tiles (chair + table shape + number, like the ZEP screenshot) */}
      {DECOR_SEATS.map((seat) => (
        <div
          key={`${seat.paId}-${seat.number}`}
          className="absolute flex flex-col items-center"
          style={{ left: seat.x, top: seat.y, width: 60 }}
        >
          <div
            className="rounded-full border-2 border-amber-700"
            style={{
              width: 60,
              height: 38,
              background: 'radial-gradient(circle at 50% 30%, #fef3c7 0%, #d6c08c 70%, #a98554 100%)',
              boxShadow: '0 4px 0 rgba(0,0,0,0.25)',
            }}
          />
          <div
            className="absolute text-white font-bold"
            style={{ top: -22, fontSize: 22, textShadow: '1px 1px 2px rgba(0,0,0,0.6)' }}
          >
            {seat.number}
          </div>
        </div>
      ))}

      {/* Corridor signs at intersections (Polite Room ↑ Leading Room → etc.) */}
      <CorridorSign x={840} y={300} text="Polite" arrow="←" />
      <CorridorSign x={920} y={300} text="Leading" arrow="→" />
      <CorridorSign x={840} y={780} text="Useful" arrow="←" />
      <CorridorSign x={920} y={780} text="Smart" arrow="→" />
    </div>
  );
}

function Bookshelf({ y }: { y: number }) {
  return (
    <div
      className="absolute left-0 right-0"
      style={{
        top: y,
        height: 18,
        background:
          'linear-gradient(180deg, #6b3f1d 0 4px, repeating-linear-gradient(90deg, #d97706 0 8px, #92400e 8px 14px, #b45309 14px 22px) 4px / 100% 14px no-repeat)',
        backgroundColor: '#6b3f1d',
        borderTop: '2px solid #44291a',
        borderBottom: '2px solid #44291a',
      }}
    />
  );
}

function CorridorSign({ x, y, text, arrow }: { x: number; y: number; text: string; arrow: string }) {
  return (
    <div
      className="absolute text-slate-700 font-bold text-center select-none"
      style={{ left: x, top: y, width: 80, fontSize: 14 }}
    >
      <div>{text}</div>
      <div>Room {arrow}</div>
    </div>
  );
}
