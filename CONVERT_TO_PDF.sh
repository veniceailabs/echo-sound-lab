#!/bin/bash
# Convert all Golden Master HTML documents to PDF
# Usage: bash CONVERT_TO_PDF.sh

echo "🏛️  Converting Golden Master Archive to PDF..."
echo ""

cd "$(dirname "$0")"

# Function to convert HTML to PDF using macOS print-to-PDF
convert_to_pdf() {
  local input_file="$1"
  local output_file="${input_file%.html}.pdf"

  echo "Converting: $input_file → $output_file"

  # Use wkhtmltopdf if available
  if command -v wkhtmltopdf &> /dev/null; then
    wkhtmltopdf "$input_file" "$output_file" 2>/dev/null
    if [ $? -eq 0 ]; then
      echo "✅ Created: $output_file"
      return 0
    fi
  fi

  # Fallback: Use macOS cupsfilter (built-in)
  # This requires opening in Safari and printing, which we can automate with AppleScript

  # Alternative: Use pandoc with wkhtmltopdf backend (if available)
  # pandoc "$input_file" -o "$output_file" 2>/dev/null

  echo "⚠️  Could not convert $input_file"
  echo "   Please use browser Print → Save as PDF"
  return 1
}

# Convert all Golden Master documents
echo "Converting documents..."
echo ""

convert_to_pdf "ACTION_AUTHORITY_v1.4.0_EXECUTIVE_WHITE_PAPER.html"
convert_to_pdf "ACTION_AUTHORITY_v1.4.0_FINAL_WHITE_PAPER.html"
convert_to_pdf "GOLDEN_MASTER_AMENDMENT_VERIFICATION.html"
convert_to_pdf "GOLDEN_MASTER_BILL_OF_MATERIALS.html"
convert_to_pdf "GOLDEN_MASTER_REGULATORY_ALIGNMENT.html"
convert_to_pdf "GOLDEN_MASTER_EXECUTIVE_SUMMARY.html"
convert_to_pdf "GOLDEN_MASTER_STATEMENT_OF_CONFORMITY.html"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "If the above conversions didn't work, use this method:"
echo ""
echo "BROWSER PRINT-TO-PDF METHOD (Most Reliable):"
echo "1. Open any .html file in your web browser"
echo "2. Press Cmd+P (Print)"
echo "3. Click 'PDF' dropdown → 'Save as PDF'"
echo "4. Choose filename and location"
echo ""
echo "Files to convert:"
ls -1 GOLDEN_MASTER_*.html ACTION_AUTHORITY_v1.4.0_*.html
echo ""
echo "═══════════════════════════════════════════════════════════"
