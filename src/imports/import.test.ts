import { describe, it, expect } from "vitest";
import { parseSchoolWeeks } from "./weeks";
import { parseCell, parsePdfPages } from "./parser";
import { prepareImport, candidateIssues } from "./merge";
import { defaultData, active, validateData } from "../domain";
import { boardGroups } from "../components/WeekBoard";
import type { ImportCandidate, PdfPageText, TextBox } from "./types";
const range = (a: number, b: number) =>
  Array.from({ length: b - a + 1 }, (_, i) => a + i);
describe("北京农学院混合周次", () => {
  it.each([
    ["3周,6-19周", [3, ...range(6, 19)]],
    ["3-5周(单),6-18周", [3, 5, ...range(6, 18)]],
    ["3-17周(单)", [3, 5, 7, 9, 11, 13, 15, 17]],
    ["6-18周(双)", [6, 8, 10, 12, 14, 16, 18]],
    ["14-16周", [14, 15, 16]],
    ["1-2周,7-12周", [1, 2, 7, 8, 9, 10, 11, 12]],
    ["3—5周（单），6至10周（双）", [3, 5, 6, 8, 10]],
  ])("%s 逐段规则精确展开", (text, weeks) =>
    expect(parseSchoolWeeks(text)).toEqual(weeks),
  );
  it("拒绝不明、倒序、空周次与超出范围", () => {
    for (const s of ["", "每周", "19-6周", "0周", "61周", "3-5周(全)", "3周,"])
      expect(() => parseSchoolWeeks(s)).toThrow();
  });
});
const box = (text: string, x: number, y: number, width = 50): TextBox => ({
  text,
  x,
  y,
  width,
  height: 10,
});
export function syntheticPage(): PdfPageText {
  const items: TextBox[] = [box("2026-2027学年 第一学期", 300, 15, 180)];
  ["一", "二", "三", "四", "五", "六", "日"].forEach((d, i) =>
    items.push(box(`星期${d}`, 160 + i * 120, 50, 40)),
  );
  [1, 3, 5, 7, 9].forEach((n, i) =>
    items.push(box(`${n}-${n + 1}节`, 35, 160 + i * 180, 45)),
  );
  const put = (text: string, x: number, y: number) =>
    items.push(...text.split("\n").map((t, i) => box(t, x, y + i * 13, 90)));
  put(
    "课程名称：合成数学\n教师：匿名甲\n周次：3-5周(单),6-18周\n教室：合成楼101",
    130,
    104,
  );
  put(
    "课程名称：合成英语\n教师：匿名乙\n周次：6-18周(双)\n教室：合成楼102",
    130,
    174,
  );
  put(
    "课程名称：合成数学\n教师：匿名甲\n周次：14-16周\n教室：合成楼201",
    370,
    300,
  );
  put(
    "课程名称：劳动实践\n教师：匿名丙\n周次：1-2周,7-12周\n教室：实践基地",
    140,
    996,
  );
  return { width: 1100, height: 1100, page: 1, items: items.reverse() };
}
describe("坐标表格定位与单元格分割", () => {
  it("不依赖文本顺序定位星期与跨节行，同格两课分别保留", () => {
    const r = parsePdfPages([syntheticPage()]);
    expect(r.termLabel).toBe("2026—2027 第 1 学期");
    expect(r.candidates).toHaveLength(4);
    const a = r.candidates.find((c) => c.name === "合成英语")!;
    expect([a.day, a.start, a.end]).toEqual([1, 1, 2]);
    expect(a.weeks).toEqual([6, 8, 10, 12, 14, 16, 18]);
    const maths = r.candidates.filter((c) => c.name === "合成数学");
    expect(maths).toHaveLength(2);
    expect(maths.map((c) => c.room).sort()).toEqual(["合成楼101", "合成楼201"]);
    expect(maths.find((c) => c.room === "合成楼201")?.day).toBe(3);
    const other = r.candidates.find((c) => c.name === "劳动实践")!;
    expect(other.day).toBeNull();
    expect(other.start).toBeNull();
    expect(other.raw).toContain("实践基地");
  });
  it("逐字拆分的七天表头仍可定位", () => {
    const p = syntheticPage();
    p.items = p.items.flatMap((b) =>
      b.text.startsWith("星期")
        ? [
            box("星", b.x, b.y, 10),
            box("期", b.x + 10, b.y, 10),
            box(b.text.slice(2), b.x + 20, b.y, 10),
          ]
        : [b],
    );
    expect(
      parsePdfPages([p]).candidates.find((c) => c.name === "合成英语")?.day,
    ).toBe(1);
  });
  it("无表头时完整保留候选，不猜时间", () => {
    const r = parsePdfPages([
      {
        width: 800,
        height: 500,
        page: 1,
        items: [box("课程名称：军训", 20, 50), box("周次：1-2周", 20, 65)],
      },
    ]);
    expect(r.candidates[0].name).toBe("军训");
    expect(r.candidates[0].day).toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("图片型空页给出明确提示，不创建课程", () => {
    const r = parsePdfPages([{ width: 800, height: 500, page: 1, items: [] }]);
    expect(r.candidates).toHaveLength(0);
    expect(r.warnings.join()).toContain("扫描件");
  });
  it("支持常见星号教师与 @ 地点记号", () => {
    const r = parseCell(
      "合成课程★匿名甲@合成楼101\n3-17周(单)",
      2,
      [3, 4],
      "test",
    );
    expect(r[0].name).toBe("合成课程");
    expect(r[0].teacher).toBe("匿名甲");
    expect(r[0].room).toBe("合成楼101");
  });
});
const row = (patch: Partial<ImportCandidate> = {}): ImportCandidate => ({
  id: "a",
  name: "合成课程",
  room: "合成楼101",
  teacher: "匿名教师",
  day: 1,
  start: 1,
  end: 2,
  weeks: [1, 3],
  weekText: "1-3周(单)",
  kind: "",
  raw: "匿名合成文本",
  warnings: [],
  include: true,
  ...patch,
});
const result = { source: "test", pages: 1, warnings: [], candidates: [] };
describe("导入去重、数据可靠性与周切换", () => {
  it("相同文件重复导入不创建重复课程", () => {
    const a = prepareImport(
      defaultData(),
      result,
      [row(), row({ id: "b" })],
      "merge",
      "",
    );
    expect(a.added).toBe(1);
    expect(a.duplicates).toBe(1);
    const b = prepareImport(a.data, result, [row()], "merge", "");
    expect(b.added).toBe(0);
    expect(b.duplicates).toBe(1);
  });
  it("同一课不同教室/节次/周次分别保留且同色", () => {
    const r = prepareImport(
      defaultData(),
      result,
      [
        row(),
        row({
          id: "b",
          room: "合成楼202",
          start: 3,
          end: 4,
          weekText: "6-18周",
        }),
      ],
      "merge",
      "",
    );
    expect(r.data.courses).toHaveLength(2);
    expect(r.data.courses[0].color).toBe(r.data.courses[1].color);
  });
  it("缺失时间、未知周次和超配置节次均保留为其他课程", () => {
    const r = prepareImport(
      defaultData(),
      result,
      [
        row({ day: null }),
        row({ id: "b", weekText: "待安排" }),
        row({ id: "c", end: 12 }),
      ],
      "merge",
      "",
    );
    expect(r.pending).toBe(3);
    expect(r.data.courses).toHaveLength(0);
    expect(r.data.otherCourses?.map((c) => c.raw)).toEqual([
      "匿名合成文本",
      "匿名合成文本",
      "匿名合成文本",
    ]);
    expect(validateData(r.data)).toBe(r.data);
  });
  it("重复待确认课程也去重", () => {
    const a = prepareImport(
      defaultData(),
      result,
      [row({ day: null })],
      "merge",
      "",
    );
    const b = prepareImport(a.data, result, [row({ day: null })], "merge", "");
    expect(b.duplicates).toBe(1);
    expect(b.data.otherCourses).toHaveLength(1);
  });
  it("替换模式仅替换课程，保留真实节次时间及开学日期", () => {
    const d = defaultData();
    const r = prepareImport(
      d,
      result,
      [row()],
      "replace",
      "2026—2027 第 1 学期",
    );
    expect(r.data.semester).toBe(d.semester);
    expect(r.data.periods).toBe(d.periods);
    expect(r.data.termLabel).toContain("2026");
  });
  it("不同周次显示不同课程，非本周按需灰显", () => {
    const { data } = prepareImport(defaultData(), result, [row()], "merge", "");
    const c = data.courses[0];
    expect(active(c, 1)).toBe(true);
    expect(active(c, 2)).toBe(false);
    expect(boardGroups(data.courses, 2, false)).toHaveLength(0);
    expect(boardGroups(data.courses, 2, true)[0].inactive).toBe(true);
  });
  it("冲突组保留全部课程，可查看每门课程详情", () => {
    const { data } = prepareImport(
      defaultData(),
      result,
      [row(), row({ id: "b", name: "冲突课程" })],
      "merge",
      "",
    );
    expect(boardGroups(data.courses, 1, false)[0].courses).toHaveLength(2);
  });
  it("不完整的信息不会伪造每周上课", () => {
    expect(
      candidateIssues(row({ weekText: "" }), defaultData()).join(),
    ).toContain("周次");
  });
  it("旧版本 JSON 数据继续兼容", () => {
    expect(validateData(defaultData()).otherCourses).toBeUndefined();
  });
});
