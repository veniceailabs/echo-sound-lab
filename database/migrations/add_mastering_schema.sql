-- Echo Sound Lab — Mastering Jobs Schema
-- Adds support for tracking professional mastering jobs

-- ============================================================================
-- MASTERING JOBS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS mastering_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  audio_url TEXT NOT NULL, -- URL to mastered audio in storage
  reference_url TEXT, -- URL to reference track if provided
  genre TEXT,
  style TEXT,
  target_loudness DECIMAL(4, 2),
  metadata JSONB, -- Full analysis results
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_mastering_jobs_job_id ON mastering_jobs(job_id);
CREATE INDEX idx_mastering_jobs_user_id ON mastering_jobs(user_id);
CREATE INDEX idx_mastering_jobs_status ON mastering_jobs(status);
CREATE INDEX idx_mastering_jobs_created_at ON mastering_jobs(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER trigger_mastering_jobs_updated_at BEFORE UPDATE ON mastering_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- MASTERING PRESETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS mastering_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  genre TEXT NOT NULL,
  style TEXT NOT NULL,
  eq_gains FLOAT8[], -- Array of 32 EQ gain values
  compression_ratio FLOAT8,
  compression_threshold FLOAT8,
  compression_attack FLOAT8,
  compression_release FLOAT8,
  saturation_amount FLOAT8,
  saturation_type TEXT,
  multiband_enabled BOOLEAN DEFAULT FALSE,
  stereo_width FLOAT8,
  target_loudness FLOAT8 DEFAULT -14,
  is_public BOOLEAN DEFAULT FALSE,
  uses INTEGER DEFAULT 0,
  rating DECIMAL(2, 1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_mastering_presets_creator_id ON mastering_presets(creator_id);
CREATE INDEX idx_mastering_presets_genre ON mastering_presets(genre);
CREATE INDEX idx_mastering_presets_is_public ON mastering_presets(is_public);

CREATE TRIGGER trigger_mastering_presets_updated_at BEFORE UPDATE ON mastering_presets FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- MASTERING HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS mastering_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES mastering_jobs(id) ON DELETE CASCADE,
  before_loudness DECIMAL(4, 2),
  after_loudness DECIMAL(4, 2),
  before_peak DECIMAL(5, 2),
  after_peak DECIMAL(5, 2),
  processing_time_seconds INTEGER,
  quality_score DECIMAL(3, 1),
  feedback TEXT, -- User feedback for training
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_mastering_history_user_id ON mastering_history(user_id);
CREATE INDEX idx_mastering_history_job_id ON mastering_history(job_id);
CREATE INDEX idx_mastering_history_created_at ON mastering_history(created_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE mastering_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mastering_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE mastering_history ENABLE ROW LEVEL SECURITY;

-- Users can see their own mastering jobs
CREATE POLICY mastering_jobs_select_own ON mastering_jobs FOR SELECT
  USING (user_id::text = auth.uid()::text);

CREATE POLICY mastering_jobs_insert_own ON mastering_jobs FOR INSERT
  WITH CHECK (user_id::text = auth.uid()::text);

-- Users can see public presets
CREATE POLICY mastering_presets_select_public ON mastering_presets FOR SELECT
  USING (is_public = TRUE);

-- Creators can see their own presets
CREATE POLICY mastering_presets_select_own ON mastering_presets FOR SELECT
  USING (creator_id::text = auth.uid()::text);

CREATE POLICY mastering_presets_insert_own ON mastering_presets FOR INSERT
  WITH CHECK (creator_id::text = auth.uid()::text);

-- Users can see their own history
CREATE POLICY mastering_history_select_own ON mastering_history FOR SELECT
  USING (user_id::text = auth.uid()::text);

CREATE POLICY mastering_history_insert_own ON mastering_history FOR INSERT
  WITH CHECK (user_id::text = auth.uid()::text);
