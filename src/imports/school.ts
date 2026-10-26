import type { ImportCandidate, ImportResult, TimetableSource } from "./types";
import { parseSchoolWeeks } from "./weeks";
import {
  extractSchoolRows,
  MAX_SCHOOL_BYTES,
  type SchoolRow,
  type SchoolValue,
} from "./schoolPayload";
const text = (v: SchoolValue | undefined) =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
const normalized = (v: string) =>
  v
    .normalize("NFKC")
    .replace(/[－—–~～至]/g, "-")
    .replace(/\s/g, "");
function weekday(row: SchoolRow, warnings: string[]): number | null {
  const n = text(row.xqj),
    name = normalized(text(row.xqjmc));
  const numeric = /^[1-7]$/.test(n) ? Number(n) : null;
  const m = name.match(/^(?:星期|周|礼拜)([一二三四五六日天])$/);
  const named = m
    ? m[1] === "天"
      ? 7
      : "一二三四五六日".indexOf(m[1]) + 1
    : null;
  if (numeric && named && numeric !== named) {
    warnings.push("xqj 与 xqjmc 星期冲突，请对照学校页面");
    return null;
  }
  if (!numeric && !named) warnings.push("没有可靠的星期信息，未猜测星期");
  return numeric || named;
}
function slots(value: SchoolValue | undefined): number[] | null {
  if (Array.isArray(value))
    return value.length && value.every((n) => n >= 1 && n <= 20)
      ? [...new Set(value)].sort((a, b) => a - b)
      : null;
  if (typeof value !== "string") return null;
  const s = normalized(value);
  const hasUnit = s.includes("节");
  const bare = s.replace(/^第/, "").replace(/节$/, "");
  // 0102、纯数字 jc / jcs 可能是编码、序号或课时数，不能推测。
  if (/^\d+$/.test(bare) && !hasUnit) return null;
  if (!/^[\d,，、-]+$/.test(bare)) return null;
  const out = new Set<number>();
  for (const part of bare.replace(/[，、]/g, ",").split(",")) {
    const m = part.match(/^([1-9]\d?)(?:-([1-9]\d?))?$/);
    if (!m) return null;
    const a = Number(m[1]),
      b = Number(m[2] || m[1]);
    if (a > b || b > 20) return null;
    for (let p = a; p <= b; p++) out.add(p);
  }
  return [...out].sort((a, b) => a - b);
}
function ranges(periods: number[]): [number, number][] {
  const result: [number, number][] = [];
  for (const p of periods) {
    const last = result.at(-1);
    if (last && last[1] + 1 === p) last[1] = p;
    else result.push([p, p]);
  }
  return result;
}
function periods(
  row: SchoolRow,
  warnings: string[],
): [number | null, number | null][] {
  const a = slots(row.jcs),
    b = slots(row.jc);
  if (a && b && JSON.stringify(a) !== JSON.stringify(b)) {
    warnings.push("jcs 与 jc 节次冲突，未自行选择");
    return [[null, null]];
  }
  const known = a || b;
  if (known) return ranges(known);
  warnings.push("节次缺失或仅有未确认的数字编码，请填写真实开始和结束节次");
  return [[null, null]];
}
function weekText(row: SchoolRow, warnings: string[]): string {
  const v = row.zcd;
  if (
    Array.isArray(v) &&
    v.length &&
    v.every((w) => Number.isInteger(w) && w >= 1 && w <= 60)
  )
    return [...new Set(v)].sort((a, b) => a - b).join(",") + "周";
  if (typeof v !== "string") {
    warnings.push("zcd 不是明确周次文字；不解码数字位掩码");
    return "";
  }
  const s = normalized(v);
  if (/^\d+$/.test(s)) {
    warnings.push("zcd 仅含数字，无法确认是周次还是位掩码；请对照页面补全");
    return "";
  }
  try {
    parseSchoolWeeks(s);
    return s;
  } catch (e) {
    warnings.push((e as Error).message);
    return s;
  }
}
export function parseSchoolJson(payload: unknown): ImportResult {
  const p = payload as Record<string, unknown> | null;
  if (
    p &&
    typeof p === "object" &&
    typeof p.format === "string" &&
    p.format.startsWith("mytimetable.") &&
    (p.format !== "mytimetable.school-json" || p.version !== 1)
  )
    throw Error("不是支持的教务 JSON 文件。MyTimetable 备份请使用“从备份恢复”");
  const rows = extractSchoolRows(payload);
  if (!rows.length)
    throw Error(
      "没有找到课程记录（kcmc）。请复制 JSON 响应正文，不要复制请求、HAR 或 cURL",
    );
  const candidates: ImportCandidate[] = [];
  rows.forEach((row, i) => {
    const warnings: string[] = [];
    const day = weekday(row, warnings),
      week = weekText(row, warnings),
      times = periods(row, warnings);
    let weeks: number[] = [];
    try {
      weeks = parseSchoolWeeks(week);
    } catch {
      /* 待确认课程原文仍保留 */
    }
    const name = text(row.kcmc),
      room = text(row.cdmc),
      teacher = text(row.jsxm);
    if (!name) warnings.push("课程名称缺失");
    if (!room) warnings.push("地点未提供");
    if (!teacher) warnings.push("教师未提供");
    // raw 也只能是白名单字段，禁止把原始学校响应（可能含身份信息）持久化。
    const raw = JSON.stringify(row, null, 2);
    times.forEach(([start, end], j) =>
      candidates.push({
        id: `school-${i}-${j}`,
        name: name || "待确认课程",
        room,
        teacher,
        day,
        start,
        end,
        weeks,
        weekText: week,
        kind: /军训|劳动实践|线上|实践/.exec(name)?.[0] || "",
        raw,
        warnings: [...warnings],
        include: true,
      }),
    );
  });
  const termLabel =
    p &&
    p.format === "mytimetable.school-json" &&
    typeof p.termLabel === "string" &&
    p.termLabel.length <= 100
      ? p.termLabel
      : undefined;
  return {
    source: "教务页面 JSON（本地导入）",
    candidates,
    termLabel,
    pages: 0,
    warnings: [
      "请确认学校页面查询的是完整学期；按周查询的响应可能只含部分课程。",
      "已过滤非课程字段；不会改变本机开学日期或节次钟点。",
    ],
  };
}
export function parseSchoolJsonText(value: string): ImportResult {
  if (new TextEncoder().encode(value).length > MAX_SCHOOL_BYTES)
    throw Error("教务 JSON 不能超过 2 MB，请只复制课程查询响应");
  let json: unknown;
  try {
    json = JSON.parse(value.replace(/^\uFEFF/, ""));
  } catch {
    throw Error("JSON 格式无效，请复制响应正文或选择扩展导出的 JSON 文件");
  }
  return parseSchoolJson(json);
}
export const schoolJsonSource: TimetableSource = {
  id: "school-json",
  async parse(file, signal) {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    if (file.size > MAX_SCHOOL_BYTES) throw Error("教务 JSON 不能超过 2 MB");
    const result = parseSchoolJsonText(await file.text());
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    return result;
  },
};
