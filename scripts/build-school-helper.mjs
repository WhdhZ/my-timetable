import { build } from "esbuild";
import { mkdir, rm, cp, readFile, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";
const target = "work/school-import-helper";
// 使用专用干净目录，避免将缓存或用户文件混入工作流产物。
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const [entry, outfile, format] of [
  ["popup.ts", "popup.js", "esm"],
  ["capture-entry.ts", "capture.js", "iife"],
  ["background.ts", "background.js", "iife"],
])
  await build({
    entryPoints: [`helpers/school-import/${entry}`],
    bundle: true,
    format,
    platform: "browser",
    target: "chrome111",
    outfile: `${target}/${outfile}`,
  });
for (const file of [
  "manifest.json",
  "popup.html",
  "popup.css",
  "help.css",
  "安装和使用.txt",
])
  await cp(`helpers/school-import/${file}`, `${target}/${file}`);
const guide = await readFile("helpers/school-import/安装和使用.txt", "utf8");
const escape = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
await writeFile(
  `${target}/help.html`,
  `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MyTimetable 安装和使用说明</title><link rel="stylesheet" href="help.css"></head><body><main><p class="tag">MyTimetable · Windows 助手</p><h1>安装一次，课表随身带。</h1><p>你不需要编程，也不需要运行任何命令。按下面的步骤操作即可。</p><pre>${escape(guide)}</pre></main></body></html>`,
);
const manifest = JSON.parse(await readFile(`${target}/manifest.json`, "utf8"));
await writeFile(
  `${target}/BUILD-INFO.json`,
  JSON.stringify(
    {
      name: "MyTimetable Windows Helper",
      version: manifest.version,
      commit: process.env.GITHUB_SHA || "local",
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);
const files = [
  "manifest.json",
  "popup.html",
  "popup.css",
  "popup.js",
  "capture.js",
  "background.js",
  "help.html",
  "help.css",
  "安装和使用.txt",
  "BUILD-INFO.json",
];
const archive = {};
for (const file of files)
  archive[file] = new Uint8Array(await readFile(`${target}/${file}`));
await writeFile(
  "public/school-import-helper.zip",
  zipSync(archive, { level: 6 }),
);
console.log(
  `扩展安装目录：${target}；可直接解压安装：public/school-import-helper.zip`,
);
