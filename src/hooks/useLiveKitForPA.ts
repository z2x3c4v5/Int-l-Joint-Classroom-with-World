import { useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import { httpsCallable } from 'firebase/functions';
import { functions, auth } from '../lib/firebase';

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string;

export interface RemoteMedia {
  identity: string;
  name: string;
  videoEl: HTMLVideoElement | null;
  audioEl: HTMLAudioElement | null;
  micOn: boolean;
  camOn: boolean;
}

export interface ActiveScreenShare {
  identity: string;
  name: string;
  videoEl: HTMLVideoElement;
  isLocal: boolean;
}

/**
 * Joins a LiveKit room scoped to the current Private Area. Leaves automatically
 * when the user walks out of the PA — that's the proximity/private guarantee.
 * Outside any PA the hook holds no connection (no media cost, no audio leak).
 */
export function useLiveKitForPA(sessionCode: string, paId: string | null, displayName: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [remotes, setRemotes] = useState<Record<string, RemoteMedia>>({});
  const [screenShare, setScreenShare] = useState<ActiveScreenShare | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const currentPaRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function leaveCurrent() {
      if (room) {
        await room.disconnect();
        setRoom(null);
        setRemotes({});
        setScreenShare(null);
        setScreenOn(false);
      }
    }

    async function joinNew(targetPa: string) {
      setConnecting(true);
      try {
        const getToken = httpsCallable<
          { sessionCode: string; paId: string; identity: string; name: string },
          { token: string }
        >(functions, 'mintLiveKitToken');
        const uid = auth.currentUser?.uid ?? `anon-${Math.random().toString(36).slice(2)}`;
        const res = await getToken({
          sessionCode,
          paId: targetPa,
          identity: uid,
          name: displayName,
        });
        if (cancelled) return;

        const r = new Room({
          adaptiveStream: true,
          dynacast: true,
          publishDefaults: { simulcast: true },
        });

        r.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
          attachTrack(track, pub, participant);
        });
        r.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
          track.detach().forEach((el) => el.remove());
          if (pub.source === Track.Source.ScreenShare) {
            setScreenShare((cur) => (cur?.identity === participant.identity ? null : cur));
          }
        });
        r.on(RoomEvent.ParticipantDisconnected, (p) => {
          setRemotes((prev) => {
            const next = { ...prev };
            delete next[p.identity];
            return next;
          });
          setScreenShare((cur) => (cur?.identity === p.identity ? null : cur));
        });
        r.on(RoomEvent.TrackMuted, (pub, p) => {
          if (p.isLocal || pub.source === Track.Source.ScreenShare) return;
          updateRemoteMute(p.identity, pub.kind, true);
        });
        r.on(RoomEvent.TrackUnmuted, (pub, p) => {
          if (p.isLocal || pub.source === Track.Source.ScreenShare) return;
          updateRemoteMute(p.identity, pub.kind, false);
        });

        await r.connect(LIVEKIT_URL, res.data.token);
        if (cancelled) {
          await r.disconnect();
          return;
        }
        await r.localParticipant.enableCameraAndMicrophone();
        setRoom(r);
      } catch (err) {
        console.error('LiveKit join failed', err);
      } finally {
        setConnecting(false);
      }
    }

    function attachTrack(track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) {
      // Screen share is treated as a single global tile, not stacked under
      // the participant's webcam tile.
      if (pub.source === Track.Source.ScreenShare && track.kind === Track.Kind.Video) {
        const el = document.createElement('video');
        el.autoplay = true;
        el.playsInline = true;
        el.muted = true;
        track.attach(el);
        setScreenShare({
          identity: participant.identity,
          name: participant.name ?? participant.identity,
          videoEl: el,
          isLocal: false,
        });
        return;
      }
      if (pub.source === Track.Source.ScreenShareAudio) {
        const el = document.createElement('audio');
        el.autoplay = true;
        track.attach(el);
        document.body.appendChild(el);
        return;
      }

      setRemotes((prev) => {
        const cur = prev[participant.identity] ?? {
          identity: participant.identity,
          name: participant.name ?? participant.identity,
          videoEl: null,
          audioEl: null,
          micOn: true,
          camOn: true,
        };
        if (track.kind === Track.Kind.Video) {
          const el = document.createElement('video');
          el.autoplay = true;
          el.playsInline = true;
          el.muted = true;
          track.attach(el);
          return { ...prev, [participant.identity]: { ...cur, videoEl: el } };
        }
        if (track.kind === Track.Kind.Audio) {
          const el = document.createElement('audio');
          el.autoplay = true;
          track.attach(el);
          document.body.appendChild(el);
          return { ...prev, [participant.identity]: { ...cur, audioEl: el } };
        }
        return prev;
      });
    }

    function updateRemoteMute(identity: string, kind: Track.Kind, muted: boolean) {
      setRemotes((prev) => {
        const cur = prev[identity];
        if (!cur) return prev;
        if (kind === Track.Kind.Audio) return { ...prev, [identity]: { ...cur, micOn: !muted } };
        if (kind === Track.Kind.Video) return { ...prev, [identity]: { ...cur, camOn: !muted } };
        return prev;
      });
    }

    if (paId !== currentPaRef.current) {
      currentPaRef.current = paId;
      (async () => {
        await leaveCurrent();
        if (paId) await joinNew(paId);
      })();
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCode, paId, displayName]);

  async function toggleMic() {
    if (!room) return;
    const enabled = !micOn;
    await room.localParticipant.setMicrophoneEnabled(enabled);
    setMicOn(enabled);
  }
  async function toggleCam() {
    if (!room) return;
    const enabled = !camOn;
    await room.localParticipant.setCameraEnabled(enabled);
    setCamOn(enabled);
  }
  async function toggleScreen() {
    if (!room) return;
    const enabled = !screenOn;
    try {
      await room.localParticipant.setScreenShareEnabled(enabled, { audio: true });
      setScreenOn(enabled);
      if (enabled) {
        const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
        const track = pub?.videoTrack;
        if (track) {
          const el = document.createElement('video');
          el.autoplay = true;
          el.playsInline = true;
          el.muted = true;
          track.attach(el);
          setScreenShare({
            identity: room.localParticipant.identity,
            name: displayName,
            videoEl: el,
            isLocal: true,
          });
        }
        // Whoever stops via the browser bar (not our button) — listen for end.
        const pubAfter = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
        pubAfter?.videoTrack?.once('ended', () => {
          setScreenOn(false);
          setScreenShare((cur) => (cur?.isLocal ? null : cur));
        });
      } else {
        setScreenShare((cur) => (cur?.isLocal ? null : cur));
      }
    } catch (err) {
      console.error('Screen share toggle failed', err);
      setScreenOn(false);
    }
  }

  return {
    room,
    remotes,
    screenShare,
    micOn,
    camOn,
    screenOn,
    connecting,
    toggleMic,
    toggleCam,
    toggleScreen,
  };
}
