import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceHtml = path.join(root, 'frontend/public/aurasite-icon-source.html');
const outputPng = path.join(root, 'frontend/public/aurasite-icon.png');
const outputFavicon = path.join(root, 'frontend/public/favicon.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
await page.goto(`file:///${sourceHtml.replace(/\\/g, '/')}?snapshot=1`);
await page.waitForFunction(() => window.__ICON_READY__ === true);
await page.screenshot({
  path: outputPng,
  clip: { x: 0, y: 0, width: 512, height: 512 },
  omitBackground: false,
});
await page.screenshot({
  path: outputFavicon,
  clip: { x: 0, y: 0, width: 512, height: 512 },
  omitBackground: false,
});
await browser.close();

console.log('Icon saved:', outputPng);
