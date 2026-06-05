-- Transactions table for spending data
CREATE TABLE IF NOT EXISTS transactions (
  id VARCHAR(50) PRIMARY KEY,
  date DATE NOT NULL,
  merchant VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  memo TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Funds table for mutual fund data
CREATE TABLE IF NOT EXISTS funds (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fund NAV history (one row per fund per date)
CREATE TABLE IF NOT EXISTS fund_navs (
  fund_id VARCHAR(100) NOT NULL,
  date DATE NOT NULL,
  value DECIMAL(15, 4) NOT NULL,
  PRIMARY KEY (fund_id, date),
  FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE
);

-- Holdings table for user's fund investments
CREATE TABLE IF NOT EXISTS holdings (
  id SERIAL PRIMARY KEY,
  fund_id VARCHAR(100) NOT NULL,
  fund_name VARCHAR(255) NOT NULL,
  units DECIMAL(15, 4) NOT NULL,
  purchase_date DATE NOT NULL,
  purchase_nav DECIMAL(15, 4) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE
);

-- Merchant aliases mapping for fuzzy matching
CREATE TABLE IF NOT EXISTS merchant_aliases (
  id SERIAL PRIMARY KEY,
  canonical_name VARCHAR(255) NOT NULL UNIQUE,
  alias VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for query optimization
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_date_category ON transactions(date, category);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_date ON transactions(merchant, date);
CREATE INDEX IF NOT EXISTS idx_fund_navs_date ON fund_navs(date);
CREATE INDEX IF NOT EXISTS idx_fund_navs_fund_id ON fund_navs(fund_id);
CREATE INDEX IF NOT EXISTS idx_holdings_fund_id ON holdings(fund_id);
