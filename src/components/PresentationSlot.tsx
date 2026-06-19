import { useRef, useState } from 'react';
import type { PresentationObject } from '../lib/mapConfig';
import type { SlotState } from '../hooks/usePresentationObjects';
import { attachSlidesUrl, normaliseSlidesUrl, uploadPresentationImage } from '../lib/uploadImage';

interface Props {
  object: PresentationObject;
  state: SlotState | undefined;
  reachable: boolean;
  myName: string;
  sessionCode: string;
}

export default function PresentationSlot({ object, state, reachable, myName, sessionCode }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [slidesInput, setSlidesInput] = useState('');

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Image files only.');
    if (file.size > 8 * 1024 * 1024) return setError('Max 8MB.');
    setBusy(true);
    setError(null);
    try {
      await uploadPresentationImage(sessionCode, object.id, file, myName);
      setPickerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleSlidesSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!normaliseSlidesUrl(slidesInput)) {
      setError('Paste a Google Slides share link (docs.google.com/presentation/...).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await attachSlidesUrl(sessionCode, object.id, slidesInput, myName);
      setSlidesInput('');
      setPickerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to attach slides.');
    } finally {
      setBusy(false);
    }
  }

  const isImage = state?.type === 'image' && state.imageUrl;
  const isSlides = state?.type === 'slides' && state.slidesUrl && state.status === 'approved';
  const slidesPending = state?.type === 'slides' && state.slidesUrl && state.status === 'pending';
  const pending = state?.status === 'pending';
  const rejected = state?.status === 'rejected';

  return (
    <div
      className="absolute bg-slate-100 border-2 border-slate-700 rounded shadow-lg overflow-hidden"
      style={{ left: object.x, top: object.y, width: object.w, height: object.h }}
    >
      {isImage ? (
        <img src={state!.imageUrl!} alt={object.label} className="w-full h-full object-contain bg-black" />
      ) : isSlides ? (
        <iframe
          src={state!.slidesUrl!}
          title={object.label}
          className="w-full h-full bg-black"
          sandbox="allow-scripts allow-same-origin allow-popups"
          referrerPolicy="no-referrer"
          allowFullScreen
        />
      ) : slidesPending ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 text-xs px-2 text-center">
          <span>📊 Slides waiting for teacher approval</span>
        </div>
      ) : object.id === 'obj-welcome' ? (
        <div className="w-full h-full bg-sky-300 flex flex-col items-center justify-center text-center text-slate-800 px-2 leading-tight">
          <div className="text-[10px] sm:text-xs font-extrabold">🌐 GLOBAL ENGLISH CLASSROOM</div>
          <div className="text-[9px] sm:text-[10px] font-semibold opacity-80">
            Korea · Malaysia · Taiwan · Thailand
          </div>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs text-center px-2">
          {rejected ? '⚠️ Removed by moderation' : `📺 ${object.label}`}
        </div>
      )}
      {pending && !slidesPending && (
        <div className="absolute inset-0 ring-4 ring-yellow-400 ring-inset pointer-events-none" />
      )}
      {state?.ownerName && (
        <div className="absolute top-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">
          by {state.ownerName}
        </div>
      )}
      {reachable && !pickerOpen && (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={busy}
          className="absolute bottom-1 right-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-500 text-white text-[10px] px-2 py-1 rounded shadow"
        >
          {state?.imageUrl || state?.slidesUrl ? 'Replace' : 'Add'}
        </button>
      )}
      {reachable && pickerOpen && (
        <div className="absolute inset-0 bg-slate-900/95 p-2 flex flex-col gap-1 text-white text-[11px]">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="bg-blue-600 hover:bg-blue-500 py-1.5 rounded"
          >
            {busy ? '…' : '🖼 Upload image'}
          </button>
          <form onSubmit={handleSlidesSubmit} className="flex gap-1">
            <input
              type="text"
              value={slidesInput}
              onChange={(e) => setSlidesInput(e.target.value)}
              placeholder="Paste Google Slides URL"
              className="flex-1 px-1 rounded bg-slate-800 border border-slate-600 text-[10px]"
            />
            <button
              disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-500 px-2 rounded"
            >
              Go
            </button>
          </form>
          <button onClick={() => setPickerOpen(false)} className="text-slate-400 hover:text-white text-[10px]">
            cancel
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePick} />
      {error && (
        <div className="absolute bottom-0 left-0 right-0 bg-red-600 text-white text-[10px] px-1 py-0.5">{error}</div>
      )}
    </div>
  );
}
