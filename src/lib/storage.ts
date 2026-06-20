// Firebase Storage helpers for product/design/booklet images and future
// barcode PDF exports. No-ops gracefully when Storage isn't configured.

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

export type ImageKind = 'product' | 'design' | 'booklet' | 'barcode_pdf';

const PATHS: Record<ImageKind, string> = {
  product: 'products',
  design: 'designs',
  booklet: 'booklets',
  barcode_pdf: 'barcodes',
};

export function storageAvailable(): boolean {
  return storage !== null;
}

/**
 * Uploads a file and returns its download URL. Throws if Storage is not
 * configured — callers should check storageAvailable() first or catch.
 */
export async function uploadFile(kind: ImageKind, id: string, file: File): Promise<string> {
  if (!storage) throw new Error('Firebase Storage not configured');
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const path = `${PATHS[kind]}/${id}.${ext}`;
  const r = ref(storage, path);
  await uploadBytes(r, file);
  return getDownloadURL(r);
}

/** Upload a generated barcode/label PDF (Blob) and return its URL. */
export async function uploadPdf(id: string, blob: Blob): Promise<string> {
  if (!storage) throw new Error('Firebase Storage not configured');
  const r = ref(storage, `${PATHS.barcode_pdf}/${id}.pdf`);
  await uploadBytes(r, blob);
  return getDownloadURL(r);
}
