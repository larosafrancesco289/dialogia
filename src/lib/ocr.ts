'use client';

// Lightweight client-side OCR using pdfjs (CDN global) + tesseract.js

async function ensurePdfJs(): Promise<any> {
  if (typeof window === 'undefined') throw new Error('pdfjs requires browser');
  const existing = (window as any).pdfjsLib;
  if (existing) return existing;
  const ver = '4.4.168';
  const src = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${ver}/build/pdf.min.js`;
  await new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = (e) => reject(new Error('Failed to load pdf.js'));
    document.head.appendChild(el);
  });
  const pdfjsLib = (window as any).pdfjsLib;
  if (!pdfjsLib) throw new Error('pdfjsLib not available');
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${ver}/build/pdf.worker.min.js`;
  } catch {}
  return pdfjsLib;
}

export async function ocrPdfFile(
  file: File,
  opts?: {
    pages?: number; // max pages to OCR
    targetWidth?: number; // px width per page render
    lang?: string; // tesseract language
    onProgress?: (progress: { page: number; pages: number; percent?: number }) => void;
  },
): Promise<string> {
  const pages = Math.max(1, Math.min(opts?.pages ?? 3, 8));
  const targetWidth = Math.max(600, Math.min(opts?.targetWidth ?? 1200, 2000));
  const lang = opts?.lang || 'eng';

  const pdfjsLib = await ensurePdfJs();
  const TesseractMod: any = await import('tesseract.js');
  const Tesseract: any = TesseractMod?.default || TesseractMod;

  const ab = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
  const total = doc.numPages || 1;
  const take = Math.min(total, pages);
  let out = '';

  for (let i = 1; i <= take; i++) {
    opts?.onProgress?.({ page: i, pages: take, percent: 0 });
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const scale = targetWidth / viewport.width;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const dataUrl = canvas.toDataURL('image/png', 0.92);
    const result = await Tesseract.recognize(dataUrl, lang, {
      logger: (m: any) => {
        if (m && typeof m.progress === 'number')
          opts?.onProgress?.({ page: i, pages: take, percent: Math.round(m.progress * 100) });
      },
    });
    const text = String(result?.data?.text || '').trim();
    if (text) out += (out ? '\n\n' : '') + text;
  }

  return out;
}
