import { useEffect, useRef } from 'react';
import type { Room } from 'livekit-client';
import { Track } from 'livekit-client';

interface Props {
  room: Room | null;
  name: string;
  micOn: boolean;
  camOn: boolean;
}

export default function LocalVideoTile({ room, name, micOn, camOn }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!room || !ref.current) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.videoTrack;
    if (!track) return;
    track.attach(ref.current);
    return () => {
      if (ref.current) track.detach(ref.current);
    };
  }, [room, camOn]);

  return (
    <div className="relative bg-black rounded overflow-hidden aspect-video">
      <video ref={ref} autoPlay playsInline muted className="w-full h-full object-cover" />
      {!camOn && (
        <div className="absolute inset-0 flex items-center justify-center text-3xl">📷❌</div>
      )}
      <div className="absolute bottom-1 left-1 bg-blue-600/90 text-white text-[10px] px-1.5 py-0.5 rounded">
        {name} (you) {micOn ? '🎤' : '🔇'}
      </div>
    </div>
  );
}
