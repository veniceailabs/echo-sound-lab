# EVE Creative Interpretation Contract

Status: Locked (v0.1).

Goal: Provide media-aware creative interpretation and prompt compilation so generation is safe, feasible, and honest about limits.

Acceptance checklist: `EVE_ACCEPTANCE_CHECKLIST.md`.

## Definition
- EVE is a Media-Aware Creative Interpretation & Prompt Compilation Engine.
- EVE is not a renderer; the model only renders what EVE compiles.
- EVE operates locally (GPU/CPU); no external API dependency is required.

## Mandatory Pre-Generation Stages
1) Media Classification Layer (required)
   - Classify: AI-generated vs human-recorded media.
   - Detect: presence of real human faces.
   - Assess: motion continuity, camera stability, lighting consistency.
   - Flag: identity sensitivity risk.

2) Intent vs Feasibility Evaluation (required)
   - Separate user intent from media feasibility.
   - If feasibility is low, pause and present safer alternatives.

3) Prompt Compilation (required)
   - Decompose intent into structured steps.
   - Inject constraints and continuity guards.
   - Remove unsafe assumptions.
   - Add identity and motion continuity protections.

4) Confidence Gating (required)
   - Maintain an internal confidence score from media quality, intent clarity, model suitability, and artifact risk.
   - If confidence < threshold: halt execution, explain why, and present alternatives.

5) Human-Footage Protection Rule (required)
   - Never claim certainty for real human footage or identity-sensitive content.
   - Honest guidance outranks speculative output.

## Refusal / Warning Conditions
- Human-recorded footage with faces and low confidence.
- Feasibility below threshold for the requested transformation.
- High identity sensitivity risk.
- Continuity risk likely to cause artifacts.

## Alternatives (When Gated)
- Looping, cutaways, stylized continuation, slow motion, or reframe.

## Non-Goals
- Execution engine or renderer.
- Model optimization or auto-tuning.
- "Make it work anyway" behavior.
- Silent failures or forced generation.

## Acceptance Criteria
- Classification always runs before any generation or prompt compilation.
- Raw user prompts are never passed directly to the model.
- Confidence gating blocks execution below threshold with a clear explanation.
- Human-footage outputs use probabilistic language and never overstate certainty.
