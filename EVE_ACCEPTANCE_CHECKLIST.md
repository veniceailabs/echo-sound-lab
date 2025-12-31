# EVE Acceptance Checklist

Status: Locked.

Purpose: Binary pass/fail checks that define "working EVE" as a creative interpretation engine (not an execution system).

## Acceptance Criteria (Pass/Fail)

AC-1: Mandatory pre-generation stages run in order.
- Classification -> Feasibility -> Prompt Compilation -> Confidence Gating -> (only then) Generation.
- Failure of any stage blocks generation and is logged.

AC-2: Media classification is required and explicit.
- AI-generated vs human-recorded classification is produced.
- Human-face presence is detected or explicitly marked unknown.
- Motion continuity, camera stability, lighting consistency, and identity risk are assessed.

AC-3: Intent vs feasibility is enforced.
- If feasibility is below threshold, EVE halts, explains, and offers safer alternatives.
- No generation occurs when feasibility is low.

AC-4: Prompt compilation is mandatory.
- Raw user prompts are never sent directly to the model.
- Compiled prompts include constraints and continuity/identity guards.
- Compiled prompt output is inspectable.

AC-5: Confidence gating is a hard stop.
- If confidence < threshold, execution halts with a clear explanation.
- No "best-effort" generation below threshold.

AC-6: Human-footage protection is enforced.
- For human-recorded footage with faces or identity risk, EVE uses probabilistic language.
- If confidence is low, EVE refuses or downshifts to safer alternatives.

AC-7: No execution authority.
- EVE does not execute rendering; it only compiles and gates.
- EVE cannot bypass engine/system constraints or force generation.

AC-8: No background or autonomous behavior.
- No auto-retries, silent parameter tuning, or "try again better" loops.
- Each generation attempt requires explicit user intent.

AC-9: Same gates apply to all providers.
- Local GPU/CPU and any external provider obey identical gates and thresholds.

AC-10: Audit trace is complete and human-readable.
- Every run logs classification, feasibility, confidence, and compiled prompt id.
- Refusals are logged with reasons and alternatives offered.

AC-11: Safer alternatives are offered when gated.
- At least one alternative is proposed (looping, cutaways, stylized continuation, slow motion, reframe), or "none" is stated explicitly.

## Broken If
- EVE behaves like a raw prompt box.
- EVE generates despite low feasibility or low confidence.
- Human-recorded footage is extended without explicit warnings and safer alternatives.
- Compiled prompts are not inspectable or constraints are missing.
