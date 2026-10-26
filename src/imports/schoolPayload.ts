/** 与本地扩展共享的严格白名单；不保留姓名、学号、账号、请求 URL 或认证字段。 */
export const SCHOOL_FIELDS = [
  "kcmc",
  "cdmc",
  "jcs",
  "jc",
  "xqj",
  "xqjmc",
  "zcd",
  "jsxm",
] as const;
export type SchoolField = (typeof SCHOOL_FIELDS)[number];
export type SchoolValue = string | number | number[];
export type SchoolRow = Partial<Record<SchoolField, SchoolValue>>;
export interface SchoolPackage {
  format: "mytimetable.school-json";
  version: 1;
  rows: SchoolRow[];
  termLabel?: string;
}
export const MAX_SCHOOL_BYTES = 2 * 1024 * 1024;
export function extractSchoolRows(input: unknown): SchoolRow[] {
  const result: SchoolRow[] = [];
  const seen = new WeakSet<object>();
  let nodes = 0;
  function walk(value: unknown, depth: number) {
    if (!value || typeof value !== "object") return;
    if (++nodes > 20000 || depth > 16)
      throw Error("数据层级或节点过多，请只复制课表查询响应正文");
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    const obj = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(obj, "kcmc")) {
      const row: SchoolRow = {};
      for (const key of SCHOOL_FIELDS) {
        const v = obj[key];
        if (typeof v === "string") {
          if (v.length > 500)
            throw Error("课程字段过长，请检查是否选择了正确的课表 JSON");
          row[key] = v;
        } else if (typeof v === "number" && Number.isFinite(v)) row[key] = v;
        else if (
          ["jcs", "jc", "zcd"].includes(key) &&
          Array.isArray(v) &&
          v.length <= 60 &&
          v.every((n) => typeof n === "number" && Number.isInteger(n))
        )
          row[key] = [...v];
      }
      if (!("kcmc" in row)) row.kcmc = ""; // 不丢弃缺名称或字段损坏的课程记录。
      result.push(row);
      if (result.length > 2000)
        throw Error("超过 2000 项课程，未截断导入，请缩小响应范围");
      return;
    }
    for (const v of Object.values(obj)) walk(v, depth + 1);
  }
  walk(input, 0);
  return result;
}
export function createSchoolPackage(
  input: unknown,
  termLabel = "",
): SchoolPackage {
  const rows = extractSchoolRows(input);
  if (!rows.length)
    throw Error(
      "没有找到含 kcmc 字段的课程记录，请选择课表查询的 JSON 响应正文",
    );
  return {
    format: "mytimetable.school-json",
    version: 1,
    rows,
    ...(termLabel.trim() ? { termLabel: termLabel.trim().slice(0, 100) } : {}),
  };
}
