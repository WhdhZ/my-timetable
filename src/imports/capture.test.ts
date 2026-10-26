import { afterEach, describe, it, expect, vi } from "vitest";
import {
  installCapture,
  type CaptureController,
} from "../../helpers/school-import/capture";
const course = {
  kcmc: "合成捕获课",
  jcs: "1-2",
  xqj: 1,
  zcd: "1-16周",
  Cookie: "SYNTHETIC-COOKIE",
  token: "SYNTHETIC-TOKEN",
};
let controller: CaptureController | undefined;
afterEach(() => {
  controller?.stop();
  vi.useRealTimers();
});
function harness() {
  let payload: unknown = { data: [course] };
  class XHR extends EventTarget {
    responseURL = "https://school.example.edu/query";
    responseType = "";
    responseText = JSON.stringify([course]);
    response: unknown;
    getResponseHeader = vi.fn((_name: string) => "application/json");
    declare send: () => void;
  }
  const nativeSend = vi.fn(function (this: XHR) {
    this.dispatchEvent(new Event("load"));
  });
  Object.defineProperty(XHR.prototype, "send", {
    value: nativeSend,
    writable: true,
  });
  const nativeFetch = vi.fn(async (..._args: unknown[]) => {
    const r = new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
    });
    Object.defineProperty(r, "url", {
      value: "https://school.example.edu/query",
    });
    return r;
  });
  const host = {
    fetch: nativeFetch,
    XMLHttpRequest: XHR,
    location: { origin: "https://school.example.edu" },
    setTimeout,
    clearTimeout,
  };
  return {
    host,
    nativeFetch,
    nativeSend,
    XHR,
    setPayload: (v: unknown) => {
      payload = v;
    },
  };
}
const settle = () => new Promise((r) => setTimeout(r, 30));
describe("已登录页面的本地读取器", () => {
  it("仅包装正常 fetch，保持原响应，导出前即过滤身份字段", async () => {
    const h = harness();
    controller = installCapture(h.host as never);
    const response = await h.host.fetch("/query");
    expect(await response.json()).toEqual({ data: [course] });
    await settle();
    expect(controller.snapshot().rows[0].kcmc).toBe("合成捕获课");
    expect(JSON.stringify(controller.snapshot())).not.toContain("SYNTHETIC");
    expect(h.nativeFetch).toHaveBeenCalledTimes(1);
  });
  it("XHR 原调用正常执行，不读取请求体/认证头", () => {
    const h = harness();
    controller = installCapture(h.host as never);
    const xhr = new h.XHR();
    (xhr.send as () => void)();
    expect(h.nativeSend).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().rows[0].kcmc).toBe("合成捕获课");
    expect(
      xhr.getResponseHeader.mock.calls.every(
        ([name]) => name === "content-type",
      ),
    ).toBe(true);
  });
  it("新匹配响应替换旧结果，不把不同查询范围拼接", async () => {
    const h = harness();
    controller = installCapture(h.host as never);
    await h.host.fetch();
    await settle();
    h.setPayload([{ ...course, kcmc: "新的学期查询" }]);
    await h.host.fetch();
    await settle();
    expect(controller.snapshot().rows).toHaveLength(1);
    expect(controller.snapshot().rows[0].kcmc).toBe("新的学期查询");
    expect(controller.snapshot().revision).toBe(2);
  });
  it("停止后恢复原函数并清空课程", async () => {
    const h = harness();
    controller = installCapture(h.host as never);
    await h.host.fetch();
    await settle();
    controller.stop();
    expect(controller.snapshot().rows).toEqual([]);
    expect(h.host.fetch).toBe(h.nativeFetch);
    expect(h.XHR.prototype.send).toBe(h.nativeSend);
  });
  it("不会覆盖其他脚本后来安装的 fetch 包装", () => {
    const h = harness();
    controller = installCapture(h.host as never);
    const later = vi.fn();
    h.host.fetch = later as never;
    controller.stop();
    expect(h.host.fetch).toBe(later);
  });
  it("跨源 XHR 响应不读取，未匹配响应不创建课程", () => {
    const h = harness();
    controller = installCapture(h.host as never);
    const xhr = new h.XHR();
    xhr.responseURL = "https://other.example.edu/query";
    (xhr.send as () => void)();
    expect(controller.snapshot().rows).toEqual([]);
    expect(xhr.getResponseHeader).not.toHaveBeenCalled();
  });
  it("10分钟后自动清空并恢复", () => {
    vi.useFakeTimers();
    const h = harness();
    controller = installCapture(h.host as never);
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(controller.snapshot().active).toBe(false);
    expect(h.host.fetch).toBe(h.nativeFetch);
  });
  it("重复开始不会重复包裹 fetch", () => {
    const h = harness();
    controller = installCapture(h.host as never);
    const fetch = h.host.fetch;
    expect(installCapture(h.host as never)).toBe(controller);
    expect(h.host.fetch).toBe(fetch);
  });
});
