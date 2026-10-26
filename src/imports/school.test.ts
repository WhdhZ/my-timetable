import { describe, it, expect } from "vitest";
import {
  extractSchoolRows,
  createSchoolPackage,
  SCHOOL_FIELDS,
} from "./schoolPayload";
import { parseSchoolJson, parseSchoolJsonText } from "./school";
import { prepareImport } from "./merge";
import { defaultData, active } from "../domain";
const record = {
  kcmc: "合成课程甲",
  cdmc: "合成楼101",
  jcs: "1-2",
  jc: 2,
  xqj: "1",
  xqjmc: "星期一",
  zcd: "3-5周(单),6-18周",
  jsxm: "匿名教师",
};
describe("教务 JSON 白名单与转换", () => {
  it("从嵌套容器找课程，只保留八个字段", () => {
    const rows = extractSchoolRows({
      data: {
        kbList: [
          {
            ...record,
            xh: "SYNTHETIC-STUDENT",
            xm: "SYNTHETIC-NAME",
            Cookie: "SYNTHETIC-SECRET",
            token: "SYNTHETIC-TOKEN",
          },
        ],
      },
      account: { token: "SYNTHETIC-ACCOUNT" },
    });
    expect(Object.keys(rows[0]).sort()).toEqual([...SCHOOL_FIELDS].sort());
    expect(JSON.stringify(rows)).not.toContain("SYNTHETIC");
  });
  it("同时转换地点、教师、星期、节次和混合周次", () => {
    const r = parseSchoolJson({ data: { rows: [record] } });
    const c = r.candidates[0];
    expect([c.name, c.room, c.teacher, c.day, c.start, c.end]).toEqual([
      "合成课程甲",
      "合成楼101",
      "匿名教师",
      1,
      1,
      2,
    ]);
    expect(c.weeks).toEqual([
      3,
      5,
      ...Array.from({ length: 13 }, (_, i) => i + 6),
    ]);
  });
  it("未确认的裸数字 jc 不覆盖明确的 jcs 范围", () => {
    expect(parseSchoolJson([record]).candidates[0].end).toBe(2);
  });
  it("非连续节次拆开，不能占用中间空课", () => {
    const r = parseSchoolJson([{ ...record, jcs: "1,2,5,6" }]);
    expect(r.candidates.map((c) => [c.start, c.end])).toEqual([
      [1, 2],
      [5, 6],
    ]);
  });
  it("明确的数字数组作为节次和周次列表", () => {
    const c = parseSchoolJson([{ ...record, jcs: [3, 4], zcd: [1, 3, 5] }])
      .candidates[0];
    expect([c.start, c.end]).toEqual([3, 4]);
    expect(c.weeks).toEqual([1, 3, 5]);
  });
  it("没有星期、节次的实践课程保留为待确认", () => {
    const r = parseSchoolJson([{ kcmc: "合成劳动实践", zcd: "1-2周" }]);
    const p = prepareImport(defaultData(), r, r.candidates, "merge", "");
    expect(p.pending).toBe(1);
    expect(p.data.otherCourses?.[0].name).toContain("劳动实践");
    expect(p.data.courses).toHaveLength(0);
  });
  it("星期冲突和节次冲突不自行择一", () => {
    const c = parseSchoolJson([{ ...record, xqjmc: "星期二", jc: "3-4" }])
      .candidates[0];
    expect(c.day).toBeNull();
    expect(c.start).toBeNull();
    expect(c.warnings.join()).toContain("冲突");
  });
  it.each([3, "3", 123456, "0102"])("不猜测 zcd 的数字编码 %s", (zcd) => {
    const c = parseSchoolJson([{ ...record, zcd }]).candidates[0];
    expect(c.weeks).toEqual([]);
    expect(c.raw).toContain(String(zcd));
  });
  it.each([2, "2", "0102"])("不猜测 jc/jcs 的数字编码 %s", (jc) => {
    const c = parseSchoolJson([{ ...record, jcs: undefined, jc }])
      .candidates[0];
    expect(c.start).toBeNull();
  });
  it("原文也会过滤响应中的身份和凭据", () => {
    const r = parseSchoolJson([
      { ...record, token: "SYNTHETIC-TOKEN", xh: "SYNTHETIC-ID" },
    ]);
    const p = prepareImport(defaultData(), r, r.candidates, "merge", "");
    expect(JSON.stringify(p.data)).not.toContain("SYNTHETIC");
  });
  it("扩展文件与原始响应使用同一转换链", () => {
    const pack = createSchoolPackage({ rows: [record] }, "合成学期");
    const r = parseSchoolJson(pack);
    expect(r.termLabel).toBe("合成学期");
    expect(r.candidates).toHaveLength(1);
  });
  it("重复导入不新增，按周次正确显示", () => {
    const r = parseSchoolJson([record]);
    const a = prepareImport(defaultData(), r, r.candidates, "merge", "");
    const b = prepareImport(a.data, r, r.candidates, "merge", "");
    expect(b.duplicates).toBe(1);
    expect(b.added).toBe(0);
    expect(active(a.data.courses[0], 4)).toBe(false);
    expect(active(a.data.courses[0], 6)).toBe(true);
  });
  it("课程字段无效仍保留候选，不静默丢弃", () => {
    const r = parseSchoolJson([{ kcmc: null, jcs: { bad: "value" } }]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].name).toBe("待确认课程");
  });
  it("拒绝错误 JSON、过大、无课表和未知版本", () => {
    expect(() => parseSchoolJsonText("{")).toThrow("JSON");
    expect(() => parseSchoolJsonText(" ".repeat(2 * 1024 * 1024 + 1))).toThrow(
      "2 MB",
    );
    expect(() => parseSchoolJson({ token: "SYNTHETIC" })).toThrow("kcmc");
    expect(() =>
      parseSchoolJson({
        format: "mytimetable.school-json",
        version: 2,
        rows: [record],
      }),
    ).toThrow();
  });
  it("数据过多或过深会报错，不能无声截断", () => {
    expect(() =>
      extractSchoolRows(Array.from({ length: 2001 }, () => ({ ...record }))),
    ).toThrow("2000");
    let deep: unknown = [record];
    for (let i = 0; i < 20; i++) deep = { data: deep };
    expect(() => extractSchoolRows(deep)).toThrow("层级");
  });
  it("私有扩展字段不会被复制到传输包", () => {
    const p = createSchoolPackage({
      rows: [{ ...record, authorization: "SYNTHETIC" }],
      headers: { Cookie: "SYNTHETIC" },
    });
    expect(JSON.stringify(p)).not.toContain("SYNTHETIC");
  });
});
it("原始响应的非白名单学期字段不进入候选元数据", () => {
  const r = parseSchoolJson({
    termLabel: "SYNTHETIC_PRIVATE_METADATA",
    format: "json",
    data: [record],
  });
  expect(r.termLabel).toBeUndefined();
  expect(JSON.stringify(r)).not.toContain("SYNTHETIC_PRIVATE_METADATA");
});
it("兼容 Windows JSON 文件开头的 UTF-8 BOM", () => {
  expect(
    parseSchoolJsonText("\uFEFF" + JSON.stringify([record])).candidates,
  ).toHaveLength(1);
});
