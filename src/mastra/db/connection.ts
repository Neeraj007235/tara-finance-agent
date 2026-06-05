import pg from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/provue_tara',
  max: 20,
  idleTimeoutMillis: 30000,
  // Increase timeout for cloud DBs and allow SSL for providers like Neon/GCP/Azure
  connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT_MS || '20000', 10),
  ssl: process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('neon') || process.env.DATABASE_URL.includes('rds') || process.env.DATABASE_URL.includes('amazonaws') || process.env.DATABASE_URL.includes('supabase'))
    ? { rejectUnauthorized: false }
    : undefined,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    // Split by semicolon and execute each statement
    const statements = schema.split(';').filter(s => s.trim());
    for (const statement of statements) {
      await client.query(statement);
    }
    console.log('Database schema initialized');
  } finally {
    client.release();
  }
}

export async function query(text: string, params?: any[]) {
  const result = await pool.query(text, params);
  return result.rows;
}

export async function queryOne(text: string, params?: any[]) {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
}

export async function execute(text: string, params?: any[]) {
  return await pool.query(text, params);
}

export async function closePool() {
  await pool.end();
}

export { pool };
