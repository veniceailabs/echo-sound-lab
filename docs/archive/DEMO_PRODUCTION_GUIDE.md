# DEMO PRODUCTION GUIDE
## Step-by-Step Instructions to Record Your Demo

---

## 📋 PRE-PRODUCTION CHECKLIST (Do This First)

### Technical Setup
```
□ Ensure Echo Sound Lab running locally at http://localhost:3005/
□ Test all features work (no console errors)
□ Pick 1-2 sample audio files to use (best: rough mix that improves)
□ Create a second test file for the multi-stem section (if doing 3-min version)
□ Record audio separately: voiceover in a quiet room with good microphone
```

### Recording Software
```
□ macOS: Use QuickTime Player (built-in) or OBS Studio (free)
□ Windows: OBS Studio or Camtasia
□ Linux: OBS Studio
□ Settings: 1440p, 60fps, H.264 codec
```

### Audio Setup
```
□ Record voiceover separately in a quiet room
□ Use professional microphone or quality headset
□ No echo, no background noise
□ Aim for -12dB to -6dB peak levels (not clipping)
□ Record entire script in one take, OR do multiple takes and pick best
```

---

## 🎬 RECORDING INSTRUCTIONS: 60-SECOND VERSION

### SETUP PHASE (Before hitting record)

1. **Clear your desktop**
   - Close Slack, email, notifications
   - Set phone to silent
   - Brightness at comfortable level

2. **Open Echo Sound Lab**
   - Navigate to http://localhost:3005/
   - Refresh page to ensure clean state
   - Wait for interface to fully load

3. **Prepare audio file**
   - Have your sample audio ready to drag-drop
   - OR have it ready to click "upload" button
   - Test the upload works before recording

4. **Start screen recording**
   ```
   macOS (QuickTime):
   - Cmd+Space → type "QuickTime Player"
   - File → New Screen Recording
   - Click red record button
   - Select "Don't show mouse clicks" OR keep on

   Windows (OBS):
   - Open OBS
   - Set output to Desktop/Scene
   - Click Start Recording
   ```

5. **Record voiceover (separate track, edited in later)**
   - Use Audacity, GarageBand, or Adobe Audition
   - Read script slowly and clearly
   - Exactly 60 seconds
   - Export as WAV or MP3

---

### SHOT-BY-SHOT EXECUTION (60 seconds)

#### SHOT 1: Upload & Visualizer (0-6 seconds)
**What you do:**
- Drag audio file into the Echo Sound Lab window
- OR click upload button and select file
- Wait for waveform to render
- Wait for Sonic Analysis to populate (genre badge, loudness, etc.)

**Timing:** Total 6 seconds. Move slowly. Let interface load.

---

#### SHOT 2: AI Suggestions (6-18 seconds)
**What you do:**
- Scroll down to see "AI Recommendations" panel
- Slowly click 2-3 checkbox suggestions
  - First checkbox: slow deliberate click, wait 1 second
  - Second checkbox: same
  - Third checkbox: same
- Move cursor to show the parameter values in each suggestion

**Timing:** Total 12 seconds. SLOW CLICKS. Each click pauses 1-2 seconds.

---

#### SHOT 3: Processing (18-28 seconds)
**What you do:**
- Scroll down to find "Apply Fixes" or "Process" button
- Click it
- Watch progress indicator (don't interrupt)
- Wait for waveform to update
- Wait for Echo Report Card to appear

**Timing:** Total 10 seconds. JUST WATCH. Let system work.

---

#### SHOT 4: Plugin & Fine-tune (28-45 seconds)
**What you do:**
- Look for an Echo Report suggestion (e.g., "Adjust Compressor")
- Click to open the plugin UI
- Adjust ONE slider (drag it left/right)
- Click "Apply" or "Update"
- Wait for report to update

**Timing:** Total 17 seconds. Smooth slider drag (2-3 seconds). Pause after.

---

#### SHOT 5: Multi-Stem Tab (45-55 seconds)
**What you do:**
- Click on "MULTI" tab at top
- Let it load (3-4 seconds)
- Quick visual scan of the stems
- Click "VIDEO" tab (EVE)
- Show a quick preview clip (2-3 seconds)

**Timing:** Total 10 seconds. Quick transitions.

---

#### SHOT 6: Final Verdict (55-60 seconds)
**What you do:**
- Return to SINGLE tab
- Scroll to show Echo Report Card clearly
- Show the verdict badge ("release_ready")
- Fade out or let it sit for 5 seconds

**Timing:** Total 5 seconds. Just show the result.

---

### POST-RECORDING STEPS

1. **Save screen recording**
   - Name it: `EchoSoundLab_DEMO_60SEC_raw.mp4`
   - Note the exact duration

2. **Prepare voiceover**
   - Record/edit the 60-second voiceover script
   - Export as WAV at same sample rate as video (typically 48kHz)
   - Name it: `EchoSoundLab_VOICEOVER_60SEC.wav`

3. **Sync in video editor**
   - Use DaVinci Resolve (free), Premiere, or Final Cut
   - Import: Screen recording + Voiceover
   - Align voiceover timing with video actions
   - Add title card at start (1-2 seconds)
   - Add closing card at end (1-2 seconds)
   - Color correct if needed (keep dark theme)

4. **Export final version**
   ```
   Settings:
   - Codec: H.264
   - Resolution: 1440p (2560x1440) or 1080p
   - Frame Rate: 60fps
   - Audio: Stereo, 48kHz, -3dB peak
   - File name: EchoSoundLab_DEMO_60SEC_final.mp4
   ```

5. **Quality check**
   - Play back on phone, tablet, desktop
   - Voiceover synced to actions?
   - Audio clear and not distorted?
   - No visual glitches or lag?
   - Text readable at YouTube scale?

---

## 🎬 RECORDING INSTRUCTIONS: 3-MINUTE VERSION

### SETUP (Same as 60-sec)

1. Clear desktop
2. Open Echo Sound Lab
3. Prepare audio file (use a rougher mix than the 60-sec demo)
4. Set up screen recording at 1440p, 60fps
5. Prepare voiceover (read full 3-minute script, ~750 words)

---

### SHOT-BY-SHOT EXECUTION (3 minutes)

#### SECTION 1: Intro & Upload (0:00-0:30)

**SHOT 1A: Cold Open (0:00-0:05)**
- Just show the Echo Sound Lab dashboard
- No clicks, just sit and let viewers see the interface
- Pan camera slowly across the UI

**SHOT 1B: Upload & Visualizer (0:05-0:30)**
- Drag-drop audio file
- Let waveform load and render
- Scroll to show all metrics panels
- Pause 3-4 seconds to let viewer absorb

**Pacing:** Slow. Every click pauses 1-2 seconds.

---

#### SECTION 2: Analysis (0:30-1:30)

**SHOT 2A: Listening Pass (0:30-0:50)**
- Scroll to Listening Pass Card
- Show the tokens/confidence data
- Hover over confidence badges to highlight
- Toggle "Show insights" to reveal brief analysis text

**SHOT 2B: Recommendations (0:50-1:30)**
- Scroll to AI Recommendations panel
- Slowly select 3-4 suggestions (each click pauses 1-2 sec)
- Show parameter tooltips
- Pause to let viewer see the specificity

**Pacing:** Very deliberate. Each action emphasized.

---

#### SECTION 3: Processing (1:30-2:00)

**SHOT 3A: Apply Fixes (1:30-1:50)**
- Click "Apply Fixes" button
- Watch progress bar/spinner (8-10 seconds of waiting)
- Show waveform updating
- Show LUFS stats changing in real-time

**SHOT 3B: Echo Report (1:50-2:00)**
- Wait for Echo Report Card to populate
- Let it fully load before moving
- Show verdict badge clearly
- Pause 5 seconds for impact

**Pacing:** Mostly waiting. Let the system work. Shows it's real computation.

---

#### SECTION 4: Fine-tuning (2:00-2:45)

**SHOT 4A: Plugin Adjustment (2:00-2:30)**
- Click on an Echo Report suggestion
- Wait for plugin UI to open (3-4 seconds)
- Slowly drag a slider (e.g., threshold from -18 to -12)
- Wait 2 seconds
- Click "Apply" or "Update"
- Show report card update to reflect change

**SHOT 4B: Multi-Stem Overview (2:30-2:45)**
- Click "MULTI" tab
- Let it load completely (3-4 seconds)
- Show stems loaded with individual metrics
- Click "VIDEO" tab to show EVE
- Let EVE interface load

**Pacing:** Smooth transitions. No rushing.

---

#### SECTION 5: Closing (2:45-3:00)

**SHOT 5A: Conclusions (2:45-3:00)**
- Return to SINGLE tab
- Show final Echo Report Card one more time
- Fade to black
- Fade to closing title card ("AI Proposes. You Decide. You Control.")

**Pacing:** Let it sink in.

---

### POST-RECORDING STEPS (Same as 60-sec)

1. Export screen recording as `EchoSoundLab_DEMO_3MIN_raw.mp4`
2. Record voiceover separately (read full script), export as WAV
3. Sync in video editor (DaVinci Resolve, Premiere, etc.)
4. Add title card and closing card
5. Export as H.264, 1440p, 60fps, stereo 48kHz
6. Name final file: `EchoSoundLab_DEMO_3MIN_final.mp4`
7. Quality check on multiple devices

---

## 🎙️ VOICEOVER RECORDING TIPS

### Environment
- Record in a quiet room (closet, bedroom with curtains closed)
- Avoid rooms with hard surfaces (echo)
- Use soft surfaces (bed, clothes, carpets) to dampen sound
- Turn off AC/heating during recording

### Technique
- Sit or stand with good posture (affects voice quality)
- Position microphone 6-8 inches from mouth (not too close)
- Speak clearly, not too fast, natural cadence
- Read the script 2-3 times first (practice)
- Record multiple takes, pick the best one

### Editing (Post-recording)
- Remove mouth clicks and background noise
- Normalize audio to -3dB peak
- Add subtle high-pass filter (remove rumble below 80Hz)
- Do NOT compress or EQ heavily (sounds processed)
- Export as WAV 48kHz stereo

---

## ⏱️ TIMING REFERENCE

### 60-Second Version
```
[0-6s]    Upload & Visualizer
[6-18s]   AI Suggestions (3 selections)
[18-28s]  Processing
[28-45s]  Plugin Refinement
[45-55s]  Multi-Stem + EVE
[55-60s]  Final Verdict
```

### 3-Minute Version
```
[0:00-0:30]   Intro & Upload
[0:30-1:30]   Analysis & Suggestions
[1:30-2:00]   Processing & Verdict
[2:00-2:45]   Fine-tuning & Multi-Stem
[2:45-3:00]   Closing
```

---

## 🚨 COMMON MISTAKES TO AVOID

❌ **Don't rush the demo**
- Viewers need time to process each action
- Pause 1-2 seconds after each major click
- Let waveforms and analytics load fully

❌ **Don't record voiceover while capturing screen**
- Record audio separately for better quality
- Sync in post-production using video editor

❌ **Don't show console errors or notifications**
- Clear desktop before recording
- Test Echo Sound Lab works smoothly first

❌ **Don't adjust zoom or resolution during recording**
- Set to 100% zoom before starting
- Keep resolution consistent (1440p)

❌ **Don't click too fast or erratically**
- Smooth, deliberate movements
- Centered clicks on buttons
- Let cursor pause briefly on clickable elements

❌ **Don't forget to normalize audio**
- Peak levels should be -3dB, not clipping
- Voiceover should be clear and professional

---

## 📦 FINAL DELIVERABLES

**When you're done, you should have:**

```
✓ EchoSoundLab_DEMO_60SEC_final.mp4
✓ EchoSoundLab_DEMO_3MIN_final.mp4
✓ Both files tested on mobile/tablet/desktop
✓ Both files uploaded to YouTube (unlisted or private)
✓ Both voiceover WAV files (as backup)
```

**Total time to complete:**
- Recording + editing: 2-4 hours
- Voiceover: 30 minutes
- Sync + export: 1 hour
- **Total: 4-6 hours end-to-end**

---

## 🎯 FINAL CHECKLIST BEFORE SENDING TO VCs

- [ ] Audio is crystal clear (no background noise)
- [ ] Voiceover is synced perfectly to actions
- [ ] Video plays smoothly without stuttering
- [ ] Text is readable at 720p playback
- [ ] Title and closing cards look professional
- [ ] File size is reasonable (<500MB for 3-min)
- [ ] Video tested on YouTube/Vimeo playback
- [ ] Lighting is consistent throughout
- [ ] No visible cursor jerks or erratic movements
- [ ] Echo Sound Lab interface is clean (no UI glitches)

**You're ready to ship when: All above are checked ✓**

---

## 📞 TROUBLESHOOTING

**Problem: Voiceover is out of sync**
- Solution: Use video editor's timeline to slide audio track left/right
- Sync to a key action (e.g., user clicks checkbox when voiceover says "select")

**Problem: Video is choppy/laggy**
- Solution: Export at 60fps but your system only recorded 30fps
- Solution: Disable background apps (Slack, Chrome tabs, etc.) before recording

**Problem: Voiceover is too quiet**
- Solution: Normalize audio to -3dB in Audacity before syncing to video

**Problem: Echo Sound Lab is slow/unresponsive during recording**
- Solution: Close other applications, restart the app, try again
- Solution: Check CPU usage (Activity Monitor / Task Manager)

**Problem: Audio dropouts or clicks in voiceover**
- Solution: Re-record voiceover, use a different microphone if possible
- Solution: Check for interference from other devices

---

## 📺 DISTRIBUTION STRATEGY

**After recording, use demos for:**

1. **60-second version:**
   - Twitter/X (video posts)
   - LinkedIn (post as video)
   - YouTube Shorts (if you have channel)
   - Facebook/Instagram Reels
   - Internal Slack announcement

2. **3-minute version:**
   - YouTube channel (full upload)
   - Pitch deck (embedded video or link)
   - VC follow-up emails
   - Product hunt (if launching)
   - Documentation/onboarding (internal)

---

**Ready to start recording? Pick a quiet time, follow the shot list, and remember: slow, deliberate, clear. The demo speaks for itself.**
