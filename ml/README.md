# ESL ML Training Pipeline

This pipeline trains the genre classifier and mixing target regressors that power `AestheticClassifierService.ts`.

## The Goal

Train on 500+ platinum mixes → learn what "pro" sounds like per genre → ESL recommendations become prescriptive (exact dB/Hz/Q values) instead of advisory.

## Setup

```bash
cd ml/
python -m venv venv
source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
```

## Step 1: Acquire Training Data

Collect 500+ professionally mixed/mastered tracks across genres:

| Genre | Target Count | Where to find |
|-------|-------------|---------------|
| Hip-Hop | 100 | Spotify (Drake, Kendrick, J. Cole) |
| Trap | 100 | Future, Metro Boomin, Gunna |
| Pop | 100 | Doja Cat, Olivia Rodrigo, The Weeknd |
| R&B | 80 | SZA, Frank Ocean, Summer Walker |
| Jazz | 50 | Kind of Blue, ECM Records catalog |
| Classical | 50 | Deutsche Grammophon, Naxos |
| Bedroom Pop | 20 | Clairo, Rex Orange County |

Organize them like this:
```
mixes/
    hip-hop/
        track001.wav
        ...
    trap/
    pop/
    rnb/
    jazz/
    classical/
    bedroom-pop/
```

## Step 2: Extract Features

```bash
python feature_extractor.py --input ./mixes --output features.csv
```

Extracts ~20 features per track: LUFS, spectral balance (6 bands), dynamics, stereo width, phase coherence.
Output: `features.csv` with one row per track.

## Step 3: Train

```bash
python train_classifier.py --input features.csv --output-dir ./models
```

Trains:
- Genre classifier (XGBoost, 200 estimators)
- Target regressors (LUFS, crest factor, stereo width per genre)

Output: `models/genre_classifier.json`, `models/accuracy_report.txt`, `models/feature_importance.json`

## Step 4: Export to JavaScript

```bash
python export_to_js.py --model-dir ./models --output ../src/ml/model_weights.json
```

Converts model weights to a JSON format that `AestheticClassifierService.ts` can import.
When `src/ml/model_weights.json` exists with `"trained": true`, the service uses trained weights instead of heuristics.

## What Happens After Training

The `AestheticClassifierService` automatically detects trained weights:

```typescript
// AestheticClassifierService.ts already has this integration point:
import modelWeights from '../ml/model_weights.json';
// If modelWeights.trained === true → use trained genre_weights
// If false → use heuristic distance scoring (current behavior)
```

## Expected Accuracy

| Phase | Data | Expected Accuracy |
|-------|------|-------------------|
| Heuristic (current) | Documented techniques | ~65-70% genre detection |
| 200 mixes trained | Basic dataset | ~80-85% accuracy |
| 500 mixes trained | Full dataset | ~90%+ accuracy |

## Score Impact

- Heuristic model: ESL Mix Parity **85/100**
- 200-mix trained model: **87/100**
- 500-mix trained model: **90/100**
- With Phase 2B (source correction): **92/100**

## Notes

- All training data should be final masters (not stems or rough mixes)
- Minimum track length: 2 minutes
- Normalize loudness before feature extraction if comparing across sources
- The model is genre-agnostic about "quality" — it learns what each genre's characteristics are
