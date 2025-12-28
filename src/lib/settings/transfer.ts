import { exportAll, importAll } from '@/lib/db';

const buildExportFilename = (timestamp: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `dialogia-backup-${timestamp.getFullYear()}${pad(timestamp.getMonth() + 1)}${pad(
    timestamp.getDate(),
  )}.json`;
};

export async function buildChatExport(): Promise<{ filename: string; json: string }> {
  const data = await exportAll();
  return {
    filename: buildExportFilename(new Date()),
    json: JSON.stringify(data, null, 2),
  };
}

export async function importChatExport(payload: string): Promise<void> {
  const data = JSON.parse(payload);
  await importAll(data);
}
