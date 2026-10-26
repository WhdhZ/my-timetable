import {
  colors,
  validateData,
  type Course,
  type Data,
  type OtherCourse,
} from "../domain";
import { parseSchoolWeeks } from "./weeks";
import type { ImportCandidate, ImportResult } from "./types";
const norm = (v: string) => v.replace(/\s/g, "").normalize("NFKC");
export function courseKey(
  c: Pick<
    Course,
    "name" | "room" | "teacher" | "day" | "start" | "end" | "weeks"
  > & { kind?: string },
): string {
  return JSON.stringify([
    norm(c.name),
    norm(c.room),
    norm(c.teacher),
    c.day,
    c.start,
    c.end,
    [...new Set(c.weeks)].sort((a, b) => a - b),
    norm(c.kind || ""),
  ]);
}
const otherKey = (c: OtherCourse) =>
  JSON.stringify([
    norm(c.name),
    norm(c.room),
    norm(c.teacher),
    c.weeks,
    c.day,
    c.start,
    c.end,
    norm(c.kind),
    norm(c.weekText),
    norm(c.raw),
  ]);
export function candidateIssues(c: ImportCandidate, data: Data): string[] {
  const issues: string[] = [];
  if (!c.name.trim() || c.name === "待确认课程") issues.push("课程名称待确认");
  if (!c.day || c.day < 1 || c.day > 7) issues.push("星期待确认");
  if (!c.start || !c.end || c.start < 1 || c.end < c.start)
    issues.push("节次待确认");
  else if (c.end > data.periods.length)
    issues.push(
      `节次超出当前 ${data.periods.length} 节配置，请先在设置中补充真实时间`,
    );
  try {
    const weeks = parseSchoolWeeks(c.weekText);
    if (weeks.some((w) => w > data.totalWeeks))
      issues.push("周次超出当前学期周数");
  } catch (e) {
    issues.push((e as Error).message);
  }
  return issues;
}
export function prepareImport(
  data: Data,
  result: ImportResult,
  rows: ImportCandidate[],
  mode: "merge" | "replace",
  termLabel: string,
): { data: Data; added: number; pending: number; duplicates: number } {
  const courses = mode === "merge" ? [...data.courses] : [];
  const others = mode === "merge" ? [...(data.otherCourses || [])] : [];
  const seen = new Set(courses.map(courseKey)),
    seenOthers = new Set(others.map(otherKey));
  const colorMap = new Map(data.courses.map((c) => [norm(c.name), c.color]));
  let added = 0,
    pending = 0,
    duplicates = 0;
  for (const row of rows.filter((c) => c.include)) {
    let weeks: number[] = [];
    try {
      weeks = parseSchoolWeeks(row.weekText);
    } catch {
      /* 未确认的原文保留在其他课程 */
    }
    const issues = candidateIssues(row, data);
    const name = row.name.trim() || "待确认课程";
    if (issues.length) {
      const other: OtherCourse = {
        id: crypto.randomUUID(),
        name,
        room: row.room.trim(),
        teacher: row.teacher.trim(),
        weeks,
        weekText: row.weekText,
        kind: row.kind,
        raw: row.raw,
        reason: issues.join("；"),
        ...(row.day ? { day: row.day } : {}),
        ...(row.start ? { start: row.start } : {}),
        ...(row.end ? { end: row.end } : {}),
      };
      const key = otherKey(other);
      if (seenOthers.has(key)) {
        duplicates++;
        continue;
      }
      seenOthers.add(key);
      others.push(other);
      pending++;
    } else {
      const existingColor = colorMap.get(norm(name));
      const color =
        existingColor ||
        colors[
          [...norm(name)].reduce(
            (n, ch) => (n + ch.codePointAt(0)!) % colors.length,
            0,
          )
        ];
      colorMap.set(norm(name), color);
      const course: Course = {
        id: crypto.randomUUID(),
        name,
        room: row.room.trim(),
        teacher: row.teacher.trim(),
        day: row.day!,
        start: row.start!,
        end: row.end!,
        weeks,
        color,
        kind: row.kind,
        source: result.source,
        sourceText: row.raw,
      };
      const key = courseKey(course);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      courses.push(course);
      added++;
    }
  }
  const next = validateData({
    ...data,
    courses,
    otherCourses: others,
    termLabel: termLabel.trim() || data.termLabel,
  });
  return { data: next, added, pending, duplicates };
}
export function pendingCandidate(c: OtherCourse): ImportCandidate {
  return {
    id: c.id,
    name: c.name,
    room: c.room,
    teacher: c.teacher,
    weekText: c.weekText,
    weeks: c.weeks,
    day: c.day ?? null,
    start: c.start ?? null,
    end: c.end ?? null,
    kind: c.kind,
    raw: c.raw,
    warnings: [c.reason],
    include: true,
  };
}
