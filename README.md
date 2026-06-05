# Tara Finance Agent

A personal finance research agent built with Mastra that answers natural language questions about spending, funds, and investments.

## Overview

Tara uses AI to understand your financial questions and fetch real data from a Postgres database. Ask questions like:

- "How much did I spend on food last month?"
- "What's my return on the Saffron Bluechip fund?"
- "Which of my merchants look like recurring subscriptions?"
- "What is my portfolio worth today?"

Every answer is grounded in your actual financial data—Tara never guesses or invents figures.

## Quick Start

### Prerequisites

- Node.js 22.13.0+
- Postgres 14+
- OpenAI API key (or Anthropic/Google)

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

Create `.env` file in the root directory:

```env
# Database
DATABASE_URL=postgres://postgres:postgres@localhost:5432/provue_tara

# LLM Provider (choose one)
OPENAI_API_KEY=sk-your-key-here
# OR
ANTHROPIC_API_KEY=sk-ant-...
# OR
GOOGLE_API_KEY=...

# Server
PORT=3000
```

### 3. Initialize Database and Ingest Data

macOS / Linux / Git Bash

```bash
# Ingest sample data (choose one snapshot)
DATA_DIR=./data/sample_a npx tsx scripts/ingest.ts
# OR
DATA_DIR=./data/sample_b npx tsx scripts/ingest.ts
# OR
DATA_DIR=./data/sample_c npx tsx scripts/ingest.ts
```

Windows PowerShell
$env:DATA_DIR="./data/sample_a"
npm run ingest

This will:
- Create all necessary tables
- Load transactions, funds, NAV history, and holdings
- Build merchant alias mappings

### 4. Start the Server

```bash
npm start
```

The server will listen on port 3000. You'll see:

```
Tara Finance Agent listening on port 3000
POST /ask - Ask Tara a finance question
GET /health - Health check
GET /logs - View request logs
```

### 5. Ask Tara a Question

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "How much did I spend on food last month?"}'
```

Response:

```json
{
  "answer": "Based on your transactions, you spent ₹4,532.50 on food in the last month (February 2025). This includes 12 transactions ranging from ₹45 to ₹892.",
  "requestId": "uuid...",
  "toolsCalled": ["query_transactions"],
  "latency": 245
}
```

## Development

### Run in Dev Mode

```bash
npm run dev
```

This starts the Mastra Studio development server with interactive agent testing at http://localhost:4111.

### Run Evaluation Tests

```bash
npm run eval
```

This runs 12+ test cases covering spending queries, fund returns, portfolio analysis, and edge cases like refunds, merchant aliases, and transfers.

Sample output:

```
🧪 Running Tara Finance Agent Evaluation Tests

Testing: Single lookup - Spend on food
Question: "How much did I spend on food last month?"
✅ PASSED
Answer: Based on your transactions, you spent ₹4,532.50...

...

📊 TEST SUMMARY
==============================================================
Total Tests: 12
✅ Passed: 12
❌ Failed: 0
Success Rate: 100.0%
```

## API Endpoints

### POST /ask

Ask Tara a question about your finances.

**Request:**
```json
{
  "question": "How much did I spend on food last month?"
}
```

**Response:**
```json
{
  "answer": "Based on your transactions...",
  "requestId": "uuid-string",
  "toolsCalled": ["query_transactions"],
  "latency": 245
}
```

**Status Codes:**
- 200: Success
- 400: Invalid request (missing question)
- 500: Internal error

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-06-04T10:30:00Z"
}
```

### GET /logs

View request logs for observability.

**Query Params:**
- `limit`: Number of recent logs (default 20)

**Response:**
```json
{
  "totalLogs": 125,
  "recentLogs": [
    {
      "requestId": "uuid",
      "timestamp": "2025-06-04T10:30:00Z",
      "question": "How much did I spend on food?",
      "toolsCalled": ["query_transactions"],
      "status": "success",
      "latency": 245
    },
    ...
  ]
}
```

## Project Structure

```
tara-finance-agent/
├── src/mastra/
│   ├── agents/
│   │   └── tara-agent.ts          # Main Tara agent definition
│   ├── db/
│   │   ├── connection.ts          # Database connection pool
│   │   ├── queries.ts             # Database query helpers
│   │   └── schema.sql             # Postgres schema
│   ├── tools/
│   │   ├── transaction-tool.ts    # Query transactions & spending
│   │   ├── fund-tool.ts           # Query fund NAV & returns
│   │   └── portfolio-tool.ts      # Query holdings & realized returns
│   ├── routes/
│   │   └── ask.ts                 # POST /ask handler
│   └── index.ts                   # Mastra configuration
├── src/
│   └── server.ts                  # Express server setup
├── scripts/
│   ├── ingest.ts                  # Data ingestion from JSON
│   └── eval.ts                    # Evaluation test suite
├── data/
│   ├── sample_a/                  # Sample dataset A
│   ├── sample_b/                  # Sample dataset B
│   └── sample_c/                  # Sample dataset C
├── README.md                      # This file
├── DESIGN.md                      # Architecture & design decisions
└── package.json
```

## Database Schema

### transactions
Personal spending transactions (1,500+ rows per sample)

| Column | Type | Notes |
|--------|------|-------|
| id | VARCHAR(50) | PK |
| date | DATE | Transaction date |
| merchant | VARCHAR(255) | Merchant name |
| category | VARCHAR(100) | food, health, travel, transfer, uncategorized |
| amount | DECIMAL | In INR; negative = refund |
| currency | VARCHAR(3) | Default 'INR' |
| memo | TEXT | Free-text memo |

### funds
Mutual fund definitions (8 funds per sample)

| Column | Type | Notes |
|--------|------|-------|
| id | VARCHAR(100) | PK |
| name | VARCHAR(255) | Fund name |
| category | VARCHAR(100) | large_cap, mid_cap, small_cap, etc |

### fund_navs
Net Asset Value history (24 monthly points per fund)

| Column | Type | Notes |
|--------|------|-------|
| fund_id | VARCHAR(100) | FK → funds |
| date | DATE | NAV date (monthly) |
| value | DECIMAL | NAV value |
| (fund_id, date) | - | Composite PK |

### holdings
User's fund investments (8 holdings per sample)

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL | PK |
| fund_id | VARCHAR(100) | FK → funds |
| fund_name | VARCHAR(255) | Fund name (denormalized) |
| units | DECIMAL | Number of units owned |
| purchase_date | DATE | Purchase date |
| purchase_nav | DECIMAL | NAV at purchase |

### merchant_aliases
Merchant normalization mapping

| Column | Type | Notes |
|--------|------|-------|
| canonical_name | VARCHAR(255) | Normalized name (PK) |
| alias | VARCHAR(255) | Raw merchant from transaction |

## Key Features

### Flexible Filtering
Query transactions by:
- Date range (start/end dates)
- Category (food, health, travel, etc.)
- Merchant (substring search with fuzzy matching)
- Combinations of the above

### Spending Aggregations
- Total spend by category
- Top merchants by spend
- Month-over-month trends
- Average transaction amount

### Fund Analysis
- Period returns (NAV change between dates)
- Fund ranking by return
- NAV history lookup
- Current NAV for any fund

### Portfolio Analysis
- Total portfolio value
- Realized return on each holding
- Portfolio-level gain/loss
- Individual holding performance vs fund period return

### Data Integrity
- Refunds handled (negative amounts excluded from spend)
- Transfers excluded by default (`category = 'transfer'`)
- Merchant aliases resolved (Swiggy ≈ Swiggy Instamart)
- Uncategorized transactions still queryable by date/merchant
- Noisy memos treated as untrusted data

## Deployment

### Local Postgres

```bash
# Using Homebrew (macOS)
brew install postgresql@16
brew services start postgresql@16
psql -U postgres -c "CREATE DATABASE provue_tara;"
export DATABASE_URL=postgres://postgres@localhost:5432/provue_tara
```

### Docker Postgres

```bash
docker run -d --name provue-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  postgres:16

export DATABASE_URL=postgres://postgres:postgres@localhost:5432/provue_tara
```

### Deploy to Render

1. Create a new Web Service on [render.com](https://render.com)
2. Connect your GitHub repo
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Add environment variables:
   - `DATABASE_URL`: (Render will provision for you or use external)
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `NODE_ENV`: `production`

Example Render PostgreSQL connection:

```
DATABASE_URL=postgres://user:pass@hostname:5432/dbname
```

### Deploy to Railway

1. Connect repo to [railway.app](https://railway.app)
2. Add PostgreSQL plugin
3. Set environment variables
4. Deploy

### Deploy to Fly.io

```bash
fly auth login
fly launch  # Follow prompts
fly postgres attach  # Attach Postgres
fly deploy
```

## Configuration

### Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `DATABASE_URL` | Yes | - | Postgres connection string |
| `OPENAI_API_KEY` | Yes* | - | OpenAI API key (*if using OpenAI) |
| `ANTHROPIC_API_KEY` | Yes* | - | Anthropic key (*if using Claude) |
| `GOOGLE_API_KEY` | Yes* | - | Google key (*if using Gemini) |
| `PORT` | No | 3000 | Server port |
| `NODE_ENV` | No | development | Environment |
| `DATA_DIR` | No | ./data/sample_a | Data ingestion path |

### Postgres Defaults

If `DATABASE_URL` is not set, defaults to:
```
postgres://postgres:postgres@localhost:5432/provue_tara
```

## Troubleshooting

### "Cannot connect to database"
- Ensure Postgres is running: `psql --version`
- Check `DATABASE_URL` is correct
- Verify database exists: `psql -l`

### "Unexpected error on idle client"
- Normal in development; connection pool managing idle connections
- Not an error unless it blocks requests

### "OPENAI_API_KEY is not set"
- Add key to `.env` file
- Don't commit `.env` to git
- Use environment secrets on deployment platform

### Tests fail with "Cannot reach server"
- Ensure server is running: `npm start`
- Check port 3000 is not in use: `lsof -i :3000`
- Adjust `API_URL` in eval script if using different port

### Agent gives hallucinated numbers
- Likely a tool failed silently; check logs: `GET /logs`
- Verify database has data: `psql provue_tara -c "SELECT COUNT(*) FROM transactions;"`
- Check LLM provider is working (test with curl to /ask)

## Testing Checklist

- [ ] Database initialized: `npm run ingest`
- [ ] Server starts: `npm start`
- [ ] Health check passes: `curl http://localhost:3000/health`
- [ ] Can ask a question: `curl -X POST http://localhost:3000/ask -H "Content-Type: application/json" -d '{"question": "How much did I spend?"}'`
- [ ] Eval tests pass: `npm run eval`
- [ ] Logs are captured: `curl http://localhost:3000/logs`
- [ ] Works on all three samples: `DATA_DIR=./data/sample_x npm run ingest && npm run eval`

## Architecture Decisions

See [DESIGN.md](./DESIGN.md) for detailed explanations of:
- Database schema and indexes
- Tool design (why 3 tools instead of many narrow ones)
- Formulas for spend, net spend, period return, and realized return
- Merchant alias matching strategy
- Data handling (refunds, transfers, uncategorized, noisy memos)
- Agent orchestration and grounding strategy
- Known limitations and future enhancements

## Support

If you hit a blocker:

1. Check the logs: `curl http://localhost:3000/logs?limit=5`
2. Review [DESIGN.md](./DESIGN.md) for schema and logic
3. Check database directly: `psql provue_tara -c "SELECT * FROM transactions LIMIT 5;"`
4. Verify LLM API key and quota
5. Try with a sample question in the eval script

## License

ISC