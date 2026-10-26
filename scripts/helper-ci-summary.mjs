import { appendFile } from "node:fs/promises";
const url = process.env.HELPER_ARTIFACT_URL;
if (!url || !process.env.GITHUB_STEP_SUMMARY)
  throw Error("缺少 GitHub 产物地址或运行摘要路径");
await appendFile(
  process.env.GITHUB_STEP_SUMMARY,
  `## Windows 扩展已构建完成\n\n[点击下载 MyTimetable-Windows-Helper.zip](${url})\n\n下载需要登录 GitHub，产物保留 30 天；过期后点击 Run workflow 重新生成。\n\n1. 下载 ZIP → 右键“全部解压”，无需安装开发工具、无需运行命令。\n2. Chrome 打开 chrome://extensions；Edge 打开 edge://extensions。\n3. 开启“开发者模式” → “加载已解压的扩展程序” → 选择含 manifest.json 的解压文件夹。\n4. 先正常扫码登录学校，再在课表页打开助手，点“开始读取”，回到学校页查询完整学期。\n5. 返回助手检查课程并导出 JSON，传到 iPhone 的 MyTimetable 预览导入。\n\n不要下载仓库的 Code → Download ZIP；那是源码。扩展安装和使用说明也已放入 ZIP。\n\n构建已验证必需文件、离线脚本、最小权限和 ZIP 内容一致性；没有把用户课程或登录凭据打包。\n`,
);
