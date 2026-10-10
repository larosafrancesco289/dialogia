// Module: attachments/pdf
// Responsibility: Client-side PDF text extraction using pdfjs-dist.
// This module is client-only and uses dynamic imports to avoid SSR issues.

export type PdfExtractionResult = {
  text: string;
  pageCount: number;
};

/**
 * Extracts text content from a PDF file using pdfjs-dist.
 * Returns the concatenated text from all pages and the page count.
 * This function only works in browser environments.
 */
export async function extractTextFromPdf(file: File): Promise<PdfExtractionResult> {
  if (typeof window === 'undefined') {
    throw new Error('PDF extraction is only available in browser environments');
  }

  // Dynamic import to avoid SSR issues
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    // The worker ships with the app: fetched from a CDN, it reached a third
    // party for someone on their own server, failed offline, and the page's
    // policy (src/lib/csp.ts) allows workers from this origin alone.
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  try {
    const pageCount = pdf.numPages;
    const pageTexts: string[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
      pageTexts.push(pageText.trim());
    }
    return { text: pageTexts.join('\n\n'), pageCount };
  } finally {
    // The document holds the whole file in the worker until it is destroyed.
    void pdf.destroy();
  }
}
