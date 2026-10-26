import { CAPTURE_KEY, installCapture, type CaptureController } from "./capture";
// 用户再次点击“开始”代表新的一次读取，不沿用上一轮课程。
const previous = (
  window as unknown as Record<string, CaptureController | undefined>
)[CAPTURE_KEY];
previous?.stop();
installCapture();
