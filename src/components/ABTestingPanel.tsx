import React, { useState, useRef } from 'react';
import './ABTestingPanel.css';

interface TestVariant {
  id: string;
  name: string;
  audioUrl: string;
  config: {
    genre: string;
    style: string;
    targetLoudness: number;
  };
  metadata: {
    integrated_loudness: number;
    true_peak: number;
    quality_score: number;
  };
  createdAt: Date;
  votes: number; // User votes for this variant
}

export const ABTestingPanel: React.FC = () => {
  const [variants, setVariants] = useState<TestVariant[]>([]);
  const [activeVariant, setActiveVariant] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<[string | null, string | null]>([null, null]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [votedFor, setVotedFor] = useState<string | null>(null);

  const handleCreateVariant = (name: string, config: TestVariant['config'], audioUrl: string) => {
    const variant: TestVariant = {
      id: `variant_${Date.now()}`,
      name,
      audioUrl,
      config,
      metadata: {
        integrated_loudness: -14.2,
        true_peak: -0.5,
        quality_score: 88,
      },
      createdAt: new Date(),
      votes: 0,
    };

    setVariants([...variants, variant]);
    setActiveVariant(variant.id);
  };

  const handleStartComparison = (variantAId: string, variantBId: string) => {
    setSelectedVariants([variantAId, variantBId]);
    setIsComparing(true);
  };

  const handleVote = (variantId: string) => {
    setVariants((prev) =>
      prev.map((v) =>
        v.id === variantId ? { ...v, votes: v.votes + 1 } : v
      )
    );
    setVotedFor(variantId);
  };

  const handlePlayVariant = (variantId: string) => {
    const variant = variants.find((v) => v.id === variantId);
    if (variant && audioRef.current) {
      audioRef.current.src = variant.audioUrl;
      audioRef.current.play();
    }
  };

  return (
    <div className="ab-testing-panel">
      <div className="panel-header">
        <h1>ðŸ”A/B Testing Studio</h1>
        <p>Compare mastering/mixing variations side-by-side</p>
      </div>

      {!isComparing ? (
        <div className="variants-list">
          <h2>Variants ({variants.length})</h2>

          {variants.length === 0 ? (
            <div className="empty-state">
              <p>No variants yet. Create a variant to start testing.</p>
            </div>
          ) : (
            <div className="variants-grid">
              {variants.map((variant) => (
                <div
                  key={variant.id}
                  className={`variant-card ${activeVariant === variant.id ? 'active' : ''}`}
                  onClick={() => setActiveVariant(variant.id)}
                >
                  <div className="variant-header">
                    <h3>{variant.name}</h3>
                    <span className="vote-count">{variant.votes} votes</span>
                  </div>

                  <div className="variant-config">
                    <span>{variant.config.genre}</span>
                    <span>â€¢</span>
                    <span>{variant.config.style}</span>
                    <span>â€¢</span>
                    <span>{variant.config.targetLoudness} LUFS</span>
                  </div>

                  <div className="variant-metrics">
                    <div className="metric">
                      <label>Loudness</label>
                      <value>{variant.metadata.integrated_loudness.toFixed(1)}</value>
                    </div>
                    <div className="metric">
                      <label>True Peak</label>
                      <value>{variant.metadata.true_peak.toFixed(2)}</value>
                    </div>
                    <div className="metric">
                      <label>Quality</label>
                      <value className="quality-score">
                        {variant.metadata.quality_score.toFixed(0)}/100
                      </value>
                    </div>
                  </div>

                  <div className="variant-actions">
                    <button
                      className="play-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayVariant(variant.id);
                      }}
                    >
                      â–¶ï¸Listen
                    </button>
                    <button
                      className="compare-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (activeVariant && activeVariant !== variant.id) {
                          handleStartComparison(activeVariant, variant.id);
                        }
                      }}
                      disabled={!activeVariant || activeVariant === variant.id}
                    >
                      Compare
                    </button>
                  </div>

                  <div className="created-at">
                    {variant.createdAt.toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="comparison-view">
          <button
            className="back-btn"
            onClick={() => setIsComparing(false)}
          >
            â†Back to Variants
          </button>

          <div className="comparison-header">
            <h2>A/B Comparison</h2>
            <p>Listen to both variants and vote for your preference</p>
          </div>

          <div className="comparison-grid">
            {selectedVariants.map((variantId, index) => {
              const variant = variants.find((v) => v.id === variantId);
              if (!variant) return null;

              const isVariantA = index === 0;

              return (
                <div
                  key={variant.id}
                  className={`comparison-card ${isVariantA ? 'variant-a' : 'variant-b'}`}
                >
                  <div className="card-label">
                    {isVariantA ? 'Version A' : 'Version B'}
                  </div>

                  <h3>{variant.name}</h3>

                  <div className="config-display">
                    <div className="config-item">
                      <label>Genre:</label>
                      <value>{variant.config.genre}</value>
                    </div>
                    <div className="config-item">
                      <label>Style:</label>
                      <value>{variant.config.style}</value>
                    </div>
                    <div className="config-item">
                      <label>Loudness:</label>
                      <value>{variant.config.targetLoudness} LUFS</value>
                    </div>
                  </div>

                  <div className="metrics-display">
                    <div className="metric-row">
                      <span>Integrated Loudness:</span>
                      <strong>{variant.metadata.integrated_loudness.toFixed(1)} LUFS</strong>
                    </div>
                    <div className="metric-row">
                      <span>True Peak:</span>
                      <strong>{variant.metadata.true_peak.toFixed(2)} dBFS</strong>
                    </div>
                    <div className="metric-row">
                      <span>Quality Score:</span>
                      <strong>{variant.metadata.quality_score.toFixed(0)}/100</strong>
                    </div>
                  </div>

                  <div className="comparison-actions">
                    <button
                      className="listen-btn"
                      onClick={() => handlePlayVariant(variant.id)}
                    >
                      ðŸŽListen
                    </button>
                    <button
                      className={`vote-btn ${votedFor === variant.id ? 'voted' : ''}`}
                      onClick={() => handleVote(variant.id)}
                    >
                      {votedFor === variant.id ? 'âœVoted' : 'ðŸ‘Vote for This'}
                    </button>
                  </div>

                  <div className="vote-count">
                    {variant.votes} votes
                  </div>
                </div>
              );
            })}
          </div>

          <div className="comparison-results">
            {votedFor && (
              <div className="vote-result">
                âœYou voted for the{' '}
                {selectedVariants[0] === votedFor ? 'left' : 'right'} variant
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden audio player */}
      <audio ref={audioRef} />
    </div>
  );
};
