#!/usr/bin/env npx tsx

/**
 * BATCH PRINT ENTIRE ARCHIVE TO PDF
 *
 * Converts all 8 documents in the Golden Master Archive to individual PDFs:
 * 1. Executive Summary
 * 2. Executive White Paper
 * 3. Final White Paper
 * 4. Amendment Verification
 * 5. Bill of Materials
 * 6. Regulatory Alignment
 * 7. Statement of Conformity
 * 8. Phase 5: Adversarial Hardening
 */

import puppeteer, { Browser } from 'puppeteer';
import path from 'path';
import fs from 'fs';

interface Document {
  number: number;
  htmlFile: string;
  title: string;
}

const ARCHIVE_DIR = '/Users/DRA/Desktop/Echo Sound Lab/Echo Sound Lab v2.5/archive';

// Auto-detect documents from archive directory
function getDocumentsFromArchive(): Document[] {
  const files = fs.readdirSync(ARCHIVE_DIR);
  const htmlFiles = files
    .filter(file => {
      // Match pattern: starts with digits, ends with .html, exclude PRINT_ARCHIVE and ARCHIVE_INSTRUCTIONS
      return /^\d+_.*\.html$/.test(file) &&
             !file.includes('PRINT_ARCHIVE') &&
             !file.includes('ARCHIVE_INSTRUCTIONS');
    })
    .sort((a, b) => {
      // Extract leading number and sort numerically
      const numA = parseInt(a.match(/^\d+/)?.[0] || '0');
      const numB = parseInt(b.match(/^\d+/)?.[0] || '0');
      return numA - numB;
    });

  return htmlFiles.map((file, index) => ({
    number: index + 1,
    htmlFile: file,
    title: extractTitleFromFilename(file)
  }));
}

// Extract a readable title from the filename
function extractTitleFromFilename(filename: string): string {
  // Remove the leading number and underscore
  let title = filename.replace(/^\d+_/, '').replace('.html', '');
  // Replace underscores and hyphens with spaces
  title = title.replace(/[_-]/g, ' ');
  // Capitalize properly
  title = title
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  return title;
}

const documents: Document[] = getDocumentsFromArchive();

async function generatePDFBatch() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║        BATCH PRINTING ENTIRE ARCHIVE TO PDF                    ║');
  console.log('║        Golden Master Archive - Action Authority v1.4.0         ║');
  console.log('║        Phase 5 Adversarial Hardening & Institutional Trust      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`📁 Auto-detected ${documents.length} document(s) in archive\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = {
    successful: 0,
    failed: 0,
    totalSize: 0,
    documents: [] as Array<{ title: string; size: string; path: string }>
  };

  try {
    for (const doc of documents) {
      const htmlPath = path.join(ARCHIVE_DIR, doc.htmlFile);
      const pdfFilename = doc.htmlFile.replace('.html', '.pdf');
      const pdfPath = path.join(ARCHIVE_DIR, pdfFilename);

      console.log(`📄 [${doc.number}/${documents.length}] Converting: ${doc.title}`);
      console.log(`   HTML: ${doc.htmlFile}`);

      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 1600 });

        // Load the HTML
        await page.goto(`file://${htmlPath}`, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        // Wait for styles to load
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 2000)));

        // Inject CSS to prevent overflow in PDF
        await page.addStyleTag({
          content: `
            pre, code {
              overflow: hidden !important;
              word-wrap: break-word !important;
              white-space: pre-wrap !important;
              word-break: break-all !important;
            }
            .sourceCode {
              width: 100% !important;
              max-width: 100% !important;
              overflow: hidden !important;
            }
            body { max-width: 100% !important; }
            .container { max-width: 100% !important; }
          `
        });

        // Generate PDF
        await page.pdf({
          path: pdfPath,
          format: 'A4',
          margin: {
            top: '0.4in',
            bottom: '0.65in',
            left: '0.4in',
            right: '0.4in'
          },
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: '<div></div>',
          footerTemplate: `
            <div style="
              width: 100%;
              font-size: 8px;
              color: #666;
              text-align: center;
              padding: 0 0.4in;
              border-top: 1px solid #333;
              padding-top: 6px;
            ">
              <span>${doc.title}</span>
              <span style="float: right;"><span class="pageNumber"></span> / <span class="totalPages"></span></span>
            </div>
          `,
          scale: 0.95,
          preferCSSPageSize: true
        });

        await page.close();

        // Get file size
        const stats = fs.statSync(pdfPath);
        const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
        results.successful++;
        results.totalSize += stats.size;

        results.documents.push({
          title: doc.title,
          size: `${fileSizeMB} MB`,
          path: pdfPath
        });

        console.log(`   ✅ Generated: ${pdfFilename} (${fileSizeMB} MB)\n`);

      } catch (error) {
        results.failed++;
        console.log(`   ❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
      }
    }

  } finally {
    await browser.close();
  }

  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    BATCH CONVERSION COMPLETE                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`✅ Successfully Generated: ${results.successful}/${documents.length}`);
  if (results.failed > 0) {
    console.log(`❌ Failed: ${results.failed}`);
  }

  console.log(`\n📊 Total Archive Size: ${(results.totalSize / 1024 / 1024).toFixed(2)} MB\n`);

  console.log('📄 Generated PDFs:\n');
  results.documents.forEach((doc, idx) => {
    console.log(`   ${idx + 1}. ${doc.title}`);
    console.log(`      └─ Size: ${doc.size}`);
  });

  console.log(`\n📁 Location: ${ARCHIVE_DIR}\n`);

  console.log('🎉 All documents are ready for printing, sharing, or archival.\n');

  // Print file tree
  console.log('Generated Files:\n');
  results.documents.forEach(doc => {
    const filename = path.basename(doc.path);
    console.log(`   ✓ ${filename}`);
  });

  console.log(`\n✨ Status: ARCHIVE EXPORT COMPLETE\n`);
}

generatePDFBatch().catch(error => {
  console.error('❌ Batch conversion failed:', error);
  process.exit(1);
});
