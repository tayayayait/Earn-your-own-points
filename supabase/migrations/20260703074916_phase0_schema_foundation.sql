CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE public.admin_role AS ENUM ('owner', 'manager', 'operator', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.user_status AS ENUM ('active', 'dormant', 'withdrawn', 'blocked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.policy_status AS ENUM ('draft', 'scheduled', 'active', 'paused', 'ended', 'disabled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.async_job_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'retrying');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'event_earn';
ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'manual_earn';
ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'use';
ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'manual_deduct';
ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'earn_cancel';
ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'use_cancel';

ALTER TYPE public.tx_status ADD VALUE IF NOT EXISTS 'confirmed';
ALTER TYPE public.tx_status ADD VALUE IF NOT EXISTS 'canceled';
ALTER TYPE public.tx_status ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE public.tx_status ADD VALUE IF NOT EXISTS 'expired';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status public.user_status NOT NULL DEFAULT 'active';
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_role public.admin_role;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS customer_code TEXT;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_transaction_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_customer_code_key
  ON public.profiles (customer_code)
  WHERE customer_code IS NOT NULL;

ALTER TABLE public.point_transactions
  ADD COLUMN IF NOT EXISTS balance_after INTEGER;
ALTER TABLE public.point_transactions
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.point_transactions
  ADD COLUMN IF NOT EXISTS original_transaction_id UUID REFERENCES public.point_transactions(id);
ALTER TABLE public.point_transactions
  ADD COLUMN IF NOT EXISTS external_transaction_id TEXT;
ALTER TABLE public.point_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.point_transactions
  ADD COLUMN IF NOT EXISTS policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS point_transactions_idempotency_key_idx
  ON public.point_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS point_transactions_external_transaction_id_idx
  ON public.point_transactions (external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id),
  actor_role public.admin_role,
  action TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id TEXT,
  before_data JSONB,
  after_data JSONB,
  reason TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL DEFAULT '포인트 솔루션',
  point_label TEXT NOT NULL DEFAULT 'P',
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#2563EB',
  secondary_color TEXT,
  home_message TEXT,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brand_settings_singleton CHECK (id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.point_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  earning_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  earn_unit INTEGER NOT NULL DEFAULT 1,
  rounding_method TEXT NOT NULL DEFAULT 'floor',
  min_redeem_points INTEGER NOT NULL DEFAULT 0,
  max_redeem_ratio NUMERIC(5, 2) NOT NULL DEFAULT 100,
  redeem_unit INTEGER NOT NULL DEFAULT 1,
  valid_months INTEGER NOT NULL DEFAULT 12,
  pending_days INTEGER NOT NULL DEFAULT 0,
  excluded_payment_methods TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status public.policy_status NOT NULL DEFAULT 'draft',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT point_policies_rate_range CHECK (earning_rate >= 0 AND earning_rate <= 100),
  CONSTRAINT point_policies_redeem_ratio_range CHECK (max_redeem_ratio >= 0 AND max_redeem_ratio <= 100)
);

CREATE TABLE IF NOT EXISTS public.customer_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  qualification_months INTEGER NOT NULL DEFAULT 12,
  min_spend INTEGER NOT NULL DEFAULT 0,
  min_purchase_count INTEGER NOT NULL DEFAULT 0,
  base_earn_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  bonus_earn_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  min_keep_spend INTEGER NOT NULL DEFAULT 0,
  status public.policy_status NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name),
  UNIQUE (sort_order),
  CONSTRAINT customer_tiers_qualification_months_range CHECK (
    qualification_months >= 1 AND qualification_months <= 24
  )
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tier_id UUID REFERENCES public.customer_tiers(id);

CREATE TABLE IF NOT EXISTS public.product_point_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  earning_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  excluded BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 100,
  status public.policy_status NOT NULL DEFAULT 'draft',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_point_policies_target_type CHECK (target_type IN ('product', 'category')),
  CONSTRAINT product_point_policies_priority_range CHECK (priority >= 1 AND priority <= 999),
  CONSTRAINT product_point_policies_rate_range CHECK (earning_rate >= 0 AND earning_rate <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_point_policies_priority_active_idx
  ON public.product_point_policies (target_type, priority)
  WHERE status IN ('scheduled', 'active');

CREATE TABLE IF NOT EXISTS public.point_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status public.policy_status NOT NULL DEFAULT 'draft',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  target_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  reward_type TEXT NOT NULL,
  reward_value NUMERIC(12, 2) NOT NULL,
  customer_limit INTEGER,
  total_budget_points INTEGER,
  spent_points INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 100,
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT point_events_reward_type CHECK (reward_type IN ('rate', 'fixed')),
  CONSTRAINT point_events_positive_reward CHECK (reward_value > 0),
  CONSTRAINT point_events_positive_customer_limit CHECK (customer_limit IS NULL OR customer_limit > 0),
  CONSTRAINT point_events_valid_period CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_suffix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT api_keys_status CHECK (status IN ('active', 'revoked'))
);

CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  event_types TEXT[] NOT NULL,
  signing_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT webhooks_status CHECK (status IN ('active', 'paused', 'disabled'))
);

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES public.webhooks(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS point_policies_status_idx ON public.point_policies (status);
CREATE INDEX IF NOT EXISTS customer_tiers_status_idx ON public.customer_tiers (status);
CREATE INDEX IF NOT EXISTS product_point_policies_status_idx ON public.product_point_policies (status);
CREATE INDEX IF NOT EXISTS point_events_status_period_idx ON public.point_events (status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS api_keys_status_idx ON public.api_keys (status);
CREATE INDEX IF NOT EXISTS webhooks_status_idx ON public.webhooks (status);
CREATE INDEX IF NOT EXISTS webhook_logs_created_at_idx ON public.webhook_logs (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.point_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_tiers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_point_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.point_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhooks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_logs TO authenticated;

GRANT ALL ON public.audit_logs TO service_role;
GRANT ALL ON public.brand_settings TO service_role;
GRANT ALL ON public.point_policies TO service_role;
GRANT ALL ON public.customer_tiers TO service_role;
GRANT ALL ON public.product_point_policies TO service_role;
GRANT ALL ON public.point_events TO service_role;
GRANT ALL ON public.api_keys TO service_role;
GRANT ALL ON public.webhooks TO service_role;
GRANT ALL ON public.webhook_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_point_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs admin manage" ON public.audit_logs;
CREATE POLICY "audit_logs admin manage" ON public.audit_logs
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'));

DROP POLICY IF EXISTS "brand_settings authenticated read" ON public.brand_settings;
CREATE POLICY "brand_settings authenticated read" ON public.brand_settings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "brand_settings admin manage" ON public.brand_settings;
CREATE POLICY "brand_settings admin manage" ON public.brand_settings
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'));

DROP POLICY IF EXISTS "point_policies admin manage" ON public.point_policies;
CREATE POLICY "point_policies admin manage" ON public.point_policies
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'));

DROP POLICY IF EXISTS "customer_tiers authenticated read" ON public.customer_tiers;
CREATE POLICY "customer_tiers authenticated read" ON public.customer_tiers
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "customer_tiers admin manage" ON public.customer_tiers;
CREATE POLICY "customer_tiers admin manage" ON public.customer_tiers
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'));

DROP POLICY IF EXISTS "product_point_policies admin manage" ON public.product_point_policies;
CREATE POLICY "product_point_policies admin manage" ON public.product_point_policies
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'));

DROP POLICY IF EXISTS "point_events authenticated read" ON public.point_events;
CREATE POLICY "point_events authenticated read" ON public.point_events
  FOR SELECT TO authenticated
  USING (status IN ('scheduled', 'active', 'paused', 'ended'));

DROP POLICY IF EXISTS "point_events admin manage" ON public.point_events;
CREATE POLICY "point_events admin manage" ON public.point_events
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'));

DROP POLICY IF EXISTS "api_keys admin manage" ON public.api_keys;
CREATE POLICY "api_keys admin manage" ON public.api_keys
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'));

DROP POLICY IF EXISTS "webhooks admin manage" ON public.webhooks;
CREATE POLICY "webhooks admin manage" ON public.webhooks
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'));

DROP POLICY IF EXISTS "webhook_logs admin manage" ON public.webhook_logs;
CREATE POLICY "webhook_logs admin manage" ON public.webhook_logs
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'));

CREATE OR REPLACE FUNCTION public.get_balance(_user_id UUID)
RETURNS TABLE (available INTEGER, pending INTEGER, total INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(CASE
      WHEN status::text IN ('completed', 'confirmed')
        AND type::text IN ('earn', 'event_earn', 'manual_earn', 'adjust', 'use_cancel')
        THEN amount
      WHEN status::text IN ('completed', 'confirmed')
        AND type::text IN ('redeem', 'use', 'manual_deduct', 'expire', 'cancel', 'earn_cancel')
        THEN -amount
      ELSE 0 END), 0)::INTEGER AS available,
    COALESCE(SUM(CASE
      WHEN status::text = 'pending'
        AND type::text IN ('earn', 'event_earn', 'manual_earn')
        THEN amount
      ELSE 0 END), 0)::INTEGER AS pending,
    COALESCE(SUM(CASE
      WHEN status::text IN ('completed', 'confirmed')
        AND type::text IN ('earn', 'event_earn', 'manual_earn')
        THEN amount
      ELSE 0 END), 0)::INTEGER AS total
  FROM public.point_transactions
  WHERE user_id = _user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_balance(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_balance(UUID) TO authenticated;

DROP TRIGGER IF EXISTS brand_settings_updated_at ON public.brand_settings;
CREATE TRIGGER brand_settings_updated_at BEFORE UPDATE ON public.brand_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS point_policies_updated_at ON public.point_policies;
CREATE TRIGGER point_policies_updated_at BEFORE UPDATE ON public.point_policies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS customer_tiers_updated_at ON public.customer_tiers;
CREATE TRIGGER customer_tiers_updated_at BEFORE UPDATE ON public.customer_tiers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS product_point_policies_updated_at ON public.product_point_policies;
CREATE TRIGGER product_point_policies_updated_at BEFORE UPDATE ON public.product_point_policies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS point_events_updated_at ON public.point_events;
CREATE TRIGGER point_events_updated_at BEFORE UPDATE ON public.point_events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS webhooks_updated_at ON public.webhooks;
CREATE TRIGGER webhooks_updated_at BEFORE UPDATE ON public.webhooks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
