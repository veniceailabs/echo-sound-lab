#!/bin/bash
# Golden Master Archive: Complete PDF Bundle Creator
# Converts all regulatory documents to PDF and creates unified submission package
# Usage: bash CREATE_PDF_BUNDLE.sh

set -e

echo "🏛️  Creating Golden Master PDF Bundle..."
echo ""

cd "$(dirname "$0")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if pandoc is installed
if ! command -v pandoc &> /dev/null; then
    echo -e "${RED}❌ pandoc is not installed${NC}"
    echo "Install with: brew install pandoc"
    exit 1
fi

# Function to convert a single document
convert_document() {
    local input_file="$1"
    local output_file="$2"
    local title="$3"

    echo -e "${BLUE}Converting: $input_file${NC}"

    if [ ! -f "$input_file" ]; then
        echo -e "${RED}❌ File not found: $input_file${NC}"
        return 1
    fi

    # Convert markdown to PDF using pandoc
    pandoc "$input_file" \
        --from=markdown \
        --to=pdf \
        -V geometry:margin=1in \
        -V fontsize=11pt \
        -V linestretch=1.15 \
        --table-of-contents \
        --toc-depth=2 \
        -o "$output_file" 2>/dev/null

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Created: $output_file${NC}"
        return 0
    else
        echo -e "${RED}⚠️  Failed to convert: $input_file${NC}"
        return 1
    fi
}

# Create pdf subdirectory
mkdir -p pdf
echo "📁 Created pdf/ directory"
echo ""

# Convert all regulatory documents (SECTION 1)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SECTION 1: REGULATORY DOCUMENTS (7 Files)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

convert_document \
    "GOLDEN_MASTER_EXECUTIVE_SUMMARY.md" \
    "pdf/01_GOLDEN_MASTER_EXECUTIVE_SUMMARY.pdf" \
    "Executive Summary"

convert_document \
    "ACTION_AUTHORITY_v1.4.0_EXECUTIVE_WHITE_PAPER.md" \
    "pdf/02_ACTION_AUTHORITY_v1.4.0_EXECUTIVE_WHITE_PAPER.pdf" \
    "Executive White Paper"

convert_document \
    "ACTION_AUTHORITY_v1.4.0_FINAL_WHITE_PAPER.md" \
    "pdf/03_ACTION_AUTHORITY_v1.4.0_FINAL_WHITE_PAPER.pdf" \
    "Final White Paper"

convert_document \
    "GOLDEN_MASTER_AMENDMENT_VERIFICATION.md" \
    "pdf/04_GOLDEN_MASTER_AMENDMENT_VERIFICATION.pdf" \
    "Amendment Verification"

convert_document \
    "GOLDEN_MASTER_BILL_OF_MATERIALS.md" \
    "pdf/05_GOLDEN_MASTER_BILL_OF_MATERIALS.pdf" \
    "Bill of Materials"

convert_document \
    "GOLDEN_MASTER_REGULATORY_ALIGNMENT.md" \
    "pdf/06_GOLDEN_MASTER_REGULATORY_ALIGNMENT.pdf" \
    "Regulatory Alignment"

convert_document \
    "GOLDEN_MASTER_STATEMENT_OF_CONFORMITY.md" \
    "pdf/07_GOLDEN_MASTER_STATEMENT_OF_CONFORMITY.pdf" \
    "Statement of Conformity"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SECTION 2: ARCHIVE ORGANIZATION (2 Files)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

convert_document \
    "GOLDEN_MASTER_ARCHIVE_INDEX.md" \
    "pdf/08_GOLDEN_MASTER_ARCHIVE_INDEX.pdf" \
    "Archive Index"

convert_document \
    "GOLDEN_MASTER_ARCHIVE_MANIFEST.md" \
    "pdf/09_GOLDEN_MASTER_ARCHIVE_MANIFEST.pdf" \
    "Archive Manifest"

convert_document \
    "GOLDEN_MASTER_DEPLOYMENT_CHECKLIST.md" \
    "pdf/10_GOLDEN_MASTER_DEPLOYMENT_CHECKLIST.pdf" \
    "Deployment Checklist"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SECTION 3: SUPPORTING DOCUMENTATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Convert supporting docs from src/action-authority/
convert_document \
    "src/action-authority/INVARIANTS_ENFORCED.md" \
    "pdf/11_INVARIANTS_ENFORCED.pdf" \
    "Invariants Enforced"

convert_document \
    "src/action-authority/LEVEL_5_HYBRID_ANCHOR.md" \
    "pdf/12_LEVEL_5_HYBRID_ANCHOR.pdf" \
    "Level 5: Hybrid Anchor"

convert_document \
    "src/action-authority/BOOTSTRAP_SEMANTIC.md" \
    "pdf/13_BOOTSTRAP_SEMANTIC.pdf" \
    "Bootstrap Semantic"

convert_document \
    "src/action-authority/governance/LEASE_RULES.md" \
    "pdf/14_LEASE_RULES.pdf" \
    "Lease Rules"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CREATING UNIFIED PDF BUNDLE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# List all PDFs in order
PDF_FILES=(
    "pdf/01_GOLDEN_MASTER_EXECUTIVE_SUMMARY.pdf"
    "pdf/02_ACTION_AUTHORITY_v1.4.0_EXECUTIVE_WHITE_PAPER.pdf"
    "pdf/03_ACTION_AUTHORITY_v1.4.0_FINAL_WHITE_PAPER.pdf"
    "pdf/04_GOLDEN_MASTER_AMENDMENT_VERIFICATION.pdf"
    "pdf/05_GOLDEN_MASTER_BILL_OF_MATERIALS.pdf"
    "pdf/06_GOLDEN_MASTER_REGULATORY_ALIGNMENT.pdf"
    "pdf/07_GOLDEN_MASTER_STATEMENT_OF_CONFORMITY.pdf"
    "pdf/08_GOLDEN_MASTER_ARCHIVE_INDEX.pdf"
    "pdf/09_GOLDEN_MASTER_ARCHIVE_MANIFEST.pdf"
    "pdf/10_GOLDEN_MASTER_DEPLOYMENT_CHECKLIST.pdf"
    "pdf/11_INVARIANTS_ENFORCED.pdf"
    "pdf/12_LEVEL_5_HYBRID_ANCHOR.pdf"
    "pdf/13_BOOTSTRAP_SEMANTIC.pdf"
    "pdf/14_LEASE_RULES.pdf"
)

# Combine all PDFs using ghostscript if available
if command -v gs &> /dev/null; then
    echo "Combining PDFs with ghostscript..."
    gs -q -dNOPAUSE -dBATCH -dSAFER \
        -sDEVICE=pdfwrite \
        -sOutputFile="pdf/ACTION_AUTHORITY_v1.4.0_COMPLETE_ARCHIVE.pdf" \
        "${PDF_FILES[@]}"

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Created unified bundle: ACTION_AUTHORITY_v1.4.0_COMPLETE_ARCHIVE.pdf${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  ghostscript not found - individual PDFs created${NC}"
    echo "To combine PDFs, install: brew install ghostscript"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# List generated files
PDF_COUNT=$(find pdf -name "*.pdf" 2>/dev/null | wc -l)
echo "📊 PDF Documents Created:"
echo "   Individual PDFs: $PDF_COUNT files"

if [ -f "pdf/ACTION_AUTHORITY_v1.4.0_COMPLETE_ARCHIVE.pdf" ]; then
    BUNDLE_SIZE=$(ls -lh "pdf/ACTION_AUTHORITY_v1.4.0_COMPLETE_ARCHIVE.pdf" | awk '{print $5}')
    echo "   Unified Bundle: ACTION_AUTHORITY_v1.4.0_COMPLETE_ARCHIVE.pdf ($BUNDLE_SIZE)"
fi

echo ""
echo "📁 Location: ./pdf/"
echo ""
echo "📋 Document Manifest:"
ls -1 pdf/ | nl
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ PDF Bundle Creation Complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🚀 Ready for Regulatory Submission"
echo ""
