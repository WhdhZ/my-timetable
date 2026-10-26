export type Period = { start: string; end: string };
export type Course = {
  id: string;
  name: string;
  room: string;
  teacher: string;
  day: number;
  start: number;
  end: number;
  weeks: number[];
  color: string;
  demo?: boolean;
  kind?: string;
  source?: string;
  sourceText?: string;
};
export type OtherCourse = {
  id: string;
  name: string;
  room: string;
  teacher: string;
  weeks: number[];
  weekText: string;
  kind: string;
  raw: string;
  reason: string;
  day?: number;
  start?: number;
  end?: number;
};
export type Data = {
  version: 1;
  termLabel?: string;
  otherCourses?: OtherCourse[];
  semester: string;
  totalWeeks: number;
  periods: Period[];
  courses: Course[];
  theme: "system" | "light" | "dark";
};
export const colors = ["sage", "blue", "peach", "lavender", "sand", "rose"];
export const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function parseDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
export function monday(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7));
}
// 用日历日的 UTC 序号消除夏令时对教学周计算的影响。
function ordinal(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
}
export function teachingWeek(date: Date, start: string): number {
  return (
    Math.floor((ordinal(date) - ordinal(monday(parseDate(start)))) / 7) + 1
  );
}
export function active(c: Course, week: number): boolean {
  return c.weeks.includes(week);
}
export function parseWeeks(input: string, total: number): number[] {
  const result = new Set<number>();
  if (!input.trim()) throw Error("请填写上课周次");
  for (const part of input.replaceAll("，", ",").split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw Error("周次格式示例：1-8,10,12-16");
    const first = Number(match[1]),
      last = Number(match[2] ?? match[1]);
    if (first < 1 || last > total || first > last)
      throw Error(`周次须在 1 至 ${total} 之间，且范围不能倒置`);
    for (let w = first; w <= last; w++) result.add(w);
  }
  return [...result].sort((a, b) => a - b);
}
export function selectWeeks(
  input: string,
  total: number,
  mode: string,
): number[] {
  return parseWeeks(input, total).filter((w) =>
    mode === "odd" ? w % 2 === 1 : mode === "even" ? w % 2 === 0 : true,
  );
}
export function conflicts(a: Course, b: Course): boolean {
  return (
    a.id !== b.id &&
    a.day === b.day &&
    a.start <= b.end &&
    b.start <= a.end &&
    a.weeks.some((w) => b.weeks.includes(w))
  );
}
export function defaultData(): Data {
  return {
    version: 1,
    semester: dateKey(monday(new Date(new Date().getFullYear(), 8, 1))),
    totalWeeks: 20,
    periods: [
      "08:00",
      "08:55",
      "10:00",
      "10:55",
      "14:00",
      "14:55",
      "16:00",
      "16:55",
      "19:00",
      "19:55",
    ].map((start) => {
      const [h, m] = start.split(":").map(Number);
      const n = h * 60 + m + 45;
      return {
        start,
        end: `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`,
      };
    }),
    courses: [],
    theme: "system",
  };
}
export function validateData(value: unknown): Data {
  if (!value || typeof value !== "object") throw Error("备份文件不是有效课表");
  const d = value as Data;
  if (d.version !== 1) throw Error("不支持此备份版本，请使用版本 1 的备份");
  if (
    typeof d.semester !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(d.semester) ||
    dateKey(parseDate(d.semester)) !== d.semester
  )
    throw Error("学期日期无效");
  if (!Number.isInteger(d.totalWeeks) || d.totalWeeks < 1 || d.totalWeeks > 60)
    throw Error("学期周数应为 1–60");
  if (!["system", "light", "dark"].includes(d.theme))
    throw Error("外观设置无效");
  if (
    !Array.isArray(d.periods) ||
    d.periods.length < 1 ||
    d.periods.length > 20
  )
    throw Error("节次应为 1–20 节");
  let previous = "";
  for (const p of d.periods) {
    if (
      !p ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.start) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.end) ||
      p.start >= p.end ||
      p.start < previous
    )
      throw Error("节次时间必须递增且不能重叠");
    previous = p.end;
  }
  if (!Array.isArray(d.courses) || d.courses.length > 2000)
    throw Error("课程数量无效或超过 2000 门");
  const ids = new Set<string>();
  for (const c of d.courses) {
    if (
      !c ||
      typeof c.id !== "string" ||
      !c.id ||
      ids.has(c.id) ||
      typeof c.name !== "string" ||
      !c.name.trim() ||
      c.name.length > 80 ||
      typeof c.room !== "string" ||
      c.room.length > 100 ||
      typeof c.teacher !== "string" ||
      c.teacher.length > 80 ||
      !colors.includes(c.color) ||
      !Number.isInteger(c.day) ||
      c.day < 1 ||
      c.day > 7 ||
      !Number.isInteger(c.start) ||
      !Number.isInteger(c.end) ||
      c.start < 1 ||
      c.end < c.start ||
      c.end > d.periods.length ||
      !Array.isArray(c.weeks) ||
      !c.weeks.length ||
      c.weeks.some((w) => !Number.isInteger(w) || w < 1 || w > d.totalWeeks) ||
      (c.demo !== undefined && typeof c.demo !== "boolean")
    )
      throw Error("存在无效的课程信息，请检查课程、节次和周次");
    ids.add(c.id);
  }
  if (
    d.termLabel !== undefined &&
    (typeof d.termLabel !== "string" || d.termLabel.length > 100)
  )
    throw Error("学期名称无效");
  if (d.otherCourses !== undefined) {
    if (
      !Array.isArray(d.otherCourses) ||
      d.otherCourses.length + d.courses.length > 2000
    )
      throw Error("课程数量超过上限");
    for (const c of d.otherCourses) {
      if (
        !c ||
        typeof c.id !== "string" ||
        !c.id ||
        ids.has(c.id) ||
        typeof c.name !== "string" ||
        !c.name.trim() ||
        c.name.length > 80 ||
        ["room", "teacher", "weekText", "kind", "raw", "reason"].some(
          (k) => typeof c[k as keyof OtherCourse] !== "string",
        ) ||
        c.raw.length > 20000 ||
        c.room.length > 100 ||
        c.teacher.length > 80 ||
        c.weekText.length > 500 ||
        c.kind.length > 100 ||
        c.reason.length > 2000 ||
        !Array.isArray(c.weeks) ||
        c.weeks.some((w) => !Number.isInteger(w) || w < 1 || w > 60) ||
        [c.day, c.start, c.end].some(
          (v) => v !== undefined && (!Number.isInteger(v) || v < 1 || v > 20),
        ) ||
        (c.day !== undefined && c.day > 7)
      )
        throw Error("待确认课程格式无效");
      ids.add(c.id);
    }
  }
  for (const c of d.courses)
    if (
      (c.kind !== undefined &&
        (typeof c.kind !== "string" || c.kind.length > 100)) ||
      (c.source !== undefined &&
        (typeof c.source !== "string" || c.source.length > 200))
    )
      throw Error("课程来源或类型无效");
  for (const c of d.courses)
    if (
      c.sourceText !== undefined &&
      (typeof c.sourceText !== "string" || c.sourceText.length > 20000)
    )
      throw Error("课程原文超出限制");
  return d;
}
export function demoCourses(total: number): Course[] {
  const items: [string, string, string, number, number, number, string][] = [
    ["高等数学", "理科楼 A203", "陈老师", 1, 1, 2, "sage"],
    ["大学英语", "博学楼 B305", "林老师", 1, 3, 4, "blue"],
    ["设计与生活", "艺术楼 102", "许老师", 1, 7, 8, "peach"],
    ["线性代数", "理科楼 A205", "周老师", 2, 3, 4, "lavender"],
    ["大学物理", "理科楼 C101", "王老师", 3, 1, 2, "sand"],
    ["高等数学", "理科楼 A203", "陈老师", 3, 5, 6, "sage"],
    ["大学英语", "博学楼 B305", "林老师", 4, 3, 4, "blue"],
    ["体育 · 羽毛球", "体育馆 2 号场", "李老师", 4, 7, 8, "rose"],
    ["计算机基础", "实验楼 402", "赵老师", 5, 1, 2, "lavender"],
  ];
  return items.map(([name, room, teacher, day, start, end, color]) => ({
    id: crypto.randomUUID(),
    name,
    room,
    teacher,
    day,
    start,
    end,
    color,
    weeks: Array.from({ length: total }, (_, i) => i + 1),
    demo: true,
  }));
}
