import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { storage, db, auth } from './firebase';

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.85;

async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encode failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

export async function uploadPresentationImage(
  sessionCode: string,
  objectId: string,
  file: File,
  ownerName: string,
) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  const blob = await downscale(file);
  const path = `presentations/${sessionCode}/${objectId}/${Date.now()}.jpg`;
  const sref = storageRef(storage, path);
  await uploadBytes(sref, blob, { contentType: 'image/jpeg' });
  const imageUrl = await getDownloadURL(sref);
  await setDoc(doc(db, 'sessions', sessionCode, 'objects', objectId), {
    type: 'image',
    imageUrl,
    storagePath: path,
    slidesUrl: null,
    ownerUid: uid,
    ownerName,
    status: 'pending',
    updatedAt: serverTimestamp(),
  });
}

export function normaliseSlidesUrl(input: string): string | null {
  const url = input.trim();
  const m = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return null;
  return `https://docs.google.com/presentation/d/${m[1]}/embed?start=false&loop=false&delayms=5000`;
}

export async function attachSlidesUrl(
  sessionCode: string,
  objectId: string,
  rawUrl: string,
  ownerName: string,
) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  const slidesUrl = normaliseSlidesUrl(rawUrl);
  if (!slidesUrl) throw new Error('Paste a Google Slides share link.');
  await setDoc(doc(db, 'sessions', sessionCode, 'objects', objectId), {
    type: 'slides',
    slidesUrl,
    imageUrl: null,
    storagePath: null,
    ownerUid: uid,
    ownerName,
    status: 'pending',
    updatedAt: serverTimestamp(),
  });
}
