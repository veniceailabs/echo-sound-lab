# Echo Sound Lab Beta Test Plan (Sunday Launch)

Launch target: **Sunday, February 15, 2026**

## A) Pre-Launch Checklist (Internal)
- [ ] Production URL opens
- [ ] AI Studio can record and build a song
- [ ] Cover art appears for generated song
- [ ] Open in Single Track works
- [ ] Improve My Mix runs without error
- [ ] SFS Video Engine renders output
- [ ] Feedback button opens email to `beta@echosoundlab.com`

## B) Tester Scope (Keep It Simple)
Each tester runs one end-to-end loop only:
1. Create in AI Studio
2. Polish in Single Track
3. Render in SFS Video Engine
4. Send feedback

## C) Success Criteria
- No blocker bugs in the core loop
- No severe audio degradation reports
- Feedback submission path works for all testers

## D) Triage Rules
- `P0`: Crash, data loss, cannot complete core loop
- `P1`: Major quality issue, but loop still completes
- `P2`: UX polish and nice-to-have improvements

## E) Daily Beta Rhythm
- Morning: review new feedback emails
- Midday: classify P0/P1/P2
- Evening: publish short status note and next fixes

## F) Exit Criteria For Public Launch
- Core loop stable for 3 consecutive days
- All P0 fixed
- P1 list reduced to acceptable launch set
