# Tara Finance Agent

## Overview

**Tara** is a personal finance research agent built on Mastra that answers natural language questions about spending, funds, and investments by querying a Postgres database.

**Model:** OpenAI gpt-4o-mini (or Claude/Gemini)

**Tools:** 3 expressive financial tools (query_transactions, query_funds, query_portfolio)

## Agent Definition

### System Instructions

```
You are Tara, a personal finance research agent. Your job is to answer questions about spending, 
funds, and investments by using available tools to fetch real data.

CORE PRINCIPLES:
1. Grounding: Every number in your answer must come from a tool result. Never estimate or guess.
2. Honesty: If data is not available, say so clearly. Don't hallucinate.
3. Multi-step reasoning: Complex questions (comparisons, trends, joint analysis) 
   require calling multiple tools and synthesizing results.
4. Date transparency: Always specify the date range used in your analysis.

EXAMPLES:
- Question: "How much did I spend on food last month?"
  Action: Call query_transactions with category='food' and appropriate date range
  Response: Ground answer in tool result, be specific about amounts and dates

- Question: "What's my return on the Saffron fund?"
  Action: Determine if user means period return (fund NAV change) or realized return (on their holding)
  If ambiguous, ask for clarification or provide both metrics

- Question: "Compare my food spending vs travel spending this year"
  Action: Call query_transactions twice (once for each category) with full year date range
  Response: Calculate and compare the results, provide growth rates if multiple periods requested

HANDLING EDGE CASES:
- Transfers: Excluded by default (category='transfer'). Only include if user asks explicitly.
- Refunds: Negative amounts in transactions. Net spend already excludes them.
- Merchant aliases: Tool handles Swiggy ≈ Swiggy Instamart. You don't need to worry.
- Uncategorized rows: Still queryable by date/merchant even without category.
```

## Tools

### 1. query_transactions

**Purpose:** Flexible transaction querying and spending aggregation

**Parameters:**
- `startDate` (string, YYYY-MM-DD): Start date for range
- `endDate` (string, YYYY-MM-DD): End date for range
- `category` (string, optional): Filter by category (food, health, travel, transfer, uncategorized)
- `merchant` (string, optional): Filter by merchant (substring match)
- `aggregation` (string, optional): Type of aggregation
  - `"sum"`: Total spend in period
  - `"count"`: Number of transactions
  - `"avg"`: Average transaction amount
  - `"top_merchants"`: Ranked merchants by spend
  - `"by_category"`: Spend grouped by category
  - `"monthly"`: Spend aggregated by month
  - default (no aggregation): Raw transaction list
- `limit` (number, optional): Max results (default 20)
- `excludeTransfers` (boolean, optional): Exclude transfers (default true)

**Returns:**
```json
{
  "type": "list|aggregation",
  "metric": "sum|count|avg|top_merchants|by_category|monthly",
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "data": [
    {
      "date": "2025-01-15",
      "merchant": "Swiggy",
      "category": "food",
      "amount": 245.50,
      "memo": "Food delivery"
    }
  ],
  "totalRows": 42,
  "totalAmount": 5432.50
}
```

### 2. query_funds

**Purpose:** Fund NAV and returns analysis

**Parameters:**
- `fundId` (string, optional): Fund identifier
- `fundName` (string, optional): Fund name (substring search)
- `startDate` (string, YYYY-MM-DD, optional): Period start for return calculation
- `endDate` (string, YYYY-MM-DD, optional): Period end for return calculation
- `metric` (string, optional): Type of query
  - `"current_nav"`: Latest NAV for fund
  - `"nav_history"`: Historical NAV points
  - `"period_return"`: NAV change % between dates
  - `"all_funds"`: List all available funds

**Returns:**
```json
{
  "fundId": "SAFFRON_BLUECHIP",
  "fundName": "Saffron Bluechip Fund",
  "category": "large_cap",
  "metric": "period_return",
  "startDate": "2024-01-01",
  "endDate": "2025-01-01",
  "startNav": 100.00,
  "endNav": 110.50,
  "periodReturnPercentage": 10.50
}
```

**Formula:**
```
Period Return % = ((endNav - startNav) / startNav) * 100
```

### 3. query_portfolio

**Purpose:** Holdings and realized returns analysis

**Parameters:**
- `metric` (string, optional): Type of query
  - `"all_holdings"`: List all holdings with current values
  - `"holding_return"`: Return on specific holding
  - `"portfolio_value"`: Total portfolio worth and gain
- `fundId` (string, optional): Fund identifier (for holding_return)
- `fundName` (string, optional): Fund name (for holding_return)

**Returns (all_holdings):**
```json
{
  "metric": "all_holdings",
  "holdings": [
    {
      "fundId": "SAFFRON_BLUECHIP",
      "fundName": "Saffron Bluechip Fund",
      "units": 100.50,
      "purchaseDate": "2024-03-15",
      "purchaseNav": 50.00,
      "purchaseCost": 5025.00,
      "currentNav": 55.25,
      "currentValue": 5552.625,
      "gain": 527.625,
      "gainPercentage": 10.50
    }
  ]
}
```

**Returns (portfolio_value):**
```json
{
  "metric": "portfolio_value",
  "totalPurchaseCost": 50000.00,
  "totalCurrentValue": 55250.00,
  "totalGain": 5250.00,
  "portfolioReturnPercentage": 10.50,
  "holdings": [...]
}
```

**Formula:**
```
Realized Return % = ((currentValue - purchaseCost) / purchaseCost) * 100
where
  purchaseCost = units * purchaseNav
  currentValue = units * currentNav
```

## Capabilities

### Spending Analysis
- ✅ Total spend by date range
- ✅ Spend by category
- ✅ Spend by merchant
- ✅ Top merchants ranking
- ✅ Monthly trends
- ✅ Handles refunds (negative amounts)
- ✅ Excludes transfers by default

### Fund Analysis
- ✅ Current NAV lookup
- ✅ Historical NAV data
- ✅ Period returns (any date range)
- ✅ Fund comparison

### Portfolio Analysis
- ✅ Total portfolio value
- ✅ Individual holding returns
- ✅ Portfolio-level gain/loss
- ✅ Holdings enriched with current values

### Data Quality
- ✅ Merchant alias resolution (Swiggy variants)
- ✅ Refund handling
- ✅ Transfer exclusion
- ✅ Date range validation
- ✅ Grounding: only numbers from database

## Limitations

1. **Date Parsing:** Agent must convert natural language dates ("last month", "Q1") to YYYY-MM-DD
2. **Merchant Matching:** Substring matching only; complex fuzzy matching not supported
3. **No Forecasting:** Returns historical data only
4. **Synchronous:** All tool calls are synchronous; no async batching
5. **No Caching:** Fresh database queries on every request

## Example Conversations

### Example 1: Simple Lookup
```
User: "How much did I spend on food last month?"

Agent Action: 
  call query_transactions with category='food', 
  startDate='2025-01-01', endDate='2025-01-31', 
  aggregation='sum'

Response:
  "Based on your transactions, you spent ₹4,532.50 on food 
  in January 2025. This includes 12 transactions."
```

### Example 2: Multi-step Comparison
```
User: "Did I spend more on food or travel in 2024?"

Agent Actions:
  1. call query_transactions with category='food', 
     startDate='2024-01-01', endDate='2024-12-31', aggregation='sum'
  2. call query_transactions with category='travel', 
     startDate='2024-01-01', endDate='2024-12-31', aggregation='sum'

Response:
  "In 2024, you spent ₹45,200 on food and ₹38,150 on travel. 
  You spent ₹7,050 more on food (18.5% higher spending)."
```

### Example 3: Fund Returns
```
User: "What was the Saffron Bluechip fund's return last year?"

Agent Action:
  call query_funds with fundName='Saffron Bluechip', 
  metric='period_return', 
  startDate='2024-01-01', endDate='2025-01-01'

Response:
  "The Saffron Bluechip fund returned +12.3% over the past year, 
  from a NAV of ₹100 on Jan 1, 2024 to ₹112.30 on Jan 1, 2025."
```

### Example 4: Realized Returns
```
User: "How much have I made on the Saffron fund?"

Agent Action:
  call query_portfolio with metric='holding_return', 
  fundName='Saffron Bluechip'

Response:
  "Your holding in Saffron Bluechip has gained ₹2,850, 
  a return of +15.2%. You purchased 100 units at ₹50 
  (₹5,000 total) and they're now worth ₹7,850."
```

## Deployment

### Local Testing
```bash
npm run ingest  # Load sample data
npm start       # Start server
npm run eval    # Run test suite
```

### Production
- Express server on configurable port (default 3000)
- Postgres database via `DATABASE_URL` env var
- Can deploy to Render, Railway, Fly.io, Vercel+Neon
- Requires `OPENAI_API_KEY` (or ANTHROPIC_API_KEY, GOOGLE_API_KEY)

See [README.md](./README.md) for deployment steps.

## Observability

Every request is logged with:
- `requestId`: Unique UUID
- `timestamp`: ISO 8601
- `question`: User's question
- `toolsCalled`: List of tools invoked
- `status`: 'success' or 'error'
- `latency`: Response time in milliseconds

View logs at `GET /logs`
