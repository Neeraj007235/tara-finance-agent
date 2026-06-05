# Tara Finance Agent - Design Document

## Overview

Tara is a personal finance research agent built on the Mastra SDK that answers natural language questions about spending, funds, and investments by querying a Postgres database and computing financial metrics programmatically.

## Architecture

### Database Schema

#### Tables

**transactions**
- `id` (VARCHAR, PK): Unique transaction identifier
- `date` (DATE): Transaction date
- `merchant` (VARCHAR): Merchant name
- `category` (VARCHAR): Spending category (food, travel, health, uncategorized, transfer, etc.)
- `amount` (DECIMAL): Transaction amount in INR (positive for spend, negative for refund)
- `currency` (VARCHAR): Currency code (default INR)
- `memo` (TEXT): Free-text memo from payment system

**funds**
- `id` (VARCHAR, PK): Fund unique identifier
- `name` (VARCHAR): Fund name
- `category` (VARCHAR): Fund category (large_cap, mid_cap, emerging, etc.)

**fund_navs**
- `fund_id` (VARCHAR, FK): Reference to funds table
- `date` (DATE): NAV effective date
- `value` (DECIMAL): NAV value
- PK: (fund_id, date)

**holdings**
- `id` (SERIAL, PK): Unique holding identifier
- `fund_id` (VARCHAR, FK): Fund being held
- `fund_name` (VARCHAR): Fund name (denormalized for convenience)
- `units` (DECIMAL): Number of units owned
- `purchase_date` (DATE): Date of purchase
- `purchase_nav` (DECIMAL): NAV at time of purchase

**merchant_aliases**
- `id` (SERIAL, PK): Alias ID
- `canonical_name` (VARCHAR, UNIQUE): Normalized merchant name
- `alias` (VARCHAR, UNIQUE): Raw merchant name from transaction
- Purpose: Enable fuzzy matching of merchants with variations (Swiggy, Swiggy Instamart, SWIGGY*ORDER, etc.)

#### Indexes

Created on:
- `transactions(date)` - For date range filtering
- `transactions(merchant)` - For merchant lookups
- `transactions(category)` - For category filtering
- `transactions(date, category)` - Composite for monthly by-category queries
- `transactions(merchant, date)` - Composite for merchant date filtering
- `fund_navs(date)` - For NAV history lookups
- `fund_navs(fund_id)` - For fund-specific NAV queries
- `holdings(fund_id)` - For holding lookups

### Tools

#### 1. `query_transactions`
Flexible transaction query tool supporting:

**Parameters:**
- `startDate` / `endDate`: Date range filtering (YYYY-MM-DD)
- `category`: Filter by category
- `merchant`: Filter by merchant (substring match)
- `aggregation`: Type of aggregation
  - `sum`: Total spend in period
  - `count`: Number of transactions
  - `avg`: Average transaction amount
  - `top_merchants`: Ranked merchants by spend
  - `by_category`: Spend grouped by category
  - `monthly`: Spend aggregated by month
- `limit`: Max results (default 20)
- `excludeTransfers`: Remove transfer category (default true)

**Output:** Grounded in database queries. Returns transactions, aggregates, or rankings with amounts rounded to 2 decimals.

#### 2. `query_funds`
Fund NAV and returns tool:

**Parameters:**
- `fundId`: Fund identifier
- `fundName`: Fund name (supports substring search)
- `startDate` / `endDate`: Period for return calculation
- `metric`: Type of query
  - `current_nav`: Latest NAV for a fund
  - `nav_history`: Historical NAV points
  - `period_return`: Calculate % change between two dates
  - `all_funds`: List all available funds

**Formulas:**
- **Period Return %**: `((endNav - startNav) / startNav) * 100`
  - Example: If NAV went from 100 to 110, return is +10%
  - Grounded in actual NAV history from database

#### 3. `query_portfolio`
Holdings and realized returns:

**Parameters:**
- `metric`: Type of query
  - `all_holdings`: List all holdings with current values
  - `holding_return`: Return on specific holding
  - `portfolio_value`: Total portfolio worth and gain
- `fundId` / `fundName`: For specific holding queries

**Formulas:**
- **Realized Return on Holding:**
  - Purchase Cost = units × purchase_nav
  - Current Value = units × current_nav
  - Gain/Loss = Current Value - Purchase Cost
  - Return % = (Gain / Purchase Cost) × 100
  - Example: Bought 100 units at ₹50 (₹5000), now ₹55 (₹5500), gain = ₹500 (10%)

- **Portfolio Summary:**
  - Total Purchase Cost = sum of all purchase costs
  - Total Current Value = sum of all current values
  - Total Gain = total current - total purchase
  - Portfolio Return % = (total gain / total purchase) × 100

### Data Handling

#### Refunds
- Represented as negative amounts in transactions table
- Net spend calculations: `SUM(amount) WHERE amount > 0` excludes refunds
- Handling: Automatically excluded from spend totals unless specifically asked

#### Merchant Aliases
- **Problem:** Same merchant appears as "Swiggy", "Swiggy Instamart", "SWIGGY*ORDER", "SWIGGY BANGALORE"
- **Solution:** 
  - On ingest, build `merchant_aliases` mapping by normalizing merchant names
  - Normalization removes common suffixes (*ORDER, city names, etc.)
  - Agent can query merchant with wildcards for broad searches
  - If user asks "Swiggy", tool searches with `LIKE '%SWIGGY%'`

#### Internal Transfers
- Marked with `category = 'transfer'`
- By default, excluded from spend calculations (set `excludeTransfers=true`)
- Only included if user explicitly asks about transfers

#### Date Boundaries
- Relative dates: "last month", "Q1 2025"
- Converted to YYYY-MM-DD ranges before queries
- **Assumption for relative dates:**
  - "Last month" = calendar month before current
  - "Q1" = Jan 1 - Mar 31, "Q2" = Apr 1 - Jun 30, etc.
  - "Last year" = prior 12 months
  - These are parsed by the agent LLM before tool calls

#### Uncategorized Rows
- Some transactions have `category = 'uncategorized'`
- Tools still work: merchant/date queries include them
- Category-specific queries exclude them (unless explicitly requested)

#### Noisy Memos
- Memos may contain UPI refs ("UPI/571548185986/SWIGGY") or NEFT info
- Treated as untrusted free text
- Never used to override category or merchant data
- Only used for human readability in transaction lists

### Agent Logic

#### Instructions to Tara
1. **Grounding Rule:** Every number must come from a tool result
2. **No Hallucination:** Never estimate or guess figures
3. **Multi-step Questions:** Questions requiring 2+ tool calls are orchestrated by the agent
   - "Compare X vs Y" → Call tool twice, compare results
   - "Which grew faster?" → Calculate month-over-month growth from results
   - "Joint analysis" (fund return vs holding return) → Call both tools

#### Tool Selection
- Agent receives all 3 tools in context on every turn
- LLM decides which tool(s) to call based on question
- Tools are designed to be expressive enough to reduce tool count (no "get_by_category", "get_by_date" separately)

### Orchestration Flow

1. User sends POST /ask with question
2. Express handler validates request
3. Agent.generate() is called with question
4. Mastra loops:
   - Agent analyzes question and decides which tool(s) to call
   - Tool is executed with validated inputs (Zod schemas)
   - Result is returned to agent
   - Agent decides if more tools are needed
   - Loop continues until agent produces final answer
5. Natural language response is sent to user
6. Request is logged with tools called, latency, status

### Evaluation and Observability

#### Logging
Each request logs:
- `requestId`: Unique UUID
- `timestamp`: ISO 8601
- `question`: Original question
- `toolsCalled`: List of tools in call order
- `status`: 'success' or 'error'
- `latency`: Milliseconds
- `error`: Exception message (if failed)

Logs are stored in memory and available at GET /logs?limit=20

#### Eval Script
Includes 12+ test cases covering:
- Single lookups (category, merchant, date range)
- Refund handling
- Merchant aliases
- Transfer exclusion
- Recurring subscriptions
- Category comparisons
- Rankings
- No-data cases
- Fund period returns
- Portfolio values
- Realized returns

## Key Design Decisions

### Why 3 Tools Instead of Many Narrow Ones
- `query_transactions` with flexible `aggregation` parameter beats 4 separate tools
- Every tool in context costs tokens; reduces on every agent turn
- One parameter set > four hardcoded functions for token efficiency

### Why Separate Fund and Portfolio Tools
- **fund-tool:** Answers questions about fund performance independent of holdings
  - "What's this fund's 1-year return?" (applies to anyone, any time)
  - Uses NAV history only
- **portfolio-tool:** Answers questions about personal investments
  - "How much have I made on this fund?" (specific to user's holding)
  - Requires NAV history + holdings + purchase history

### Grounding Architecture
- Database is source of truth; agent is interpreter
- All computations happen in SQL or TypeScript code, not LLM prose
- Agent's role: parse question → select tool → explain result

### Fund vs Holding Return Distinction
- **Period Return:** "What was Fund X's return from 2024-01-01 to 2025-01-01?"
  - Answer: NAV on 2025-01-01 vs NAV on 2024-01-01
  - Example: NAV 100 → 110 = +10%, regardless of when/how many units bought
- **Realized Return:** "What's my return on Fund X that I bought on 2024-03-01?"
  - Answer: My current holding value vs my purchase cost
  - Example: Bought 100 units at ₹50 (₹5000), now worth ₹5500 = +10%
  - Different if you bought partway through the period

## Testing and Deployment

### Local Testing
```bash
# Ingest sample data
DATA_DIR=./data/sample_a npx tsx scripts/ingest.ts

# Start server
npm start

# Run evaluation
npm run eval
```

### Deployment
- Built-in server uses Express on port 3000 (configurable)
- Database connection via `DATABASE_URL` env var
- Can use Neon, Supabase, Render, or any Postgres provider
- All tools query Postgres; no file I/O at runtime

## Known Limitations and Tradeoffs

1. **Merchant Normalization is Simple**
   - Uses suffix removal and substring matching
   - More sophisticated ML-based matching could improve accuracy
   - Current approach generalizes across different merchant universes

2. **Date Parsing Relies on Agent**
   - Agent converts "last month" to YYYY-MM-DD
   - If agent gets dates wrong, results are wrong
   - Could add a dedicated date-parsing tool

3. **No Pagination**
   - Results limited to 20 rows by default
   - For large datasets (many holdings, many merchants), could implement cursor-based pagination

4. **Synchronous Tool Execution**
   - All tools run synchronously in the agent turn
   - For very large computations (portfolio with 1000+ transactions), could implement async jobs
   - Current setup suitable for typical personal finance use

5. **No Caching**
   - Every request queries the database fresh
   - Could cache NAV history / fund data, which changes daily not per-request
   - Tradeoff: simplicity vs freshness

## Future Enhancements

1. Recurring detection heuristics (frequency + amount variance)
2. Spending forecasting (trend analysis)
3. Budget alerts
4. Tax optimization suggestions (long-term vs short-term gains)
5. Async jobs for heavy computations
6. Dashboard UI for visualization
