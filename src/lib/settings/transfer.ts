import { exportAll, importAll } from '@/lib/db';
import { err, ok, type Result } from '@/lib/utils/result';

const buildExportFilename = (timestamp: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `dialogia-backup-${timestamp.getFullYear()}${pad(timestamp.getMonth() + 1)}${pad(
    timestamp.getDate(),
  )}.json`;
};

export async function buildChatExport(): Promise<
  Result<{ filename: string; json: string }, string>
> {
  try {
    const data = await exportAll();
    return ok({
      filename: buildExportFilename(new Date()),
      json: JSON.stringify(data, null, 2),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export failed';
    return err(message);
  }
}

export async function importChatExport(
  payload: string,
): Promise<Result<{ imported: true }, string>> {
  try {
    const data = JSON.parse(payload);
    await importAll(data);
    return ok({ imported: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed';
    return err(message);
  }
}
