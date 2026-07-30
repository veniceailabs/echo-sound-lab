"""
ESL ML Pipeline — Step 3: Export trained model weights to JavaScript-compatible JSON.
This replaces the heuristic in AestheticClassifierService.ts with real trained weights.

Usage:
    python export_to_js.py --model-dir ./models --output ../src/ml/model_weights.json
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import xgboost as xgb


def extract_tree_weights(clf: xgb.XGBClassifier, feature_names: list) -> dict:
    """Extract decision tree structure as JSON for JS inference."""
    booster = clf.get_booster()
    trees_json = booster.trees_to_dataframe()

    # Convert to lightweight lookup table: top features + threshold + genre weights
    feature_splits = {}
    for _, row in trees_json.iterrows():
        feat = row.get('Feature', 'Leaf')
        if feat == 'Leaf':
            continue
        if feat not in feature_splits:
            feature_splits[feat] = []
        feature_splits[feat].append(float(row.get('Split', 0)))

    # Average thresholds per feature
    avg_thresholds = {
        feat: float(np.median(splits))
        for feat, splits in feature_splits.items()
        if feat in feature_names
    }

    return avg_thresholds


def main():
    parser = argparse.ArgumentParser(description='Export ESL ML model to JavaScript JSON')
    parser.add_argument('--model-dir', default='models', help='Directory containing trained models')
    parser.add_argument('--output', default='../src/ml/model_weights.json', help='Output JSON path')
    args = parser.parse_args()

    model_dir = Path(args.model_dir)
    classifier_path = model_dir / 'genre_classifier.json'
    weights_path = model_dir / 'model_weights.json'

    if not classifier_path.exists():
        print(f"Error: {classifier_path} not found. Run train_classifier.py first.")
        sys.exit(1)

    print(f"Loading trained classifier from {classifier_path}...")
    clf = xgb.XGBClassifier()
    clf.load_model(str(classifier_path))

    with open(weights_path) as f:
        base_weights = json.load(f)

    feature_names = base_weights['feature_columns']
    genre_labels = base_weights['genre_labels']
    genre_targets = base_weights['genre_targets']
    feature_importances = base_weights['feature_importances']

    print("Extracting decision tree structure...")
    avg_thresholds = extract_tree_weights(clf, feature_names)

    # Build JS-compatible inference weights
    # AestheticClassifierService.ts imports this and uses it for scoring
    js_weights = {
        'version': '2.0-trained',
        'trained': True,
        'feature_columns': feature_names,
        'genre_labels': genre_labels,
        'genre_targets': genre_targets,
        'feature_importances': feature_importances,
        'decision_thresholds': avg_thresholds,
        'genre_weights': {
            genre: {
                'lufs_ideal': genre_targets.get(genre, {}).get('target_lufs', -12.0),
                'crest_ideal': genre_targets.get(genre, {}).get('target_crest', 8.0),
                'width_ideal': genre_targets.get(genre, {}).get('target_width', 75.0),
            }
            for genre in genre_labels
        },
        'usage': (
            'Import this file in AestheticClassifierService.ts. '
            'When trained=true, use genre_weights for parametric recommendations. '
            'The decision_thresholds provide per-feature split points for scoring.'
        ),
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(js_weights, f, indent=2)

    print(f"\n✅ Exported to {output_path}")
    print(f"   Genres: {genre_labels}")
    print(f"   Top features: {list(feature_importances.keys())[:5]}")
    print(f"\nNext: The AestheticClassifierService.ts will automatically use trained=true weights")
    print("      when model_weights.json is present at src/ml/model_weights.json")


if __name__ == '__main__':
    main()
