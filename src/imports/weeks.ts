/** 每个逗号分段独立应用单双周，绝不把一个分段的规则扩散到整句。 */
export function parseSchoolWeeks(value: string, limit = 60): number[] {
  const input = value
    .replace(/[（【]/g, "(")
    .replace(/[）】]/g, ")")
    .replace(/[，、；;]/g, ",")
    .replace(/[－—–~～至]/g, "-")
    .replace(/\s/g, "")
    .replace(/^(?:上课)?周次[:：]?/, "");
  if (!input) throw Error("未识别到上课周次");
  const weeks = new Set<number>();
  for (const segment of input.split(",")) {
    const match = segment.match(
      /^(\d+)(?:-(\d+))?周?(?:\(([单双])周?\)|([单双])周?)?$/,
    );
    if (!match) throw Error(`无法确认周次「${segment}」，请手动核对`);
    const first = Number(match[1]),
      last = Number(match[2] || match[1]),
      parity = match[3] || match[4];
    if (first < 1 || last < first || last > limit)
      throw Error(`周次必须在 1–${limit} 之间`);
    for (let w = first; w <= last; w++)
      if (!parity || (parity === "单" ? w % 2 === 1 : w % 2 === 0))
        weeks.add(w);
  }
  if (!weeks.size) throw Error("周次筛选结果为空");
  return [...weeks].sort((a, b) => a - b);
}
export const weekExpression =
  /\d+(?:\s*[-－—–~～至]\s*\d+)?\s*周(?:\s*[（(][单双]周?[）)])?(?:\s*[,，、]\s*\d+(?:\s*[-－—–~～至]\s*\d+)?\s*周?(?:\s*[（(][单双]周?[）)])?)*/g;
