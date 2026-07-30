-- Echo Sound Lab — Production Database Schema
-- Supabase PostgreSQL
-- Created: April 16, 2026

-- ============================================================================
-- USERS & AUTHENTICATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  subscription_tier TEXT CHECK (subscription_tier IN ('free', 'artist', 'engineer', 'studio')) DEFAULT 'free',
  stripe_customer_id TEXT,
  distrokid_access_token TEXT,
  distrokid_refresh_token TEXT,
  distrokid_token_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX idx_users_stripe_customer_id ON users(stripe_customer_id);

-- ============================================================================
-- SUBSCRIPTIONS & PAYMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  tier TEXT CHECK (tier IN ('free', 'artist', 'engineer', 'studio')) NOT NULL,
  status TEXT CHECK (status IN ('active', 'paused', 'canceled')) DEFAULT 'active',
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

CREATE TABLE IF NOT EXISTS export_quota (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier TEXT CHECK (tier IN ('free', 'artist', 'engineer', 'studio')) NOT NULL,
  exports_this_month INTEGER DEFAULT 0,
  reset_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_export_quota_user_month ON export_quota(user_id, reset_date);

-- ============================================================================
-- PROJECTS & COLLABORATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  state JSONB DEFAULT '{}'::jsonb, -- vocal_chain, beat_config, master_settings
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_projects_owner_id ON projects(owner_id);

CREATE TABLE IF NOT EXISTS project_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('owner', 'engineer', 'artist', 'viewer')) NOT NULL,
  invited_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_collaborators_project_id ON project_collaborators(project_id);
CREATE INDEX idx_project_collaborators_user_id ON project_collaborators(user_id);

CREATE TABLE IF NOT EXISTS project_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  description TEXT,
  snapshot JSONB NOT NULL, -- Full project state at this version
  is_variant BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_project_versions_project_id ON project_versions(project_id);
CREATE INDEX idx_project_versions_created_by ON project_versions(created_by);

CREATE TABLE IF NOT EXISTS project_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  mentions TEXT[], -- Array of user_ids mentioned with @
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_project_comments_project_id ON project_comments(project_id);
CREATE INDEX idx_project_comments_author_id ON project_comments(author_id);

-- ============================================================================
-- MARKETPLACE PRODUCTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketplace_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('beat', 'preset', 'stems')) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  genre TEXT NOT NULL,
  bpm INTEGER,
  key TEXT, -- Musical key (C, C#, D, etc.)
  tags TEXT[], -- Array of tags
  preview_url TEXT, -- URL to audio preview
  audio_file_key TEXT, -- S3/Supabase storage key
  personal_price DECIMAL(10, 2),
  commercial_price DECIMAL(10, 2),
  exclusive_price DECIMAL(10, 2),
  downloads INTEGER DEFAULT 0,
  rating DECIMAL(2, 1) DEFAULT 0, -- 0-5
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_marketplace_products_creator_id ON marketplace_products(creator_id);
CREATE INDEX idx_marketplace_products_type ON marketplace_products(type);
CREATE INDEX idx_marketplace_products_genre ON marketplace_products(genre);
CREATE INDEX idx_marketplace_products_is_active ON marketplace_products(is_active);

CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  text TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(product_id, buyer_id)
);

CREATE INDEX idx_product_reviews_product_id ON product_reviews(product_id);

-- ============================================================================
-- ORDERS & PURCHASES
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_amount DECIMAL(10, 2) NOT NULL,
  stripe_payment_intent_id TEXT,
  status TEXT CHECK (status IN ('pending', 'completed', 'refunded')) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  refunded_at TIMESTAMP
);

CREATE INDEX idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_stripe_payment_intent_id ON orders(stripe_payment_intent_id);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES marketplace_products(id),
  license_type TEXT CHECK (license_type IN ('personal', 'commercial', 'exclusive')) NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

CREATE TABLE IF NOT EXISTS royalty_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES marketplace_products(id),
  recipient_id UUID NOT NULL REFERENCES users(id),
  amount DECIMAL(10, 2) NOT NULL,
  percentage DECIMAL(5, 2) NOT NULL,
  status TEXT CHECK (status IN ('pending', 'paid')) DEFAULT 'pending',
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_royalty_splits_order_id ON royalty_splits(order_id);
CREATE INDEX idx_royalty_splits_recipient_id ON royalty_splits(recipient_id);
CREATE INDEX idx_royalty_splits_status ON royalty_splits(status);

-- ============================================================================
-- CREATOR EARNINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS creator_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  total_earnings DECIMAL(10, 2) DEFAULT 0,
  total_sales INTEGER DEFAULT 0,
  pending_payout DECIMAL(10, 2) DEFAULT 0,
  last_payout_at TIMESTAMP,
  stripe_connected_account_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_creator_earnings_creator_id ON creator_earnings(creator_id);

-- ============================================================================
-- DISTRIBUTION & RELEASES
-- ============================================================================

CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  distrokid_release_id TEXT,
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  audio_file_key TEXT NOT NULL, -- S3/storage key
  platforms TEXT[], -- Array: spotify, apple_music, youtube_music, amazon_music, tidal, soundcloud, bandcamp
  status TEXT CHECK (status IN ('draft', 'submitted', 'live', 'rejected')) DEFAULT 'draft',
  submitted_at TIMESTAMP,
  live_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_releases_creator_id ON releases(creator_id);
CREATE INDEX idx_releases_status ON releases(status);
CREATE INDEX idx_releases_distrokid_release_id ON releases(distrokid_release_id);

-- ============================================================================
-- ANALYTICS & AUDIT
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_earnings ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY users_select_own ON users FOR SELECT USING (auth.uid()::text = id::text);
CREATE POLICY users_update_own ON users FOR UPDATE USING (auth.uid()::text = id::text);

-- Users can see projects they own or collaborate on
CREATE POLICY projects_select_own ON projects FOR SELECT USING (
  owner_id::text = auth.uid()::text OR
  id IN (SELECT project_id FROM project_collaborators WHERE user_id::text = auth.uid()::text)
);

-- Users can see marketplace products
CREATE POLICY marketplace_products_select ON marketplace_products FOR SELECT USING (is_active = TRUE);

-- Users can only see their own orders
CREATE POLICY orders_select_own ON orders FOR SELECT USING (buyer_id::text = auth.uid()::text);

-- Creators can see their own earnings
CREATE POLICY creator_earnings_select_own ON creator_earnings FOR SELECT USING (creator_id::text = auth.uid()::text);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_marketplace_products_updated_at BEFORE UPDATE ON marketplace_products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_creator_earnings_updated_at BEFORE UPDATE ON creator_earnings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create creator_earnings on first sale
CREATE OR REPLACE FUNCTION create_creator_earnings_on_product()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO creator_earnings (creator_id, total_earnings, total_sales, pending_payout)
  VALUES (NEW.creator_id, 0, 0, 0)
  ON CONFLICT (creator_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_creator_earnings AFTER INSERT ON marketplace_products FOR EACH ROW EXECUTE FUNCTION create_creator_earnings_on_product();

-- Update creator earnings on order completion
CREATE OR REPLACE FUNCTION update_creator_earnings_on_order()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE creator_earnings
    SET
      total_earnings = total_earnings + COALESCE((SELECT SUM(amount) FROM royalty_splits WHERE order_id = NEW.id), 0),
      pending_payout = pending_payout + COALESCE((SELECT SUM(amount) FROM royalty_splits WHERE order_id = NEW.id), 0),
      total_sales = total_sales + 1
    WHERE creator_id IN (SELECT DISTINCT recipient_id FROM royalty_splits WHERE order_id = NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_creator_earnings AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_creator_earnings_on_order();

-- Auto-log major actions
CREATE OR REPLACE FUNCTION log_action()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, resource_type, resource_id, metadata)
  VALUES (
    auth.uid()::uuid,
    TG_ARGV[0],
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END,
    CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE row_to_json(NEW) END
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_product_create AFTER INSERT ON marketplace_products FOR EACH ROW EXECUTE FUNCTION log_action('product_created');
CREATE TRIGGER trigger_log_order_complete AFTER UPDATE ON orders FOR EACH ROW WHEN (NEW.status = 'completed' AND OLD.status != 'completed') EXECUTE FUNCTION log_action('order_completed');
