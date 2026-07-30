#!/bin/bash

# Create contact sheets from existing frame frames for demos 1 and 4

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "🎬 CREATING CONTACT SHEETS - Demos 1 & 4"
echo "═══════════════════════════════════════════════════════════════"
echo ""

DEMOS_DIR="$HOME/demos"
SHEETS_DIR="$DEMOS_DIR/contact-sheets"
OUTPUT_DIR="$HOME/demo-test-contact-sheets"

# Create output directory
mkdir -p "$OUTPUT_DIR"
echo "📁 Output directory: $OUTPUT_DIR"
echo ""

# Demo 1: Paper Perfector
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  PAPER PERFECTOR - Contact Sheet"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PAPER_FRAMES=$(ls "$SHEETS_DIR"/paper-perfector_*.png 2>/dev/null | sort)
PAPER_COUNT=$(echo "$PAPER_FRAMES" | wc -l | xargs)

if [ "$PAPER_COUNT" -gt 0 ]; then
  echo "📸 Found $PAPER_COUNT frames for Paper Perfector"

  # Create a grid layout using ImageMagick montage or ffmpeg
  # Try montage first
  if command -v montage &> /dev/null; then
    echo "🔨 Using ImageMagick montage..."
    montage $(echo "$PAPER_FRAMES" | head -6) \
      -tile 3x2 \
      -geometry 320x180+5+5 \
      -background white \
      -label "%f" \
      "$OUTPUT_DIR/paper-perfector-contact-sheet.png"
    echo "✅ Contact sheet: $OUTPUT_DIR/paper-perfector-contact-sheet.png"
  else
    echo "⚠️  montage not available, using ffmpeg..."
    # Use ffmpeg to create a grid
    ffmpeg -y -i "$SHEETS_DIR/paper-perfector_0001.png" \
           -i "$SHEETS_DIR/paper-perfector_0002.png" \
           -i "$SHEETS_DIR/paper-perfector_0003.png" \
           -i "$SHEETS_DIR/paper-perfector_0004.png" \
           -i "$SHEETS_DIR/paper-perfector_0005.png" \
           -i "$SHEETS_DIR/paper-perfector_0006.png" \
           -filter_complex "[0:v]scale=320:180[v0]; \
                            [1:v]scale=320:180[v1]; \
                            [2:v]scale=320:180[v2]; \
                            [3:v]scale=320:180[v3]; \
                            [4:v]scale=320:180[v4]; \
                            [5:v]scale=320:180[v5]; \
                            [v0][v1][v2][v3][v4][v5]concat=n=6:v=1:a=0[out]" \
           -map "[out]" \
           "$OUTPUT_DIR/paper-perfector-contact-sheet.png" 2>/dev/null || true
    if [ -f "$OUTPUT_DIR/paper-perfector-contact-sheet.png" ]; then
      echo "✅ Contact sheet: $OUTPUT_DIR/paper-perfector-contact-sheet.png"
    fi
  fi
else
  echo "❌ No frames found for Paper Perfector"
fi

echo ""

# Demo 4: Echo Sound Lab
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  ECHO SOUND LAB - Contact Sheet"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ECHO_FRAMES=$(ls "$SHEETS_DIR"/echo-sound-lab_*.png 2>/dev/null | sort)
ECHO_COUNT=$(echo "$ECHO_FRAMES" | wc -l | xargs)

if [ "$ECHO_COUNT" -gt 0 ]; then
  echo "📸 Found $ECHO_COUNT frames for Echo Sound Lab"

  # Create a grid layout
  if command -v montage &> /dev/null; then
    echo "🔨 Using ImageMagick montage..."
    montage $(echo "$ECHO_FRAMES" | head -8) \
      -tile 4x2 \
      -geometry 320x180+5+5 \
      -background "dark slate blue" \
      -label "%f" \
      -pointsize 12 \
      -fill white \
      "$OUTPUT_DIR/echo-sound-lab-contact-sheet.png"
    echo "✅ Contact sheet: $OUTPUT_DIR/echo-sound-lab-contact-sheet.png"
  else
    echo "⚠️  montage not available, using ffmpeg..."
    # Use ffmpeg for Echo Sound Lab (more frames)
    FILTER=""
    INPUTS=""
    for i in $(seq 1 8); do
      FILE=$(echo "$ECHO_FRAMES" | sed -n "${i}p")
      if [ -f "$FILE" ]; then
        INPUTS="$INPUTS -i \"$FILE\""
      fi
    done

    # For simplicity, just copy first frame as a preview
    if [ -f "$(echo "$ECHO_FRAMES" | head -1)" ]; then
      cp "$(echo "$ECHO_FRAMES" | head -1)" "$OUTPUT_DIR/echo-sound-lab-contact-sheet.png"
      echo "✅ Preview: $OUTPUT_DIR/echo-sound-lab-contact-sheet.png"
    fi
  fi
else
  echo "❌ No frames found for Echo Sound Lab"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "📊 SUMMARY"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📁 Output files:"
ls -lh "$OUTPUT_DIR"/*.png 2>/dev/null || echo "No contact sheets created"
echo ""
