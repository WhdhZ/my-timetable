import { describe, it, expect } from "vitest";
import {
  teachingWeek,
  parseDate,
  selectWeeks,
  parseWeeks,
  conflicts,
  defaultData,
  validateData,
  type Course,
} from "./domain";
describe("教学周（日历周从周一开始）", () => {
  it("学期开始日所在周为第一周，包括周一", () => {
    expect(teachingWeek(parseDate("2026-09-01"), "2026-09-03")).toBe(1);
  });
  it("周日与下周一边界", () => {
    expect(teachingWeek(parseDate("2026-09-06"), "2026-09-01")).toBe(1);
    expect(teachingWeek(parseDate("2026-09-07"), "2026-09-01")).toBe(2);
  });
  it("开学前、跨年和闰年", () => {
    expect(teachingWeek(parseDate("2026-08-30"), "2026-09-01")).toBe(0);
    expect(teachingWeek(parseDate("2027-01-04"), "2026-12-28")).toBe(2);
    expect(teachingWeek(parseDate("2024-03-04"), "2024-02-26")).toBe(2);
  });
});
describe("周次规则", () => {
  it("按教学周筛选单双周", () => {
    expect(selectWeeks("1-8", 20, "odd")).toEqual([1, 3, 5, 7]);
    expect(selectWeeks("1-8", 20, "even")).toEqual([2, 4, 6, 8]);
  });
  it("支持指定周次、中文逗号、排序和去重", () => {
    expect(parseWeeks("3,1-3，8", 20)).toEqual([1, 2, 3, 8]);
  });
  it("拒绝非法及越界范围", () => {
    for (const s of ["", "0", "21", "3-1", "a", "1,"])
      expect(() => parseWeeks(s, 20)).toThrow();
  });
});
const c: Course = {
  id: "a",
  name: "演示",
  room: "",
  teacher: "",
  day: 1,
  start: 1,
  end: 2,
  weeks: [1, 3],
  color: "sage",
};
describe("冲突判断", () => {
  it("同日同节且周次相交才冲突", () => {
    expect(conflicts(c, { ...c, id: "b", start: 2, end: 3 })).toBe(true);
    expect(conflicts(c, { ...c, id: "b", weeks: [2, 4] })).toBe(false);
    expect(conflicts(c, { ...c, id: "b", start: 3, end: 4 })).toBe(false);
    expect(conflicts(c, { ...c, id: "b", day: 2 })).toBe(false);
    expect(conflicts(c, c)).toBe(false);
  });
});
describe("备份校验", () => {
  it("默认数据可恢复", () =>
    expect(validateData(defaultData()).version).toBe(1));
  it("拒绝未知版本、坏日期、重叠时间及越界课程", () => {
    const d = defaultData();
    expect(() => validateData({ ...d, version: 2 })).toThrow();
    expect(() => validateData({ ...d, semester: "2026-02-30" })).toThrow();
    expect(() =>
      validateData({ ...d, periods: [{ start: "09:00", end: "08:00" }] }),
    ).toThrow();
    expect(() =>
      validateData({ ...d, courses: [{ ...c, end: 99 }] }),
    ).toThrow();
  });
});
