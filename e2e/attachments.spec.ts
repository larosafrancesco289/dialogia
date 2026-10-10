import { test, expect, connectMock, send, REPLY_END } from './fixtures';
import { MOCK_URL } from '../playwright.config';

/** The smallest PDF that holds a line of text, with a correct cross-reference table. */
function tinyPdf(text: string): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = `BT /F1 18 Tf 20 70 Td (${text}) Tj ET`;
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

test('a PDF attached under the page’s security policy is read by the bundled worker and its text reaches the model', async ({
  page,
  request,
}) => {
  await connectMock(page);
  await request.delete(`${MOCK_URL.replace('/v1', '')}/__requests`);

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'notes.pdf',
      mimeType: 'application/pdf',
      buffer: tinyPdf('Quantum otters'),
    });
  await expect(page.getByText('notes.pdf')).toBeVisible();
  await send(page, 'Summarise the file');
  await expect(page.getByRole('main').getByText(REPLY_END)).toBeVisible();

  const sent = JSON.stringify(
    await (await request.get(`${MOCK_URL.replace('/v1', '')}/__requests`)).json(),
  );
  expect(sent).toContain('Quantum otters');
});
