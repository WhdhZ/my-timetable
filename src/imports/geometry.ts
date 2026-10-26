export interface HorizontalLine {
  x1: number;
  x2: number;
  y: number;
}
type Matrix = number[];
const identity = () => [1, 0, 0, 1, 0, 0];
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
/** PDF.js 6 的 DrawOPS 路径流。只使用可靠的直线，曲线/文字不当作表格。 */
export function extractHorizontalLines(
  fns: number[],
  args: unknown[][],
  ops: {
    save: number;
    restore: number;
    transform: number;
    constructPath: number;
  },
  viewport: number[],
): HorizontalLine[] {
  const lines: HorizontalLine[] = [];
  let ctm = identity();
  const stack: Matrix[] = [];
  for (let n = 0; n < fns.length; n++) {
    const a = args[n];
    if (fns[n] === ops.save) {
      stack.push([...ctm]);
      continue;
    }
    if (fns[n] === ops.restore) {
      ctm = stack.pop() || identity();
      continue;
    }
    if (fns[n] === ops.transform) {
      ctm = multiply(ctm, a as number[]);
      continue;
    }
    if (fns[n] !== ops.constructPath) continue;
    const data = (a[1] as unknown[])?.[0];
    if (!data || !(Array.isArray(data) || ArrayBuffer.isView(data))) continue;
    const path = data as unknown as number[];
    const matrix = multiply(viewport, ctm);
    const point = (x: number, y: number) => [
      matrix[0] * x + matrix[2] * y + matrix[4],
      matrix[1] * x + matrix[3] * y + matrix[5],
    ];
    let prev: number[] | null = null,
      start: number[] | null = null;
    const line = (to: number[]) => {
      if (
        prev &&
        Math.abs(prev[1] - to[1]) < 0.8 &&
        Math.abs(prev[0] - to[0]) > 15
      )
        lines.push({
          x1: Math.min(prev[0], to[0]),
          x2: Math.max(prev[0], to[0]),
          y: (prev[1] + to[1]) / 2,
        });
      prev = to;
    };
    for (let i = 0; i < path.length;) {
      const op = path[i++];
      if (op === 0) {
        prev = point(path[i++], path[i++]);
        start = prev;
      } else if (op === 1) {
        line(point(path[i++], path[i++]));
      } else if (op === 2) {
        i += 6;
        prev = null;
      } else if (op === 3) {
        i += 4;
        prev = null;
      } else if (op === 4) {
        if (start) line(start);
      } else break;
    }
  }
  return lines;
}
