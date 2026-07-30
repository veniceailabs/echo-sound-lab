import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const repoRoot = path.resolve(process.cwd());
const inputHtml = path.join(repoRoot, 'docs', 'Operator_Guide_Golden_Master_v2.5.0.dark.html');

const outputRepoPdf = path.join(
  repoRoot,
  'docs',
  'Echo Sound Lab - Operator Guide (Golden Master v2.5.0).pdf'
);

const outputCanonicalRepoPdf = path.join(repoRoot, 'docs', 'Echo Sound Lab - Operator Guide.pdf');

const outputDesktopDir = '/Users/DRA/Desktop/Apps/Echo Sound Lab/Echo Sound Lab v2.5/docs';
const outputDesktopPdf = path.join(
  outputDesktopDir,
  'Echo Sound Lab - Operator Guide (Golden Master v2.5.0).pdf'
);
const outputCanonicalDesktopPdf = path.join(outputDesktopDir, 'Echo Sound Lab - Operator Guide.pdf');

if (!fs.existsSync(inputHtml)) {
  throw new Error(`Operator guide HTML not found: ${inputHtml}`);
}

await fs.promises.mkdir(path.dirname(outputRepoPdf), { recursive: true });
await fs.promises.mkdir(outputDesktopDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(`file://${inputHtml}`, { waitUntil: 'networkidle' });
await page.emulateMedia({ media: 'screen' });

const pdfBuffer = await page.pdf({
  format: 'Letter',
  printBackground: true,
  displayHeaderFooter: true,
  margin: {
    top: '0.5in',
    right: '0.48in',
    bottom: '0.58in',
    left: '0.48in',
  },
  headerTemplate: `
    <div style="width:100%;font-size:8px;color:#7a8aa9;padding:0 0.48in;text-transform:uppercase;letter-spacing:0.08em;font-family:Inter,Segoe UI,sans-serif;">
      Echo Sound Lab · Dark Mode Operator Guide
    </div>
  `,
  footerTemplate: `
    <div style="width:100%;font-size:8px;color:#7a8aa9;padding:0 0.48in;font-family:Inter,Segoe UI,sans-serif;">
      <span>Golden Master v2.5.0</span>
      <span style="float:right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>
  `,
});

await browser.close();

await fs.promises.writeFile(outputRepoPdf, pdfBuffer);
await fs.promises.writeFile(outputCanonicalRepoPdf, pdfBuffer);
await fs.promises.writeFile(outputDesktopPdf, pdfBuffer);
await fs.promises.writeFile(outputCanonicalDesktopPdf, pdfBuffer);

console.log('Generated operator guide PDF files:');
console.log(`- ${outputRepoPdf}`);
console.log(`- ${outputCanonicalRepoPdf}`);
console.log(`- ${outputDesktopPdf}`);
console.log(`- ${outputCanonicalDesktopPdf}`);
