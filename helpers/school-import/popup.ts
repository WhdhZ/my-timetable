// Chrome / Edge MV3。无后台服务、无 host_permissions、无 Cookie / webRequest 权限。
import {
  createSchoolPackage,
  extractSchoolRows,
  type SchoolRow,
} from "../../src/imports/schoolPayload";
import type { CaptureSnapshot } from "./capture";
declare const chrome: any;
const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const status = element("status"),
  preview = element("preview"),
  download = element<HTMLButtonElement>("download");
let rows: SchoolRow[] = [];
function showStatus(
  kind: "idle" | "waiting" | "ready" | "error",
  title: string,
  message: string,
) {
  element("status-box").dataset.state = kind;
  element("status-title").textContent = title;
  status.textContent = message;
  element("next-step").hidden = true;
}
async function tabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:\/\//.test(tab.url || ""))
    throw Error("请切换到已正常登录的学校课表网页，再打开助手");
  element("origin").textContent = new URL(tab.url).origin;
  return tab.id;
}
function render(state: CaptureSnapshot | undefined) {
  rows = [];
  preview.replaceChildren();
  download.disabled = true;
  if (!state) {
    showStatus(
      "idle",
      "还没开始读取",
      "请在扫码登录后的课表页面点击“我已登录，开始读取课表”。如果刚刚登录跳转或刷新，需要重新开始。",
    );
    return;
  }
  if (state.error) {
    showStatus(
      "error",
      "没有完成读取",
      state.error + "。导出已禁用，请重新查询或改用其他导入方式。",
    );
    return;
  }
  try {
    rows = extractSchoolRows(state.rows);
  } catch {
    showStatus(
      "error",
      "课程数据无效",
      "请停止并重新开始，再通过学校页面查询学期课表。",
    );
    return;
  }
  if (!state.active) {
    showStatus(
      "idle",
      "读取已停止",
      "暂存已清空。请回到课表页重新开始，再查询学期课表。",
    );
    rows = [];
    return;
  }
  if (!rows.length) {
    showStatus(
      "waiting",
      "还没有读到课程",
      "先收起助手，在学校页面选择完整学期并点击“查询”，再打开助手点“检查课表”。仍为 0 时，请查看下方排查步骤。",
    );
    return;
  }
  showStatus(
    "ready",
    `已读到 ${rows.length} 项课程`,
    `请先核对下方课程。只保留最近一次匹配的响应（已匹配 ${state.revision} 次），不能保证页面返回的是完整学期；周次、节次可在 MyTimetable 中继续核对。`,
  );
  download.disabled = false;
  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "course";
    const name = document.createElement("strong");
    name.textContent = String(row.kcmc || "名称待确认");
    const detail = document.createElement("small");
    detail.textContent = `${row.xqjmc || row.xqj || "星期待定"} · ${row.jcs || row.jc || "节次待定"} · ${row.zcd || "周次待定"} · ${row.cdmc || "地点待定"}`;
    item.append(name, detail);
    preview.append(item);
  }
}
async function refresh() {
  const id = await tabId();
  const results = await chrome.scripting.executeScript({
    target: { tabId: id },
    world: "MAIN",
    func: () => {
      const state = (window as any).__MYTIMETABLE_LOCAL_CAPTURE_V1__;
      return state?.snapshot();
    },
  });
  render(results[0]?.result);
}
async function run(task: () => Promise<void>) {
  try {
    await task();
  } catch (e) {
    rows = [];
    download.disabled = true;
    preview.replaceChildren();
    showStatus(
      "error",
      "无法读取当前页面",
      (e as Error).message.startsWith("请切换")
        ? (e as Error).message
        : "页面可能已经跳转，或不允许读取。请在登录后的课表页重新开始；仍失败时可使用 MyTimetable 的其他导入方式。",
    );
  }
}
element("start").onclick = () =>
  run(async () => {
    const id = await tabId();
    await chrome.scripting.executeScript({
      target: { tabId: id },
      world: "MAIN",
      files: ["capture.js"],
    });
    await refresh();
  });
element("refresh").onclick = () => run(refresh);
element("stop").onclick = () =>
  run(async () => {
    const id = await tabId();
    await chrome.scripting.executeScript({
      target: { tabId: id },
      world: "MAIN",
      func: () => {
        (window as any).__MYTIMETABLE_LOCAL_CAPTURE_V1__?.stop();
      },
    });
    render(undefined);
    showStatus(
      "idle",
      "已停止并清空",
      "本页暂存课程已清除。导出过的文件仍在电脑“下载”中，由你自行保管。",
    );
  });
download.onclick = () =>
  run(async () => {
    await refresh();
    if (!rows.length || download.disabled) return;
    const pack = createSchoolPackage(
      rows,
      element<HTMLInputElement>("term").value,
    );
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "MyTimetable-school-courses.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showStatus(
      "ready",
      "已发起文件下载",
      "请到电脑“下载”文件夹检查 MyTimetable-school-courses.json。浏览器若阻止下载，请允许后重试；文件下载后再传到 iPhone。",
    );
    element("next-step").hidden = false;
  });
void run(refresh);
