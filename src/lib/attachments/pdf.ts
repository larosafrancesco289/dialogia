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
  const pdfjs = await import('pdfjs-dist');

  // Configure worker using the legacy build for broader compatibility
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pageCount = pdf.numPages;

  const pageTexts: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    pageTexts.push(pageText.trim());
  }

  return {
    text: pageTexts.join('\n\n'),
    pageCount,
  };
}
