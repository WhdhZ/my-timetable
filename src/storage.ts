import { get, set, setMany } from "idb-keyval";
import { defaultData, validateData, type Data } from "./domain";
export const KEY = "mytimetable-data-v1";
export const BACKUP_KEY = "mytimetable-before-import-v1";
export async function loadData(): Promise<Data> {
  const stored = await get(KEY);
  return stored ? validateData(stored) : defaultData();
}
export async function saveData(data: Data): Promise<void> {
  await set(KEY, validateData(data));
}
// 同一个 IndexedDB 事务中保存恢复点与新数据，写入失败不会只替换一半。
export async function saveImportedData(
  next: Data,
  previous: Data,
): Promise<void> {
  await setMany([
    [
      BACKUP_KEY,
      { at: new Date().toISOString(), data: validateData(previous) },
    ],
    [KEY, validateData(next)],
  ]);
}
export async function loadImportBackup(): Promise<
  { at: string; data: Data } | undefined
> {
  const backup = await get(BACKUP_KEY);
  return backup
    ? { at: backup.at, data: validateData(backup.data) }
    : undefined;
}
