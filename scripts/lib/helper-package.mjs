import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Script } from "node:vm";
import { unzipSync } from "fflate";
export const HELPER_FILES = [
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
export async function verifyHelperPackage(directory, zipPath) {
  const actual = (await readdir(directory)).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...HELPER_FILES].sort()))
    throw Error("扩展目录缺少必需文件或混入了额外文件");
  const bytes = {};
  for (const file of HELPER_FILES) {
    bytes[file] = await readFile(join(directory, file));
    if (!bytes[file].length) throw Error(`文件为空：${file}`);
  }
  const manifest = JSON.parse(bytes["manifest.json"]);
  if (
    manifest.manifest_version !== 3 ||
    manifest.action?.default_popup !== "popup.html" ||
    manifest.background?.service_worker !== "background.js"
  )
    throw Error("扩展入口配置错误");
  if (
    JSON.stringify([...(manifest.permissions || [])].sort()) !==
    JSON.stringify(["activeTab", "scripting"])
  )
    throw Error("扩展权限超出当前页面临时读取所需范围");
  if (
    manifest.host_permissions?.length ||
    manifest.optional_host_permissions?.length ||
    manifest.content_scripts?.length ||
    manifest.externally_connectable ||
    manifest.optional_permissions?.length
  )
    throw Error("扩展不能申请全站/额外网站权限或声明外部入口");
  if (
    !manifest.content_security_policy?.extension_pages?.includes(
      "connect-src 'none'",
    )
  )
    throw Error("扩展弹窗没有禁止网络连接");
  for (const file of ["popup.html", "help.html"]) {
    const text = bytes[file].toString("utf8");
    if (
      /<script\b[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(
        text.replace(/<script\b[^>]*src=[^>]+>\s*<\/script>/gi, ""),
      )
    )
      throw Error("扩展页面不能包含内联执行脚本");
    for (const match of text.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      if (!HELPER_FILES.includes(match[1]))
        throw Error(`缺失或非本地页面资源：${match[1]}`);
    }
  }
  for (const file of ["popup.js", "capture.js", "background.js"])
    new Script(bytes[file].toString("utf8"), { filename: file });
  const guide = bytes["安装和使用.txt"].toString("utf8");
  if (/npm\s+(?:ci|run|install)|npx\s/.test(guide))
    throw Error("用户安装说明不应要求开发命令");
  if (
    !guide.includes("全部解压") ||
    !guide.includes("加载已解压的扩展程序") ||
    !guide.includes("iPhone")
  )
    throw Error("安装与手机导入说明不完整");
  const info = JSON.parse(bytes["BUILD-INFO.json"]);
  if (info.version !== manifest.version || !info.commit)
    throw Error("构建信息缺少版本或来源");
  const zip = unzipSync(new Uint8Array(await readFile(zipPath)));
  if (
    JSON.stringify(Object.keys(zip).sort()) !==
    JSON.stringify([...HELPER_FILES].sort())
  )
    throw Error("ZIP 不是单层安装目录，或文件清单不完整");
  for (const file of HELPER_FILES)
    if (!Buffer.from(zip[file]).equals(bytes[file]))
      throw Error(`ZIP 与构建文件不一致：${file}`);
  return {
    files: HELPER_FILES.length,
    version: manifest.version,
    commit: info.commit,
  };
}
