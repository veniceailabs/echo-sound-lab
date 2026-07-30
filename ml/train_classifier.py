"""
ESL ML Pipeline — Step 2: Train XGBoost Classifier + Regressor
Trains genre classifier and per-genre target regressors.

Usage:
    python train_classifier.py --input features.csv --output-dir ./models
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix
import xgboost as xgb

FEATURE_COLS = [
    'lufs_integrated', 'spectral_sub', 'spectral_bass', 'spectral_low_mid',
    'spectral_mid', 'spectral_high_mid', 'spectral_high', 'spectral_centroid',
    'spectral_rolloff', 'spectral_bandwidth', 'spectral_flatness',
    'rms_db', 'peak_db', 'crest_factor', 'transient_count', 'transient_density',
    'stereo_width', 'phase_coherence', 'stereo_imbalance',
]

# Pro target values per genre (from documented engineer techniques)
GENRE_TARGETS = {
    'hip-hop':      {'target_lufs': -9.0, 'target_crest': 8.0,  'target_width': 70.0},
    'trap':         {'target_lufs': -6.0, 'target_crest': 5.5,  'target_width': 85.0},
    'pop':          {'target_lufs': -9.0, 'target_crest': 7.0,  'target_width': 80.0},
    'rnb':          {'target_lufs': -10.0, 'target_crest': 8.5, 'target_width': 82.0},
    'r-and-b':      {'target_lufs': -10.0, 'target_crest': 8.5, 'target_width': 82.0},
    'jazz':         {'target_lufs': -16.0, 'target_crest': 14.0,'target_width': 72.0},
    'classical':    {'target_lufs': -20.0, 'target_crest': 22.0,'target_width': 90.0},
    'bedroom-pop':  {'target_lufs': -12.0, 'target_crest': 11.0,'target_width': 65.0},
}


def load_features(csv_path: str) -> tuple[pd.DataFrame, pd.Series]:
    df = pd.read_csv(csv_path)
    missing = [c for c in FEATURE_COLS if c not in df.columns]
    if missing:
        print(f"Warning: missing feature columns: {missing}")
        for c in missing:
            df[c] = 0.0
    X = df[FEATURE_COLS].fillna(0)
    y = df['genre'].str.lower().str.replace(' ', '-')
    return X, y


def train_genre_classifier(X_train, X_test, y_train, y_test, le, output_dir: Path):
    print("\n[1/3] Training genre classifier...")
    clf = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        use_label_encoder=False,
        eval_metric='mlogloss',
        random_state=42,
    )
    clf.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    y_pred = clf.predict(X_test)
    labels = le.classes_
    report = classification_report(y_test, y_pred, target_names=labels)
    cm = confusion_matrix(y_test, y_pred)

    print(report)
    clf.save_model(str(output_dir / 'genre_classifier.json'))

    with open(output_dir / 'accuracy_report.txt', 'w') as f:
        f.write("GENRE CLASSIFIER ACCURACY REPORT\n")
        f.write("=" * 40 + "\n\n")
        f.write(report)
        f.write(f"\nConfusion Matrix:\n{cm}\n")

    # Feature importance
    importance = dict(zip(FEATURE_COLS, clf.feature_importances_.tolist()))
    importance_sorted = dict(sorted(importance.items(), key=lambda x: x[1], reverse=True))
    with open(output_dir / 'feature_importance.json', 'w') as f:
        json.dump(importance_sorted, f, indent=2)

    print(f"  ✓ Model saved: genre_classifier.json")
    print(f"  ✓ Top features: {list(importance_sorted.keys())[:5]}")
    return clf


def train_target_regressors(X_train, X_test, y_train_raw, le, output_dir: Path):
    print("\n[2/3] Training target regressors (LUFS, dynamics, width per genre)...")
    regressors = {}
    for target_name in ['target_lufs', 'target_crest', 'target_width']:
        y_reg = y_train_raw.map(
            lambda g: GENRE_TARGETS.get(g, {}).get(target_name, 0.0)
        )
        reg = xgb.XGBRegressor(n_estimators=100, max_depth=4, learning_rate=0.1, random_state=42)
        reg.fit(X_train, y_reg)
        reg.save_model(str(output_dir / f'regressor_{target_name}.json'))
        regressors[target_name] = reg
        print(f"  ✓ {target_name} regressor saved")
    return regressors


def export_to_js_format(clf, le, feature_cols, output_dir: Path):
    print("\n[3/3] Exporting model weights for JavaScript integration...")
    # Export genre targets + feature weights as JSON for AestheticClassifierService
    weights = {
        'version': '1.0',
        'feature_columns': feature_cols,
        'genre_labels': le.classes_.tolist(),
        'genre_targets': GENRE_TARGETS,
        'feature_importances': dict(zip(feature_cols, clf.feature_importances_.tolist())),
        'model_path': 'genre_classifier.json',
        'note': 'Load genre_classifier.json with xgboost.XGBClassifier().load_model() for inference',
    }
    with open(output_dir / 'model_weights.json', 'w') as f:
        json.dump(weights, f, indent=2)
    print(f"  ✓ model_weights.json exported (copy to src/ml/ for JS integration)")


def main():
    parser = argparse.ArgumentParser(description='Train ESL aesthetic classifier')
    parser.add_argument('--input', default='features.csv', help='Input features CSV')
    parser.add_argument('--output-dir', default='models', help='Output directory for models')
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading features from {args.input}...")
    X, y_raw = load_features(args.input)

    le = LabelEncoder()
    y_enc = le.fit_transform(y_raw)

    print(f"  {len(X)} samples, {len(le.classes_)} genres: {list(le.classes_)}")

    X_train, X_test, y_train, y_test, y_raw_train, _ = train_test_split(
        X, y_enc, y_raw, test_size=0.2, random_state=42, stratify=y_enc
    )

    clf = train_genre_classifier(X_train, X_test, y_train, y_test, le, output_dir)
    train_target_regressors(X_train, X_test, y_raw_train, le, output_dir)
    export_to_js_format(clf, le, FEATURE_COLS, output_dir)

    print(f"\n✅ Training complete. Models saved to {output_dir}/")
    print("   Next: run export_to_js.py to integrate into ESL")


if __name__ == '__main__':
    main()
