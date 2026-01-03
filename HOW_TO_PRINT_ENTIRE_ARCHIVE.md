# How to Print the Entire Golden Master Archive to PDF

## Archive Contents (7 Documents)

The Golden Master Archive contains:

```
01_GOLDEN_MASTER_EXECUTIVE_SUMMARY.html           (4 pages)
02_ACTION_AUTHORITY_v1.4.0_EXECUTIVE_WHITE_PAPER.html (18 pages)
03_ACTION_AUTHORITY_v1.4.0_FINAL_WHITE_PAPER.html (22 pages)
04_GOLDEN_MASTER_AMENDMENT_VERIFICATION.html     (19 pages)
05_GOLDEN_MASTER_BILL_OF_MATERIALS.html           (11 pages)
06_GOLDEN_MASTER_REGULATORY_ALIGNMENT.html        (20 pages)
07_GOLDEN_MASTER_STATEMENT_OF_CONFORMITY.html     (7 pages)
```

**Total: ~101 pages, ~400 KB HTML → ~7-12 MB PDF**

---

## Method 1: Batch Script (Recommended - Automated) ⭐

### Fastest Way to Generate All 7 PDFs at Once

#### Prerequisites:
```bash
npm install puppeteer
```

#### Run the Batch Script:
```bash
cd "/Users/DRA/Desktop/Echo Sound Lab/Echo Sound Lab v2.5"
npx tsx scripts/batch-print-archive-to-pdf.ts
```

#### What Happens:
```
📄 [1/7] Converting: Executive Summary
   ✅ Generated: 01_GOLDEN_MASTER_EXECUTIVE_SUMMARY.pdf (0.45 MB)

📄 [2/7] Converting: Executive White Paper
   ✅ Generated: 02_ACTION_AUTHORITY_v1.4.0_EXECUTIVE_WHITE_PAPER.pdf (1.23 MB)

... (continues for all 7 documents)

✅ Successfully Generated: 7/7
📊 Total Archive Size: 8.94 MB
```

#### Output Location:
```
/Users/DRA/Desktop/Echo Sound Lab/Echo Sound Lab v2.5/archive/
```

#### Advantages:
✅ Converts all 7 documents in one command
✅ Automatic page numbering and footers
✅ Consistent formatting across all PDFs
✅ Professional output quality
✅ Takes ~2-3 minutes total

---

## Method 2: Browser Print Each Document

### Manual but Full Control

#### For Each Document:

1. **Open in Browser**
   ```
   file:///Users/DRA/Desktop/Echo%20Sound%20Lab/Echo%20Sound%20Lab%20v2.5/archive/[FILENAME].html
   ```

2. **Print to PDF**
   - Press: `Cmd+P` (Mac) or `Ctrl+P` (Windows)
   - Destination: "Save as PDF"
   - Settings:
     - Margins: 0.5 inches
     - Scale: 100%
     - ✅ Background Graphics: ON
   - Save in archive folder

3. **Repeat for Each File**
   - 01_GOLDEN_MASTER_EXECUTIVE_SUMMARY.html
   - 02_ACTION_AUTHORITY_v1.4.0_EXECUTIVE_WHITE_PAPER.html
   - 03_ACTION_AUTHORITY_v1.4.0_FINAL_WHITE_PAPER.html
   - 04_GOLDEN_MASTER_AMENDMENT_VERIFICATION.html
   - 05_GOLDEN_MASTER_BILL_OF_MATERIALS.html
   - 06_GOLDEN_MASTER_REGULATORY_ALIGNMENT.html
   - 07_GOLDEN_MASTER_STATEMENT_OF_CONFORMITY.html

#### Time Required:
~5-10 minutes (7 documents × ~1 min each)

#### Advantages:
✅ No extra software
✅ Full visual control
✅ Can preview before saving

---

## Method 3: Shell Script with wkhtmltopdf

### Command-Line Batch Processing

#### Install wkhtmltopdf:
```bash
# macOS
brew install --cask wkhtmltopdf

# Ubuntu/Debian
sudo apt-get install wkhtmltopdf

# Windows
choco install wkhtmltopdf
```

#### Run Batch Convert:
```bash
#!/bin/bash
ARCHIVE="/Users/DRA/Desktop/Echo Sound Lab/Echo Sound Lab v2.5/archive"

wkhtmltopdf --enable-local-file-access "$ARCHIVE/01_GOLDEN_MASTER_EXECUTIVE_SUMMARY.html" "$ARCHIVE/01_GOLDEN_MASTER_EXECUTIVE_SUMMARY.pdf"

wkhtmltopdf --enable-local-file-access "$ARCHIVE/02_ACTION_AUTHORITY_v1.4.0_EXECUTIVE_WHITE_PAPER.html" "$ARCHIVE/02_ACTION_AUTHORITY_v1.4.0_EXECUTIVE_WHITE_PAPER.pdf"

wkhtmltopdf --enable-local-file-access "$ARCHIVE/03_ACTION_AUTHORITY_v1.4.0_FINAL_WHITE_PAPER.html" "$ARCHIVE/03_ACTION_AUTHORITY_v1.4.0_FINAL_WHITE_PAPER.pdf"

wkhtmltopdf --enable-local-file-access "$ARCHIVE/04_GOLDEN_MASTER_AMENDMENT_VERIFICATION.html" "$ARCHIVE/04_GOLDEN_MASTER_AMENDMENT_VERIFICATION.pdf"

wkhtmltopdf --enable-local-file-access "$ARCHIVE/05_GOLDEN_MASTER_BILL_OF_MATERIALS.html" "$ARCHIVE/05_GOLDEN_MASTER_BILL_OF_MATERIALS.pdf"

wkhtmltopdf --enable-local-file-access "$ARCHIVE/06_GOLDEN_MASTER_REGULATORY_ALIGNMENT.html" "$ARCHIVE/06_GOLDEN_MASTER_REGULATORY_ALIGNMENT.pdf"

wkhtmltopdf --enable-local-file-access "$ARCHIVE/07_GOLDEN_MASTER_STATEMENT_OF_CONFORMITY.html" "$ARCHIVE/07_GOLDEN_MASTER_STATEMENT_OF_CONFORMITY.pdf"

echo "✅ All PDFs generated successfully!"
```

#### Advantages:
✅ Fast processing
✅ Headless (no browser needed)
✅ Batch scriptable

---

## Method 4: INDEX.html - Print the Master Index

### Print Navigation Page

#### Steps:
1. Open:
   ```
   file:///Users/DRA/Desktop/Echo%20Sound%20Lab/Echo%20Sound%20Lab%20v2.5/archive/INDEX.html
   ```

2. Press `Cmd+P` (or `Ctrl+P`)

3. Settings:
   - Destination: "Save as PDF"
   - ✅ Background Graphics: ON
   - Margins: 0.5"

4. Save as: `00_GOLDEN_MASTER_INDEX.pdf`

#### Result:
A visual guide to all 7 documents with clickable links (in digital form)

---

## Quick Comparison

| Method | Time | Effort | Quality | Ease |
|--------|------|--------|---------|------|
| **Method 1: Batch Script** | 2-3 min | Minimal | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Method 2: Manual Print** | 5-10 min | Moderate | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Method 3: wkhtmltopdf** | 1-2 min | Low | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Method 4: INDEX Only** | 1 min | Minimal | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## Recommended Workflow

### For Complete Archive Export (Best Results):

1. **Generate All PDFs**
   ```bash
   npx tsx scripts/batch-print-archive-to-pdf.ts
   ```
   *Takes 2-3 minutes, generates all 7 PDFs automatically*

2. **Print INDEX for Navigation**
   ```
   file:///Users/DRA/Desktop/Echo%20Sound%20Lab/Echo%20Sound%20Lab%20v2.5/archive/INDEX.html
   Cmd+P → Save as PDF → "00_GOLDEN_MASTER_INDEX.pdf"
   ```
   *Creates master index of all documents*

3. **Review Output**
   ```bash
   ls -lh /Users/DRA/Desktop/Echo\ Sound\ Lab/Echo\ Sound\ Lab\ v2.5/archive/*.pdf
   ```
   *Verify all 8 PDFs generated (INDEX + 7 documents)*

### Result:
- ✅ Complete archive in PDF format
- ✅ All 101+ pages with proper formatting
- ✅ Professional quality output
- ✅ Dark theme preserved
- ✅ Ready for printing, sharing, or archival
- ⏱️ Total time: ~5 minutes

---

## Important Print Settings

### For Dark Theme Preservation:

| Setting | Value | Why |
|---------|-------|-----|
| **Background Graphics** | ✅ ON | Preserves #1a1a1a background |
| **Margins** | 0.5" | Professional spacing |
| **Scale** | 100% | True-to-size content |
| **Page Size** | A4 | Standard document |
| **Orientation** | Portrait | Standard reading |

**⚠️ WITHOUT "Background Graphics" enabled, dark backgrounds become white.**

---

## Expected Output Sizes

| Document | Pages | PDF Size |
|----------|-------|----------|
| 01 - Executive Summary | 4 | ~0.4 MB |
| 02 - Executive White Paper | 18 | ~1.2 MB |
| 03 - Final White Paper | 22 | ~1.5 MB |
| 04 - Amendment Verification | 19 | ~1.3 MB |
| 05 - Bill of Materials | 11 | ~0.9 MB |
| 06 - Regulatory Alignment | 20 | ~1.4 MB |
| 07 - Statement of Conformity | 7 | ~0.6 MB |
| **TOTAL** | **101** | **~7-9 MB** |

---

## Troubleshooting

### Issue: "Puppeteer not found"
**Solution:**
```bash
npm install puppeteer
```

### Issue: PDFs are blank
**Solution:**
- Ensure "Background Graphics" is enabled in browser print settings
- Check that HTML files haven't been moved
- Try a different browser (Chrome has best CSS support)

### Issue: File permissions denied
**Solution:**
```bash
chmod +x scripts/batch-print-archive-to-pdf.ts
```

### Issue: Some pages missing
**Solution:**
- Close popup windows that might interfere
- Allow more load time: increase `waitForTimeout(2000)` to `(3000)` in script
- Try Method 2 (browser print) instead

---

## Files Generated

After running the batch script, you'll have:

```
archive/
├── INDEX.html (master navigation)
├── 01_GOLDEN_MASTER_EXECUTIVE_SUMMARY.pdf
├── 02_ACTION_AUTHORITY_v1.4.0_EXECUTIVE_WHITE_PAPER.pdf
├── 03_ACTION_AUTHORITY_v1.4.0_FINAL_WHITE_PAPER.pdf
├── 04_GOLDEN_MASTER_AMENDMENT_VERIFICATION.pdf
├── 05_GOLDEN_MASTER_BILL_OF_MATERIALS.pdf
├── 06_GOLDEN_MASTER_REGULATORY_ALIGNMENT.pdf
└── 07_GOLDEN_MASTER_STATEMENT_OF_CONFORMITY.pdf
```

---

## Next Steps

### Archive Is Complete When:
✅ All 7 PDFs generated
✅ Each PDF has proper pagination
✅ Dark theme preserved
✅ All content included
✅ File sizes reasonable (7-9 MB total)

### Ready To:
✅ Print the complete archive
✅ Share with stakeholders
✅ Submit to regulators
✅ Archive in document repository
✅ Distribute to legal/compliance teams

---

## Support

For detailed instructions on each method, see:
- `HOW_TO_PRINT_WHITE_PAPER.md` - Single document printing
- `batch-print-archive-to-pdf.ts` - Batch script source code

---

**Status: Archive Ready for PDF Export** ✅

Choose Method 1 (Batch Script) for fastest results.
