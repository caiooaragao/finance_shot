CREATE TABLE IF NOT EXISTS workflow_plans (
  id text PRIMARY KEY,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  version integer NOT NULL DEFAULT 1,
  parent_plan_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  plan_id text NOT NULL REFERENCES workflow_plans (id),
  id text NOT NULL,
  position integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  objective text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  dependencies text[] NOT NULL DEFAULT '{}',
  complexity text NOT NULL DEFAULT 'medium',
  tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  handler text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  result jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  PRIMARY KEY (plan_id, id)
);

CREATE INDEX IF NOT EXISTS workflow_steps_status_idx
  ON workflow_steps (plan_id, status, position);

CREATE TABLE IF NOT EXISTS workflow_feedback (
  id bigserial PRIMARY KEY,
  plan_id text NOT NULL,
  step_id text NOT NULL,
  expected text NOT NULL,
  actual text NOT NULL,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text NOT NULL,
  reason text NOT NULL,
  next_action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_feedback_step_idx
  ON workflow_feedback (plan_id, step_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_plan_revisions (
  id bigserial PRIMARY KEY,
  plan_id text NOT NULL REFERENCES workflow_plans (id),
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS senate_filings (
  id uuid PRIMARY KEY,
  member_name text NOT NULL,
  disclosed date NOT NULL,
  link text NOT NULL,
  scraped_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS senate_trades (
  id text PRIMARY KEY,
  filing_id uuid NOT NULL REFERENCES senate_filings (id),
  member text NOT NULL,
  chamber text NOT NULL DEFAULT 'Senate',
  ticker text NOT NULL DEFAULT '',
  trade_type text NOT NULL,
  amount text NOT NULL,
  tx_date date,
  disclosed date NOT NULL,
  asset text NOT NULL,
  link text NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS senate_trades_disclosed_idx
  ON senate_trades (disclosed DESC);

CREATE INDEX IF NOT EXISTS senate_trades_ticker_idx
  ON senate_trades (ticker);

CREATE INDEX IF NOT EXISTS senate_trades_tx_date_idx
  ON senate_trades (tx_date DESC);

CREATE TABLE IF NOT EXISTS scrape_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  backfill_completed_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_started_at timestamptz
);

INSERT INTO scrape_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
