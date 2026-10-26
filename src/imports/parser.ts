import type {
  ImportCandidate,
  ImportResult,
  PdfPageText,
  TextBox,
} from "./types";
import { parseSchoolWeeks, weekExpression } from "./weeks";
const cn = ["一", "二", "三", "四", "五", "六", "日"];
const clean = (s: string) => s.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
function lines(items: TextBox[]): string[] {
  const rows: { y: number; boxes: TextBox[] }[] = [];
  for (const b of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find(
      (r) => Math.abs(r.y - b.y) < Math.max(2, Math.min(b.height, 10) * 0.4),
    );
    if (row) row.boxes.push(b);
    else rows.push({ y: b.y, boxes: [b] });
  }
  return rows
    .sort((a, b) => a.y - b.y)
    .map((r) =>
      r.boxes
        .sort((a, b) => a.x - b.x)
        .map((b) => b.text)
        .join("")
        .trim(),
    )
    .filter(Boolean);
}
// 空白行、课程标签及明确的分隔符提供课程边界；不能确认边界的内容完整保留待核对。
export function parseCell(
  raw: string,
  day: number | null,
  range: [number, number] | null,
  source: string,
  rangeReliable = false,
): ImportCandidate[] {
  const rawLines = raw
    .replace(/\n\s*\n/g, "\n---\n")
    .replace(
      /(课程名称|任课教师|上课周次|课程类型|教学楼|课程|科目|教师|教室|地点|周次|节次|类型)\s*[:：]/g,
      "\n$&",
    )
    .split(/\n/)
    .map(clean)
    .filter(Boolean);
  const blocks: string[][] = [];
  let block: string[] = [];
  let hasWeeks = false;
  let hasDetails = false;
  const flush = () => {
    if (block.length) blocks.push(block);
    block = [];
    hasWeeks = false;
    hasDetails = false;
  };
  for (const line of rawLines) {
    if (/^[—\-=─]{3,}$/.test(line)) {
      flush();
      continue;
    }
    const label = /^(?:课程(?:名称)?|科目)\s*[:：]/.test(line);
    const detail =
      /^(?:教师|任课教师|教室|地点|教学楼|周次|上课周次|节次|类型)\s*[:：]/.test(
        line,
      );
    // 教师/教室等已明确结束后出现新的非元数据行，作为下一门课程。
    const newName =
      hasWeeks &&
      hasDetails &&
      !detail &&
      !/^[@★☆]/.test(line) &&
      /[★☆].*@/.test(line);
    if (block.length && (label || newName)) flush();
    block.push(line);
    if (/\d.*周/.test(line)) hasWeeks = true;
    if (/^(?:教师|任课教师|教室|地点)\s*[:：]/.test(line) || /[@★]/.test(line))
      hasDetails = true;
  }
  flush();
  return blocks.map((b, index) => {
    const text = b.join("\n");
    const warnings: string[] = [];
    const fieldLabel =
      /^(?:课程名称|任课教师|上课周次|课程类型|教学楼|课程|科目|教师|教室|地点|周次|节次|类型)\s*[:：]/;
    const read = (label: string) => {
      const re = new RegExp(`^(?:${label})\\s*[:：]\\s*(.*)$`);
      const at = b.findIndex((l) => re.test(l));
      if (at < 0) return "";
      const parts = [b[at].replace(re, "$1")];
      for (let i = at + 1; i < b.length; i++) {
        if (
          fieldLabel.test(b[i]) ||
          /\d.*周/.test(b[i]) ||
          /(?:第)?\d+(?:-\d+)?节/.test(b[i])
        )
          break;
        parts.push(b[i]);
      }
      return parts.join("").trim();
    };
    const weekMatches = [
      ...text.matchAll(new RegExp(weekExpression.source, "g")),
    ];
    const weekFields = b.flatMap((l, index) => {
      if (!/^(?:上课)?周次\s*[:：]/.test(l)) return [];
      let value = l.replace(/^(?:上课)?周次\s*[:：]\s*/, "");
      for (let i = index + 1; i < b.length; i++) {
        if (
          fieldLabel.test(b[i]) ||
          !/^[\d\s周单双,，、()（）\-—－~～至]+$/.test(b[i])
        )
          break;
        value += b[i];
      }
      return [value];
    });
    const weekText = weekFields.length
      ? weekFields.join(",")
      : weekMatches
          .map((m) => {
            const tail = text
              .slice(m.index! + m[0].length)
              .match(/^\s*[（(][^）)\n]*[）)]/);
            return m[0] + (tail?.[0] || "");
          })
          .join(",");
    let weeks: number[] = [];
    try {
      weeks = parseSchoolWeeks(weekText);
    } catch (e) {
      warnings.push((e as Error).message);
    }
    if (weekMatches.length > 1)
      warnings.push("存在多段周次信息，请核对是否属于多门课程或多个上课安排");
    const explicit = text.match(
      /(?:第|节次[:：]?)?\s*(\d{1,2})\s*(?:[-—－~～至,，]\s*(\d{1,2}))?\s*节/,
    );
    const slot = explicit
      ? [Number(explicit[1]), Number(explicit[2] || explicit[1])]
      : range;
    let name = read("课程名称|课程|科目");
    let teacher = read("任课教师|教师");
    let room = read("教室|地点|教学楼");
    const kind =
      read("课程类型|类型") || /军训|劳动实践|线上|实践/.exec(text)?.[0] || "";
    const residual = b
      .filter(
        (l) =>
          !/^(?:课程(?:名称)?|科目|教师|任课教师|教室|地点|教学楼|周次|上课周次|节次|类型|课程类型)\s*[:：]/.test(
            l,
          ),
      )
      .map((l) =>
        l
          .replace(new RegExp(weekExpression.source, "g"), "")
          .replace(/(?:第\s*)?\d+(?:[-—－~～至,，]\d+)?\s*节/g, "")
          .trim(),
      )
      .filter(Boolean);
    // 常见打印记号：课程名★教师@教室。没有明确标记的元数据不猜测。
    const marked = residual.join("").match(/^(.+?)[★☆]([^@★☆]*)(?:@(.+))?$/);
    if (marked) {
      name ||= marked[1].trim();
      teacher ||= marked[2].trim();
      room ||= marked[3]?.trim() || "";
    }
    if (!name) {
      name = residual
        .filter((l) => !/^[@★☆]/.test(l))
        .join(" ")
        .slice(0, 80);
      if (residual.length > 1 && !marked)
        warnings.push("无字段标签，课程名或教师教室可能混合，请对照原文修改");
    }
    if (!name) {
      name = "待确认课程";
      warnings.push("未识别课程名称");
    }
    if (!teacher) warnings.push("任课教师待确认");
    if (!room) warnings.push("上课地点待确认");
    if (!day || !slot) warnings.push("没有可靠的星期或节次，保留为待确认课程");
    if (range && range[0] === range[1] && !explicit && !rangeReliable)
      warnings.push("仅定位到单节行，跨节范围需对照 PDF 核对");
    if (weekMatches.length > 1)
      warnings.push("可能包含多个不同安排，请复制拆分后分别确认星期节次");
    return {
      id: `${source}-${index}`,
      name,
      teacher,
      room,
      day: weekMatches.length > 1 ? null : day,
      start: slot?.[0] ?? null,
      end:
        !rangeReliable && !explicit && range?.[0] === range?.[1]
          ? null
          : (slot?.[1] ?? null),
      weeks,
      weekText,
      kind,
      raw: text,
      warnings,
      include: true,
    };
  });
}
export function parsePdfPages(pages: PdfPageText[]): ImportResult {
  const result: ImportResult = {
    source: "北京农学院 PDF",
    candidates: [],
    warnings: [],
    pages: pages.length,
  };
  for (const page of pages) {
    const items = page.items.filter((b) => clean(b.text));
    const all = lines(items).join("\n");
    const term = all.match(
      /(20\d{2})\s*[-—－–]\s*(20\d{2})\s*学年\s*(?:第\s*)?([12一二])\s*(?:学期)/,
    );
    if (term) {
      const label = `${term[1]}—${term[2]} 第 ${term[3] === "一" ? "1" : term[3] === "二" ? "2" : term[3]} 学期`;
      if (result.termLabel && result.termLabel !== label)
        result.warnings.push("文件中存在不同学期，请分别导入并核对");
      else result.termLabel = label;
    }
    // 先合并同一行中被逐字拆分的表头，再寻找七列中心。
    const headerItems = items.map((b) => ({
      ...b,
      text: b.text.replace(/\s/g, ""),
    }));
    const possibleY = [
      ...new Set(
        headerItems
          .filter((b) => /星期|周|[一二三四五六日天]/.test(b.text))
          .map((b) => Math.round(b.y)),
      ),
    ];
    let headers: { day: number; x: number; y: number }[] = [];
    for (const y of possibleY) {
      const row = headerItems
        .filter((b) => Math.abs(b.y - y) < 5)
        .sort((a, b) => a.x - b.x);
      const found: { day: number; x: number; y: number }[] = [];
      for (let i = 0; i < row.length; i++) {
        let text = "",
          group: TextBox[] = [];
        for (let j = i; j < Math.min(row.length, i + 5); j++) {
          if (j > i && row[j].x - (row[j - 1].x + row[j - 1].width) > 15) break;
          group.push(row[j]);
          text += row[j].text;
          const m = text.match(/^(?:星期|周)([一二三四五六日天])$/);
          if (m) {
            found.push({
              day: m[1] === "天" ? 7 : cn.indexOf(m[1]) + 1,
              x:
                (group[0].x +
                  group[group.length - 1].x +
                  group[group.length - 1].width) /
                2,
              y,
            });
            break;
          }
        }
      }
      if (new Set(found.map((f) => f.day)).size === 7) {
        headers = found.sort((a, b) => a.day - b.day);
        break;
      }
    }
    if (!headers.length) {
      result.warnings.push(
        `第 ${page.page} 页未找到完整七天表头，未猜测课程时间。`,
      );
      // 排除个人信息与页眉；保留课程相关内容，不把姓名学号写入课表。
      const relevant = lines(items).filter(
        (l) =>
          !/姓名|学号|班级|专业|打印时间|北京农学院|学年.*学期|课程表|第\s*\d+\s*页/.test(
            l,
          ),
      );
      if (relevant.length)
        result.candidates.push(
          ...parseCell(
            relevant.join("\n"),
            null,
            null,
            `p${page.page}-unknown`,
          ),
        );
      continue;
    }
    const gap = (headers[6].x - headers[0].x) / 6;
    if (gap <= 0 || headers.some((h, i) => i > 0 && h.x <= headers[i - 1].x)) {
      result.warnings.push(`第 ${page.page} 页表头位置异常，保留原文待确认`);
      const raw = lines(
        items.filter(
          (b) =>
            b.y > headers[0].y + 12 &&
            !/姓名|学号|班级|专业|打印时间/.test(b.text),
        ),
      ).join("\n");
      if (raw)
        result.candidates.push(
          ...parseCell(raw, null, null, `p${page.page}-ambiguous`),
        );
      continue;
    }
    const left = headers[0].x - gap / 2,
      right = headers[6].x + gap / 2;
    const footerY = items
      .filter(
        (b) =>
          /^(?:其他课程|其它课程|实践课程|备注|说明)[:：]?$/.test(
            b.text.trim(),
          ) && b.y > headers[0].y,
      )
      .reduce((n, b) => Math.min(n, b.y), Infinity);
    const rowLabels = items
      .filter((b) => b.x + b.width < left + 3 && b.y > headers[0].y + 6)
      .map((b) => {
        const m = b.text
          .replace(/\s/g, "")
          .match(/^(?:第)?(\d{1,2})(?:[-—－~～至,，](\d{1,2}))?(?:节)?$/);
        return m && Number(m[1]) >= 1 && Number(m[2] || m[1]) <= 20
          ? { ...b, first: Number(m[1]), last: Number(m[2] || m[1]) }
          : null;
      })
      .filter((v): v is NonNullable<typeof v> => !!v)
      .sort((a, b) => a.y - b.y);
    // 时间轴旁其他数字可能是页码；只接受连续递增的节次列。
    const rows: typeof rowLabels = [];
    for (const row of rowLabels) {
      if (
        (!rows.length && row.first === 1) ||
        (rows.length &&
          row.first === rows[rows.length - 1].last + 1 &&
          Math.abs(row.x - rows[0].x) < 20)
      )
        rows.push(row);
    }
    if (!rows.length)
      result.warnings.push(
        `第 ${page.page} 页未定位节次列，所有课程保留待确认。`,
      );
    const cells = new Map<
      string,
      {
        boxes: TextBox[];
        day: number;
        range: [number, number] | null;
        reliable: boolean;
      }
    >();
    const outside: TextBox[] = [];
    for (const b of items) {
      const x = b.x + Math.min(b.width, gap * 0.8) / 2,
        y = b.y + b.height / 2;
      if (y <= headers[0].y + 12) continue;
      if (x < left || x > right) {
        if (
          !/^(?:第?\d{1,2}(?:[-—－~～至,，]\d{1,2})?节?|(?:[01]?\d|2[0-3])[:：][0-5]\d|上午|下午|晚上|早晨|中午)$/.test(
            b.text.replace(/\s/g, ""),
          ) &&
          !/姓名|学号|班级|专业|打印时间|第\s*\d+\s*页/.test(b.text)
        )
          outside.push(b);
        continue;
      }
      if (b.y >= footerY) {
        outside.push(b);
        continue;
      }
      if (/姓名|学号|打印时间|第\s*\d+\s*页/.test(b.text)) continue;
      if (
        /^(?:其他课程|其它课程|实践课程|备注|说明)[:：]?$/.test(b.text.trim())
      ) {
        outside.push(b);
        continue;
      }
      const day = headers.reduce((best, h) =>
        Math.abs(h.x - x) < Math.abs(best.x - x) ? h : best,
      ).day;
      let row = -1;
      if (rows.length) {
        const firstTop = headers[0].y + 18;
        const lastBottom =
          rows.length > 1
            ? rows.at(-1)!.y + (rows.at(-1)!.y - rows.at(-2)!.y) / 2
            : page.height * 0.9;
        if (y >= firstTop && y < lastBottom) {
          row = rows.findIndex(
            (r, i) =>
              y <
              (i === rows.length - 1 ? lastBottom : (r.y + rows[i + 1].y) / 2),
          );
        }
      }
      if (row < 0) {
        outside.push(b);
        continue;
      }
      let reliable = false;
      let key = `${day}:${row}`,
        range: [number, number] = [rows[row].first, rows[row].last];
      const center = headers[day - 1].x;
      const boundaries = [
        ...new Set(
          (page.horizontalLines || [])
            .filter(
              (l) =>
                l.x1 <= center && l.x2 >= center && l.y > headers[0].y + 12,
            )
            .map((l) => Math.round(l.y)),
        ),
      ].sort((a, b) => a - b);
      const top = boundaries.filter((v) => v < y).at(-1),
        bottom = boundaries.find((v) => v > y);
      if (top !== undefined && bottom !== undefined) {
        const covered = rows.filter(
          (r) => r.y + r.height / 2 > top && r.y + r.height / 2 < bottom,
        );
        if (covered.length) {
          range = [covered[0].first, covered.at(-1)!.last];
          reliable = true;
          key = `${day}:${top}:${bottom}`;
        }
      }
      const cell = cells.get(key) || { day, range, reliable, boxes: [] };
      cell.boxes.push(b);
      cells.set(key, cell);
    }
    for (const [key, cell] of cells) {
      // 按单元格坐标逐行组合；不依赖 PDF TextContent 的返回顺序。
      const raw = lines(cell.boxes).join("\n");
      result.candidates.push(
        ...parseCell(
          raw,
          cell.day,
          cell.range,
          `p${page.page}-${key}`,
          cell.reliable,
        ),
      );
    }
    if (outside.length) {
      const raw = lines(outside)
        .filter(
          (l) => !/^(其他课程|其它课程|实践课程|备注|说明)[:：]?$/.test(l),
        )
        .join("\n");
      if (raw)
        result.candidates.push(
          ...parseCell(raw, null, null, `p${page.page}-other`),
        );
    }
  }
  // 跨页重复的表格项由导入层按完整语义去重，不仅按名称去重。
  if (!result.candidates.length)
    result.warnings.push(
      "没有可提取的课程文本。扫描件、加密文件或不兼容版式需另存为可复制文字的 PDF，或手动录入。",
    );
  if (!result.termLabel)
    result.warnings.push("学年学期未识别，请手动确认；不会推测开学日期。");
  return result;
}
