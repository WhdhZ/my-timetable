import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { zipSync } from "fflate";
import { HELPER_FILES, verifyHelperPackage } from "./lib/helper-package.mjs";
let root: string, dir: string, zip: string;
async function pack(nested = false) {
  const files: Record<string, Uint8Array> = {};
  for (const name of HELPER_FILES)
    files[(nested ? "helper/" : "") + name] = new Uint8Array(
      await readFile(`${dir}/${name}`),
    );
  await writeFile(zip, zipSync(files));
}
beforeEach(async () => {
  await mkdir("work", { recursive: true });
  root = await mkdtemp("work/helper-package-test-");
  dir = `${root}/folder`;
  zip = `${root}/helper.zip`;
  await mkdir(dir);
  const manifest = {
    manifest_version: 3,
    permissions: ["activeTab", "scripting"],
    action: { default_popup: "popup.html" },
    background: { service_worker: "background.js" },
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'none'; connect-src 'none'",
    },
    version: "0.2.0",
  };
  for (const file of HELPER_FILES)
    await writeFile(
      `${dir}/${file}`,
      file.endsWith(".js") ? "const ready=true;" : "fixture",
    );
  await writeFile(`${dir}/manifest.json`, JSON.stringify(manifest));
  await writeFile(
    `${dir}/BUILD-INFO.json`,
    JSON.stringify({ version: "0.2.0", commit: "anonymous-test" }),
  );
  await writeFile(
    `${dir}/popup.html`,
    '<html lang="zh-CN"><link href="popup.css"><script src="popup.js"></script><a href="help.html">说明</a></html>',
  );
  await writeFile(
    `${dir}/help.html`,
    '<html lang="zh-CN"><link href="help.css">说明</html>',
  );
  await writeFile(
    `${dir}/安装和使用.txt`,
    "下载后全部解压，选择加载已解压的扩展程序，再导入 iPhone。",
  );
  await pack();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
describe("Windows 用户安装包契约", () => {
  it("单层 ZIP、入口、资源、最小权限和说明完整", async () => {
    expect((await verifyHelperPackage(dir, zip)).files).toBe(10);
  });
  it("缺少执行文件时不能发布", async () => {
    await rm(`${dir}/capture.js`);
    await expect(verifyHelperPackage(dir, zip)).rejects.toThrow("必需文件");
  });
  it("禁止误上传嵌套安装目录", async () => {
    await pack(true);
    await expect(verifyHelperPackage(dir, zip)).rejects.toThrow("单层");
  });
  it("禁止混入凭据文件或源码", async () => {
    await writeFile(`${dir}/.env`, "ANONYMOUS_TEST_ONLY");
    await expect(verifyHelperPackage(dir, zip)).rejects.toThrow("额外文件");
  });
  it("权限扩大或包内容与构建不一致时不能发布", async () => {
    const path = `${dir}/manifest.json`;
    const m = JSON.parse(await readFile(path, "utf8"));
    m.permissions.push("cookies");
    await writeFile(path, JSON.stringify(m));
    await expect(verifyHelperPackage(dir, zip)).rejects.toThrow("权限");
    m.permissions.pop();
    await writeFile(path, JSON.stringify(m));
    await writeFile(`${dir}/popup.js`, "const changed=true;");
    await expect(verifyHelperPackage(dir, zip)).rejects.toThrow("不一致");
  });
});
