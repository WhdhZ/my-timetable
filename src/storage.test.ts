import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import { clear } from "idb-keyval";
import {
  loadData,
  saveData,
  saveImportedData,
  loadImportBackup,
} from "./storage";
import { defaultData } from "./domain";
beforeEach(async () => {
  await clear();
});
describe("IndexedDB 持久化与导入恢复点", () => {
  it("保存后重新读取保留课程和主题", async () => {
    const d = defaultData();
    d.theme = "dark";
    d.courses = [
      {
        id: "test",
        name: "合成课程",
        room: "合成楼",
        teacher: "匿名",
        day: 1,
        start: 1,
        end: 2,
        weeks: [1, 3],
        color: "sage",
      },
    ];
    await saveData(d);
    expect(await loadData()).toEqual(d);
  });
  it("导入课表与恢复点同时持久化，恢复可撤销", async () => {
    const old = defaultData();
    old.termLabel = "原学期";
    const next = { ...old, termLabel: "新学期" };
    await saveImportedData(next, old);
    expect((await loadData()).termLabel).toBe("新学期");
    const backup = await loadImportBackup();
    expect(backup?.data).toEqual(old);
    await saveImportedData(backup!.data, next);
    expect(await loadData()).toEqual(old);
    expect((await loadImportBackup())?.data).toEqual(next);
  });
  it("非法新数据不会破坏当前课表或创建恢复点", async () => {
    const old = defaultData();
    await saveData(old);
    await expect(
      saveImportedData({ ...old, totalWeeks: 0 }, old),
    ).rejects.toThrow();
    expect(await loadData()).toEqual(old);
    expect(await loadImportBackup()).toBeUndefined();
  });
});
