import { NextRequest, NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const ab = await req.arrayBuffer();
    const maxBytes = 15 * 1024 * 1024; // 15MB cap
    if (ab.byteLength === 0) {
      return NextResponse.json({ error: 'empty_body' }, { status: 400 });
    }
    if (ab.byteLength > maxBytes) {
      return NextResponse.json({ error: 'too_large' }, { status: 413 });
    }
    const buf = Buffer.from(ab);
    // First pass: default extraction
    let parsed = await pdfParse(buf).catch(() => null as any);
    let text = (parsed?.text || '').replace(/\u0000/g, '').trim();
    let pageCount = parsed?.numpages || parsed?.numrender || undefined;
    if (!text) {
      // Second pass: robust page textContent extraction via pagerender hook
      const pagerender = (pageData: any) =>
        pageData
          .getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
          .then((tc: any) => {
            let lastY: number | undefined;
            let out = '';
            for (const item of tc.items || []) {
              const y = Array.isArray(item.transform) ? item.transform[5] : undefined;
              if (lastY == null || y === lastY) out += item.str;
              else out += '\n' + item.str;
              lastY = y;
            }
            return out;
          });
      parsed = await pdfParse(buf, { pagerender }).catch(() => null as any);
      text = (parsed?.text || '').replace(/\u0000/g, '').trim();
      pageCount = parsed?.numpages || parsed?.numrender || pageCount;
    }
    return NextResponse.json({ text, pageCount });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'pdf_extract_error' }, { status: 500 });
  }
}
