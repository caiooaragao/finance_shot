DROP TABLE IF EXISTS workflow_feedback;
DROP TABLE IF EXISTS workflow_plan_revisions;
DROP TABLE IF EXISTS workflow_steps;
DROP TABLE IF EXISTS workflow_plans;

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

CREATE TABLE IF NOT EXISTS house_filings (
  id text PRIMARY KEY,
  member_name text NOT NULL,
  disclosed date NOT NULL,
  link text NOT NULL,
  scraped_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS house_trades (
  id text PRIMARY KEY,
  filing_id text NOT NULL REFERENCES house_filings (id),
  member text NOT NULL,
  chamber text NOT NULL DEFAULT 'House',
  ticker text NOT NULL DEFAULT '',
  trade_type text NOT NULL,
  amount text NOT NULL,
  tx_date date,
  disclosed date NOT NULL,
  asset text NOT NULL,
  link text NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS house_trades_disclosed_idx
  ON house_trades (disclosed DESC);

CREATE INDEX IF NOT EXISTS house_trades_ticker_idx
  ON house_trades (ticker);

CREATE INDEX IF NOT EXISTS house_trades_tx_date_idx
  ON house_trades (tx_date DESC);
