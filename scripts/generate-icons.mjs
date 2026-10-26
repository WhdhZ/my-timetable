import sharp from "sharp";
for (const size of [180, 192, 512])
  await sharp("public/icon.svg")
    .resize(size, size)
    .png()
    .toFile(`public/${size === 180 ? "apple-touch-icon" : `icon-${size}`}.png`);
const icon = await sharp("public/icon.svg").resize(380, 380).png().toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#42674f" },
})
  .composite([{ input: icon, left: 66, top: 66 }])
  .png()
  .toFile("public/icon-maskable.png");
