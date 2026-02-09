# Actual Budget Agent

Automated bookkeeping, budget insights, and tax advisory for the Coyne household.

## Overview

This agent integrates with [Actual Budget](https://actualbudget.org/) to provide:

- **Automated Bookkeeping**: Transaction categorization, reconciliation
- **Budget Insights**: Spending analysis, trend detection, savings opportunities
- **Tax Advisory**: Illinois/Chicago-specific tax tracking and planning
- **Reports**: Weekly/monthly summaries delivered via Telegram

## Configuration

The agent connects to Actual Budget at `http://actual-budget:5006` (Docker network).

Credentials are stored in `TOOLS.md`:
- Budget: "My Finances"
- File ID: `51b5bac4-bacd-4fa6-9043-1b5c459164eb`

## Usage

### Check Connection

```python
from actual_budget_agent import BudgetAgent

agent = BudgetAgent()
print(agent.health_check())
```

### Categorize Transactions

```python
category, confidence = agent.categorize_transaction("UBER EATS")
# ('Dining:Delivery', 1.0)

agent.learn_category("JOE'S PIZZA", "Dining:Restaurants")
```

### Get Tax Tips

```python
tips = agent.get_tax_tips(
    gross_income=150000,
    property_tax=8000,
    tax_year=2026
)
print(tips)
```

## Modules

### client/
API wrapper for Actual Budget. Handles authentication and requests.

### categorizer/
Transaction categorization with pattern matching and learning.
Pre-configured for common Chicago-area merchants.

### insights/
Spending analysis and insight generation. Lifestyle-aware thresholds:
- Dining: $800/month threshold
- Subscriptions: $300/month ceiling
- Groceries: $400/person/month baseline

### tax/
Illinois and Chicago tax tracking:
- IL flat 4.95% state tax
- Chicago 10.25% sales tax tracking
- SALT deduction cap awareness
- Quarterly estimated tax reminders
- Deduction tracking (charitable, medical, etc.)

### reports/
Formatted reports for Telegram delivery:
- Weekly spending summaries
- Monthly budget reports
- Year-end tax summaries
- Bills reminders
- Subscription audits

## Scheduled Tasks

Configure via OpenClaw cron:

**Weekly Summary (Sunday 6 PM)**
```json
{
  "schedule": { "kind": "cron", "expr": "0 18 * * 0", "tz": "America/Chicago" },
  "payload": { "kind": "systemEvent", "text": "Generate weekly budget summary" }
}
```

**Monthly Report (1st of month, 9 AM)**
```json
{
  "schedule": { "kind": "cron", "expr": "0 9 1 * *", "tz": "America/Chicago" },
  "payload": { "kind": "systemEvent", "text": "Generate monthly budget report" }
}
```

## Chicago/Illinois Specifics

### Tax Rates
- Illinois income tax: 4.95% flat
- Chicago sales tax: 10.25%
- Cook County property tax: ~1.96% effective

### Savings Tips
- CTA monthly pass: $75 (vs. rideshare costs)
- Major purchases outside Cook County save ~2-3% sales tax
- SALT deduction capped at $10,000

## Data Access

### API vs Direct SQLite

The `@actual-app/api` package is convenient but **slow for bulk operations**. Use direct SQLite for:
- Large transaction queries (>100 rows)
- Bulk budget amount reads
- Reports and analytics
- Any read-heavy operation

**Use the API for:**
- Writing data (transactions, budgets, categories)
- Syncing changes to the server
- Operations that need CRDT conflict resolution

### SQLite Database Path

After downloading the budget, the SQLite database is at:
```
./actual-data/My-Finances-5da68fc/db.sqlite
```

### Direct Query Example (Node.js)

```javascript
const Database = require('better-sqlite3');  // Available via @actual-app/api
const db = new Database('./actual-data/My-Finances-5da68fc/db.sqlite', { readonly: true });

// Get all February transactions
const transactions = db.prepare(`
  SELECT t.*, c.name as category_name, p.name as payee_name
  FROM transactions t
  LEFT JOIN categories c ON t.category = c.id
  LEFT JOIN payees p ON t.payee = p.id
  WHERE t.date BETWEEN '2026-02-01' AND '2026-02-28'
    AND t.tombstone = 0
  ORDER BY t.date DESC
`).all();

// Get budget amounts
const budgets = db.prepare(`
  SELECT zb.month, c.name, zb.amount
  FROM zero_budgets zb
  JOIN categories c ON zb.category = c.id
  WHERE zb.month = '202602'
`).all();

db.close();
```

### Key Tables

| Table | Purpose |
|-------|---------|
| `transactions` | All transactions (check `tombstone=0` for active) |
| `categories` | Category definitions |
| `category_groups` | Category groupings |
| `zero_budgets` | Budget amounts by month/category |
| `payees` | Payee names and rules |
| `accounts` | Account definitions |

### Amounts

All monetary amounts are stored in **cents** (integer). Divide by 100 for dollars.

### Important: Sync After API Writes

When using the API to write changes:
```javascript
await api.setBudgetAmount('2026-02', categoryId, 50000);  // $500.00
await api.sync();  // Required to push to server!
await api.shutdown();
```

## Data Storage

- `data/categorizer_config.json` - Learned categories
- `data/deductions.json` - Tracked tax deductions

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run tests
python -m pytest tests/

# Test connection
python -c "from actual_budget_agent import BudgetAgent; print(BudgetAgent().health_check())"
```
