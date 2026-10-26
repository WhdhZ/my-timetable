import {
  getDocument,
  GlobalWorkerOptions,
  Util,
  OPS,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { extractHorizontalLines } from "./geometry";
import { parsePdfPages } from "./parser";
import type { PdfPageText, TimetableSource } from "./types";
GlobalWorkerOptions.workerSrc = workerUrl;
export const pdfSource: TimetableSource = {
  id: "bua-pdf",
  async parse(file, signal) {
    if (file.size > 20 * 1024 * 1024)
      throw Error("PDF 不能超过 20 MB，请重新导出较小文件");
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-"))
      throw Error("请选择有效的 PDF 文件");
    const base = import.meta.env.BASE_URL + "pdf-assets/";
    const task = getDocument({
      data: bytes,
      cMapUrl: base + "cmaps/",
      cMapPacked: true,
      standardFontDataUrl: base + "standard_fonts/",
      wasmUrl: base + "wasm/",
    });
    const abort = () => {
      void task.destroy();
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 30)
        throw Error("文件超过 30 页，请仅导出个人学期课表");
      const pages: PdfPageText[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        if (signal?.aborted) throw new DOMException("已取消", "AbortError");
        const page = await pdf.getPage(i),
          vp = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const operators = await page.getOperatorList();
        const horizontalLines = extractHorizontalLines(
          operators.fnArray,
          operators.argsArray,
          OPS,
          vp.transform,
        );
        pages.push({
          horizontalLines,
          width: vp.width,
          height: vp.height,
          page: i,
          items: content.items.flatMap((item) => {
            if (!("str" in item) || !item.str.trim()) return [];
            const tx = Util.transform(vp.transform, item.transform),
              height = Math.max(1, Math.hypot(tx[2], tx[3]));
            return [
              {
                text: item.str,
                x: tx[4],
                y: tx[5] - height,
                width: item.width,
                height,
              },
            ];
          }),
        });
        page.cleanup();
      }
      return parsePdfPages(pages);
    } finally {
      signal?.removeEventListener("abort", abort);
      await task.destroy();
    }
  },
};
