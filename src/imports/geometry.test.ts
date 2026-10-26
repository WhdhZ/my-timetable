import { describe, it, expect } from "vitest";
import { extractHorizontalLines } from "./geometry";
import { parsePdfPages, parseCell } from "./parser";
import type { PdfPageText, TextBox } from "./types";
const box = (text: string, x: number, y: number, width = 40): TextBox => ({
  text,
  x,
  y,
  width,
  height: 10,
});
describe("PDF 表格矢量边界", () => {
  it("保留平移和缩放后的水平线，忽略曲线和竖线", () => {
    const ops = { save: 1, restore: 2, transform: 3, constructPath: 4 };
    const data = [0, 0, 0, 1, 100, 0, 1, 100, 80];
    const lines = extractHorizontalLines(
      [1, 3, 4, 2],
      [
        [],
        [2, 0, 0, 2, 10, 20],
        [20, [new Float32Array(data)], [0, 0, 100, 80]],
        [],
      ],
      ops,
      [1, 0, 0, -1, 0, 500],
    );
    expect(lines).toEqual([{ x1: 10, x2: 210, y: 480 }]);
  });
  it("独立单节标签与合并单元格线共同确定跨两节课程", () => {
    const items: TextBox[] = ["一", "二", "三", "四", "五", "六", "日"].map(
      (d, i) => box(`星期${d}`, 160 + i * 120, 50),
    );
    for (let i = 0; i < 10; i++) items.push(box(`${i + 1}`, 35, 110 + i * 60));
    [
      "课程名称：合成跨节课程",
      "教师：匿名",
      "周次：3-17周(单)",
      "教室：合成101",
    ].forEach((t, i) => items.push(box(t, 130, 98 + i * 17, 100)));
    const page: PdfPageText = {
      width: 1100,
      height: 800,
      page: 1,
      items,
      horizontalLines: [
        { x1: 120, x2: 240, y: 80 },
        { x1: 120, x2: 240, y: 200 },
      ],
    };
    const rows = parsePdfPages([page]).candidates;
    expect(rows).toHaveLength(1);
    expect([rows[0].start, rows[0].end]).toEqual([1, 2]);
  });
  it("没有合并边界的单节标签不擅自假定课程持续时间", () => {
    const c = parseCell("课程名称：合成课\n周次：3周", 1, [1, 1], "test")[0];
    expect(c.start).toBe(1);
    expect(c.end).toBeNull();
  });
  it("显式第1-2节优先于推定行", () => {
    const c = parseCell(
      "课程名称：合成课\n周次：3周\n第1-2节",
      1,
      [1, 1],
      "test",
    )[0];
    expect([c.start, c.end]).toEqual([1, 2]);
  });
});
describe("换行与保守解析", () => {
  it("长课程名、教师与教室的换行不截断", () => {
    const c = parseCell(
      "课程名称：合成课程的\n较长名称\n教师：匿名\n甲老师\n周次：3-17周(单)\n教室：合成教学楼\nA101",
      1,
      [1, 2],
      "test",
    )[0];
    expect(c.name).toBe("合成课程的较长名称");
    expect(c.teacher).toBe("匿名甲老师");
    expect(c.room).toBe("合成教学楼A101");
  });
  it("未知周次修饰符不被悄悄忽略", () => {
    const c = parseCell(
      "课程名称：合成课\n周次：3-5周(待定)",
      1,
      [1, 2],
      "test",
    )[0];
    expect(c.weeks).toEqual([]);
    expect(c.weekText).toContain("待定");
  });
  it("同一行的多字段及多个课程标签可拆分", () => {
    const c = parseCell(
      "课程名称：课程甲 教师：匿名甲 周次：3周 教室：A101\n课程名称：课程乙 教师：匿名乙 周次：6周 教室：A102",
      1,
      [1, 2],
      "test",
    );
    expect(c).toHaveLength(2);
    expect(c[0].name).toBe("课程甲");
    expect(c[1].room).toBe("A102");
  });
  it("表格之外左边缘的实践课程也保留", () => {
    const items: TextBox[] = ["一", "二", "三", "四", "五", "六", "日"].map(
      (d, i) => box(`星期${d}`, 160 + i * 120, 50),
    );
    items.push(
      box("1-2节", 35, 160),
      box("3-4节", 35, 340),
      box("课程名称：军训", 10, 600),
      box("周次：1-2周", 10, 620),
    );
    const r = parsePdfPages([{ width: 1100, height: 800, page: 1, items }]);
    expect(r.candidates.find((c) => c.name === "军训")?.day).toBeNull();
  });
  it("超长文本不因文本框中心跨列而错分星期", () => {
    const items: TextBox[] = ["一", "二", "三", "四", "五", "六", "日"].map(
      (d, i) => box(`星期${d}`, 160 + i * 120, 50),
    );
    items.push(
      box("1-2节", 35, 160),
      box("3-4节", 35, 340),
      box("课程名称：用于测试较长课程名称不跨列", 130, 110, 240),
      box("周次：3周", 130, 125),
    );
    expect(
      parsePdfPages([{ width: 1100, height: 800, page: 1, items }])
        .candidates[0].day,
    ).toBe(1);
  });
});
it("周次跨行时完整保留混合规则", () => {
  const c = parseCell(
    "课程名称：合成课\n周次：3-5周(单),\n6-18周\n教室：A101",
    1,
    [1, 2],
    "test",
  )[0];
  expect(c.weeks).toEqual([
    3,
    5,
    ...Array.from({ length: 13 }, (_, i) => i + 6),
  ]);
});
