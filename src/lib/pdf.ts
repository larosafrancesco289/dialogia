export async function extractPdfTextViaApi(
  file: File,
): Promise<{ text: string; pageCount?: number } | null> {
  try {
    const res = await fetch('/api/pdf/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    } as any);
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string; pageCount?: number };
    const text = String(data?.text || '').trim();
    return { text, pageCount: data?.pageCount };
  } catch {
    return null;
  }
}
