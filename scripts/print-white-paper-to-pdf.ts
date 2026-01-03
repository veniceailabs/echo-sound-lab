#!/usr/bin/env npx tsx

/**
 * PRINT WHITE PAPER TO PDF
 *
 * Generates a professional PDF from the Action Authority white paper HTML.
 * Uses Puppeteer to render the full HTML with proper pagination and styling.
 */

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

async function generatePDF() {
  console.log('🖨️  Starting PDF generation...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Set viewport to A4 landscape for better readability
    await page.setViewport({ width: 1200, height: 1600 });

    // Load the HTML file
    const htmlPath = path.join(
      '/Users/DRA/Desktop/Echo Sound Lab/Echo Sound Lab v2.5/archive',
      '03_ACTION_AUTHORITY_v1.4.0_FINAL_WHITE_PAPER.html'
    );

    console.log(`📄 Loading: ${htmlPath}`);
    await page.goto(`file://${htmlPath}`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait a bit for all images and styles to load
    await page.waitForTimeout(2000);

    // Generate PDF with proper settings
    const pdfPath = path.join(
      '/Users/DRA/Desktop/Echo Sound Lab/Echo Sound Lab v2.5/archive',
      '03_ACTION_AUTHORITY_v1.4.0_FINAL_WHITE_PAPER.pdf'
    );

    console.log(`\n📋 Generating PDF with full pagination...`);
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      margin: {
        top: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
        right: '0.5in'
      },
      printBackground: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="
          width: 100%;
          font-size: 10px;
          color: #666;
          text-align: center;
          padding: 0 0.5in;
          border-top: 1px solid #ddd;
          padding-top: 8px;
        ">
          <span>Action Authority v1.4.0 - FINAL WHITE PAPER</span>
          <span style="float: right;"><span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>
      `,
      displayHeaderFooter: true,
      scale: 1,
      preferCSSPageSize: true
    });

    const stats = fs.statSync(pdfPath);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);

    console.log(`\n✅ PDF GENERATED SUCCESSFULLY`);
    console.log(`📁 Location: ${pdfPath}`);
    console.log(`📊 File Size: ${fileSizeMB} MB`);
    console.log(`📄 Pages: Full document with automatic pagination`);
    console.log(`\n✨ The PDF is ready for printing, sharing, or archival.\n`);

  } catch (error) {
    console.error('❌ Error generating PDF:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

generatePDF();
