/** 来源适配器只产出候选数据，持久化与界面不依赖 PDF。未来授权接口可实现此接口。 */
export interface ImportCandidate {
  id: string;
  name: string;
  room: string;
  teacher: string;
  day: number | null;
  start: number | null;
  end: number | null;
  weeks: number[];
  weekText: string;
  kind: string;
  raw: string;
  warnings: string[];
  include: boolean;
}
export interface ImportResult {
  source: string;
  termLabel?: string;
  candidates: ImportCandidate[];
  warnings: string[];
  pages: number;
}
export interface TimetableSource {
  id: string;
  parse(file: File, signal?: AbortSignal): Promise<ImportResult>;
}
export interface TextBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PdfPageText {
  horizontalLines?: import("./geometry").HorizontalLine[];
  width: number;
  height: number;
  items: TextBox[];
  page: number;
}
