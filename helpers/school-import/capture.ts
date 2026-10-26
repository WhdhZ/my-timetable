import {
  createSchoolPackage,
  MAX_SCHOOL_BYTES,
  type SchoolRow,
} from "../../src/imports/schoolPayload";
export const CAPTURE_KEY = "__MYTIMETABLE_LOCAL_CAPTURE_V1__";
export interface CaptureSnapshot {
  active: boolean;
  rows: SchoolRow[];
  revision: number;
  error: string;
}
export interface CaptureController {
  snapshot(): CaptureSnapshot;
  stop(): void;
}
type CaptureWindow = Window &
  typeof globalThis & { [CAPTURE_KEY]?: CaptureController };
/** 仅观察用户操作后本页收到的同源响应，不发请求，不触碰请求头/请求体/认证信息。 */
export function installCapture(
  host: CaptureWindow = window as CaptureWindow,
): CaptureController {
  const previous = host[CAPTURE_KEY];
  if (previous?.snapshot().active) return previous;
  let active = true,
    rows: SchoolRow[] = [],
    revision = 0,
    error = "";
  const originalFetch = host.fetch,
    proto = host.XMLHttpRequest.prototype,
    originalSend = proto.send;
  const sameOrigin = (url: string) => {
    try {
      return !!url && new URL(url).origin === host.location.origin;
    } catch {
      return false;
    }
  };
  const accept = (payload: unknown) => {
    if (!active) return;
    try {
      const pack = createSchoolPackage(payload);
      if (
        new TextEncoder().encode(JSON.stringify(pack)).length > MAX_SCHOOL_BYTES
      )
        throw Error("课程数据超过 2 MB，未截断保存");
      rows = pack.rows;
      revision++;
      error = "";
    } catch (e) {
      const message = (e as Error).message;
      if (!message.startsWith("没有找到")) {
        error = message;
        rows = [];
      }
    }
  };
  async function readResponse(response: Response) {
    if (!active || !sameOrigin(response.url)) return;
    const mime = response.headers.get("content-type") || "";
    if (!/application\/(?:[\w.-]+\+)?json|text\/plain/i.test(mime)) return;
    try {
      const copy = response.clone();
      if (!copy.body) return;
      const reader = copy.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (!active || length > MAX_SCHOOL_BYTES) {
          await reader.cancel();
          if (active) {
            rows = [];
            error = "响应超过 2 MB，未保存；请手动导出仅含课表的 JSON";
          }
          return;
        }
        chunks.push(value);
      }
      if (!active) return;
      const buffer = new Uint8Array(length);
      let at = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, at);
        at += chunk.length;
      }
      const text = new TextDecoder().decode(buffer);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return;
      }
      accept(json);
    } catch {
      /* 不影响学校页面，不输出响应或认证信息到日志 */
    }
  }
  const wrappedFetch: typeof fetch = function (
    this: unknown,
    ...args: Parameters<typeof fetch>
  ) {
    const result = Reflect.apply(
      originalFetch,
      this,
      args,
    ) as Promise<Response>;
    void result.then(
      (response) => {
        void readResponse(response);
      },
      () => {},
    );
    return result;
  };
  const wrappedSend: typeof proto.send = function (
    this: XMLHttpRequest,
    ...args: Parameters<typeof proto.send>
  ) {
    this.addEventListener(
      "load",
      () => {
        if (!active || !sameOrigin(this.responseURL)) return;
        try {
          if (this.responseType === "json") {
            accept(this.response);
            return;
          }
          if (this.responseType !== "" && this.responseType !== "text") return;
          const mime = this.getResponseHeader("content-type") || "";
          if (!/application\/(?:[\w.-]+\+)?json|text\/plain/i.test(mime))
            return;
          const text = this.responseText;
          if (new TextEncoder().encode(text).length > MAX_SCHOOL_BYTES) {
            rows = [];
            error = "响应超过 2 MB，未保存";
            return;
          }
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch {
            return;
          }
          accept(json);
        } catch {
          /* 不改变 XHR 的原有处理 */
        }
      },
      { once: true },
    );
    return Reflect.apply(originalSend, this, args);
  };
  let timer: ReturnType<typeof setTimeout>;
  const controller: CaptureController = {
    snapshot: () => ({
      active,
      rows: rows.map((row) => ({ ...row })),
      revision,
      error,
    }),
    stop: () => {
      active = false;
      rows = [];
      error = "";
      if (host.fetch === wrappedFetch) host.fetch = originalFetch;
      if (proto.send === wrappedSend) proto.send = originalSend;
      host.clearTimeout(timer);
    },
  };
  host.fetch = wrappedFetch;
  proto.send = wrappedSend;
  host[CAPTURE_KEY] = controller;
  timer = host.setTimeout(() => controller.stop(), 10 * 60 * 1000);
  return controller;
}
