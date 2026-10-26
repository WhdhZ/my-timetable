import { verifyHelperPackage } from "./lib/helper-package.mjs";
const result = await verifyHelperPackage(
  "work/school-import-helper",
  "public/school-import-helper.zip",
);
console.log(
  `扩展安装包验证通过：${result.files} 个完整文件，版本 ${result.version}，来源 ${result.commit}。ZIP 可直接解压后加载，无需构建。`,
);
