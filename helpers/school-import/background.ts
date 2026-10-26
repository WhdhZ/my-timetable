// 只在首次安装打开随包中文指南；不监听网页、不读取登录信息、不执行同步。
declare const chrome: any;
chrome.runtime.onInstalled.addListener((details: { reason: string }) => {
  if (details.reason === "install")
    void chrome.tabs.create({ url: chrome.runtime.getURL("help.html") });
});
