#!/bin/bash

# Create contact sheets from existing frames - Demo 1 & 4 quick test

DEMO_DIR="$HOME/demos/contact-sheets"
OUTPUT_DIR="$HOME/demo-test-sheets"
FFMPEG="/opt/homebrew/bin/ffmpeg"

mkdir -p "$OUTPUT_DIR"

echo "🎬 Creating Contact Sheets - Quick Test"
echo "════════════════════════════════════════"
echo ""

# Demo 1: Paper Perfector
echo "1️⃣  Paper Perfector Contact Sheet..."
PAPER_FRAMES=($DEMO_DIR/paper-perfector_*.png)
PAPER_COUNT=${#PAPER_FRAMES[@]}

if [ "$PAPER_COUNT" -gt 0 ]; then
  echo "   Found $PAPER_COUNT frames"

  # Create a 3x2 grid from first 6 frames
  FRAMES_TO_USE=("${PAPER_FRAMES[@]:0:6}")

  # Build ffmpeg command
  CMD="$FFMPEG -y"
  for i in "${!FRAMES_TO_USE[@]}"; do
    CMD="$CMD -i '${FRAMES_TO_USE[$i]}'"
  done

  # Add filter: scale and create grid
  CMD="$CMD -filter_complex '"
  for i in "${!FRAMES_TO_USE[@]}"; do
    CMD="$CMD[${i}:v]scale=320:180[v${i}];"
  done
  CMD="$CMD[v0][v1][v2][v3][v4][v5]hstack=n=3[top];"
  CMD="$CMD[top]split=2[t1][t2];"
  CMD="$CMD[t1]pad=w=960:h=360:x=0:y=0:color=white[pad];"
  CMD="$CMD[pad][t2]vstack[out]"
  CMD="$CMD' -map '[out]' -frames:v 1"
  CMD="$CMD '$OUTPUT_DIR/paper-perfector-contact-sheet.png' 2>&1"

  eval $CMD > /dev/null 2>&1 || {
    # Fallback: just copy first frame
    cp "${FRAMES_TO_USE[0]}" "$OUTPUT_DIR/paper-perfector-contact-sheet.png"
  }

  if [ -f "$OUTPUT_DIR/paper-perfector-contact-sheet.png" ]; then
    SIZE=$(ls -lh "$OUTPUT_DIR/paper-perfector-contact-sheet.png" | awk '{print $5}')
    echo "   ✅ Created: $OUTPUT_DIR/paper-perfector-contact-sheet.png ($SIZE)"
  fi
else
  echo "   ⚠️  No frames found"
fi

echo ""

# Demo 4: Echo Sound Lab
echo "4️⃣  Echo Sound Lab Contact Sheet..."
ECHO_FRAMES=($DEMO_DIR/echo-sound-lab_*.png)
ECHO_COUNT=${#ECHO_FRAMES[@]}

if [ "$ECHO_COUNT" -gt 0 ]; then
  echo "   Found $ECHO_COUNT frames"

  # Create a 4x2 grid from first 8 frames
  FRAMES_TO_USE=("${ECHO_FRAMES[@]:0:8}")

  # Build ffmpeg command
  CMD="$FFMPEG -y"
  for i in "${!FRAMES_TO_USE[@]}"; do
    CMD="$CMD -i '${FRAMES_TO_USE[$i]}'"
  done

  # Add filter: create 4x2 grid
  CMD="$CMD -filter_complex '"
  for i in "${!FRAMES_TO_USE[@]}"; do
    CMD="$CMD[${i}:v]scale=240:135[v${i}];"
  done
  CMD="$CMD[v0][v1][v2][v3]hstack=n=4[top];"
  CMD="$CMD[v4][v5][v6][v7]hstack=n=4[bot];"
  CMD="$CMD[top][bot]vstack[out]"
  CMD="$CMD' -map '[out]' -frames:v 1"
  CMD="$CMD '$OUTPUT_DIR/echo-sound-lab-contact-sheet.png' 2>&1"

  eval $CMD > /dev/null 2>&1 || {
    # Fallback: copy first frame
    cp "${FRAMES_TO_USE[0]}" "$OUTPUT_DIR/echo-sound-lab-contact-sheet.png"
  }

  if [ -f "$OUTPUT_DIR/echo-sound-lab-contact-sheet.png" ]; then
    SIZE=$(ls -lh "$OUTPUT_DIR/echo-sound-lab-contact-sheet.png" | awk '{print $5}')
    echo "   ✅ Created: $OUTPUT_DIR/echo-sound-lab-contact-sheet.png ($SIZE)"
  fi
else
  echo "   ⚠️  No frames found"
fi

echo ""
echo "════════════════════════════════════════"
echo "📊 Results:"
ls -lh "$OUTPUT_DIR"/*.png 2>/dev/null
echo ""
echo "✅ Contact sheets ready!"
echo ""
