import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Get data directory from environment or use default
const dataDir = process.env.DATA_DIR || './data/sample_a';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/provue_tara',
});

interface Transaction {
  id: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
  currency: string;
  memo: string;
}

interface Fund {
  id: string;
  name: string;
  category: string;
  nav: Array<{ date: string; value: number }>;
}

interface Holding {
  fund_id: string;
  fund_name: string;
  units: number;
  purchase_date: string;
  purchase_nav: number;
}

async function clearDatabase() {
  const client = await pool.connect();
  try {
    await client.query('TRUNCATE holdings CASCADE');
    await client.query('TRUNCATE fund_navs CASCADE');
    await client.query('TRUNCATE funds CASCADE');
    await client.query('TRUNCATE transactions CASCADE');
    await client.query('TRUNCATE merchant_aliases CASCADE');
    console.log('Database cleared');
  } finally {
    client.release();
  }
}

async function ingestTransactions(filePath: string) {
  const rawData = readFileSync(filePath, 'utf-8');
  const transactions: Transaction[] = JSON.parse(rawData);

  const client = await pool.connect();
  try {
    if (transactions.length > 0) {
      // Batch insert transactions
      const placeholders = transactions.map((_, i) => 
        `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7})`
      ).join(',');
      const values = transactions.flatMap(txn => 
        [txn.id, txn.date, txn.merchant, txn.category, txn.amount, txn.currency, txn.memo]
      );
      await client.query(
        `INSERT INTO transactions (id, date, merchant, category, amount, currency, memo)
         VALUES ${placeholders}
         ON CONFLICT (id) DO NOTHING`,
        values
      );
    }
    console.log(`Ingested ${transactions.length} transactions`);
  } finally {
    client.release();
  }
}

async function ingestFunds(filePath: string) {
  const rawData = readFileSync(filePath, 'utf-8');
  const funds: Fund[] = JSON.parse(rawData);

  const client = await pool.connect();
  try {
    if (funds.length > 0) {
      // Batch insert funds
      const fundPlaceholders = funds.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(',');
      const fundValues = funds.flatMap(fund => [fund.id, fund.name, fund.category]);
      await client.query(
        `INSERT INTO funds (id, name, category)
         VALUES ${fundPlaceholders}
         ON CONFLICT (id) DO NOTHING`,
        fundValues
      );

      // Collect all NAVs and batch insert
      const allNavs = funds.flatMap(fund => 
        fund.nav.map(nav => ({ fundId: fund.id, date: nav.date, value: nav.value }))
      );
      if (allNavs.length > 0) {
        const navPlaceholders = allNavs.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(',');
        const navValues = allNavs.flatMap(nav => [nav.fundId, nav.date, nav.value]);
        await client.query(
          `INSERT INTO fund_navs (fund_id, date, value)
           VALUES ${navPlaceholders}
           ON CONFLICT (fund_id, date) DO NOTHING`,
          navValues
        );
      }
    }
    console.log(`Ingested ${funds.length} funds with NAV history`);
  } finally {
    client.release();
  }
}

async function ingestHoldings(filePath: string) {
  const rawData = readFileSync(filePath, 'utf-8');
  const holdings: Holding[] = JSON.parse(rawData);

  const client = await pool.connect();
  try {
    if (holdings.length > 0) {
      // Batch insert holdings
      const placeholders = holdings.map((_, i) => 
        `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
      ).join(',');
      const values = holdings.flatMap(h => 
        [h.fund_id, h.fund_name, h.units, h.purchase_date, h.purchase_nav]
      );
      await client.query(
        `INSERT INTO holdings (fund_id, fund_name, units, purchase_date, purchase_nav)
         VALUES ${placeholders}`,
        values
      );
    }
    console.log(`Ingested ${holdings.length} holdings`);
  } finally {
    client.release();
  }
}

async function buildMerchantAliases() {
  const client = await pool.connect();
  try {
    // Get all unique merchants from transactions
    const result = await client.query(
      `SELECT DISTINCT merchant FROM transactions ORDER BY merchant`
    );

    const merchants = result.rows.map(r => r.merchant);

    // Build a simple alias mapping based on merchant name patterns
    const aliasMap = new Map<string, string>();

    for (const merchant of merchants) {
      const canonical = normalizeMerchantName(merchant);
      if (!aliasMap.has(canonical)) {
        aliasMap.set(canonical, merchant);
      }
    }

    // Insert merchant aliases
    for (const [canonical, original] of aliasMap) {
      await client.query(
        `INSERT INTO merchant_aliases (canonical_name, alias)
         VALUES ($1, $2)
         ON CONFLICT (alias) DO NOTHING`,
        [canonical, original]
      );
    }

    console.log(`Built ${aliasMap.size} merchant aliases`);
  } finally {
    client.release();
  }
}

function normalizeMerchantName(merchant: string): string {
  // Remove common suffixes and patterns
  let normalized = merchant.toUpperCase();
  normalized = normalized.replace(/\*ORDER$/, '').replace(/\*.*$/, '');
  normalized = normalized.replace(/\s+(MUMBAI|BANGALORE|DELHI|PUNE|HYDERABAD)$/, '');
  normalized = normalized.replace(/INSTAMART/, 'INSTAMART');
  normalized = normalized.trim();
  return normalized;
}

async function main() {
  try {
    const transactionsPath = join(dataDir, 'transactions.json');
    const fundsPath = join(dataDir, 'funds.json');
    const holdingsPath = join(dataDir, 'holdings.json');

    console.log(`Using data directory: ${dataDir}`);

    // Ensure database schema exists (import after dotenv so DATABASE_URL is loaded)
    const { initializeDatabase } = await import('../src/mastra/db/connection.js');
    await initializeDatabase();

    // Clear existing data
    await clearDatabase();

    // Ingest all data
    await ingestTransactions(transactionsPath);
    await ingestFunds(fundsPath);
    await ingestHoldings(holdingsPath);
    await buildMerchantAliases();

    console.log('✓ Data ingestion complete');
  } catch (error) {
    console.error('Ingest failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
