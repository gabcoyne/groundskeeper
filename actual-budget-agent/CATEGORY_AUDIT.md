# Budget Category Audit
*Generated: 2026-02-05 • Coyne Household*

---

## 🚨 Issues Found

### 1. Shopping is a Black Hole
**Problem:** 100% of "Shopping" ($23,172/year) is Amazon with zero subcategorization.

**Impact:** Can't distinguish:
- Household essentials (paper towels, cleaning supplies)
- Tech/electronics (one-time purchases)
- Gifts (should be separate)
- Impulse purchases (the real "leak")

**Recommendation:** Split into:
- `Amazon - Household` (essentials, recurring)
- `Amazon - Tech` (electronics, one-time)
- `Amazon - Other` (discretionary, gifts)

### 2. Unused/Redundant Categories
**Problem:** 6 categories have zero transactions:
- Food (duplicate of Groceries/Dining Out)
- General (catch-all = useless)
- Bills / Bills (Flexible) / Family Bills (confusing)
- Savings (not an expense category)

**Recommendation:** Delete these. Consolidate to clear purpose-driven categories.

### 3. Business Expenses Not Tracked
**Problem:** George runs **Coyne Solutions** consulting but "Business Expense" category is empty.

**Impact:** 
- Missing tax deductions
- Can't calculate true business profitability
- Mixing personal/business clouds financial picture

**Found in wrong categories:**
- Software & Cloud ($206/yr) - some is business
- LegalZoom, Google Workspace - clearly business

**Recommendation:** Create proper business tracking:
- `Business - Software` (tools, subscriptions)
- `Business - Equipment` (hardware, office)
- `Business - Services` (legal, accounting)
- `Business - Travel` (conferences, client visits)

### 4. No Category Groups
**Problem:** All 31 categories are "Ungrouped" — makes budgeting harder.

**Recommendation:** Organize into groups:

```
FIXED (can't change easily):
├── Mortgage
├── Auto - Genesis Loan
├── Auto - Ally Loan  
├── Insurance

ESSENTIAL VARIABLE (needs, flexible amount):
├── Utilities
├── Groceries
├── Gas & Fuel
├── Healthcare

LIFESTYLE (wants, controllable):
├── Dining Out
├── Subscriptions
├── Fitness
├── Shopping - Household
├── Shopping - Discretionary
├── Travel
├── Personal Care

BUSINESS (tax-deductible):
├── Business - Software
├── Business - Equipment
├── Business - Services

IRREGULAR (sinking funds):
├── Auto Maintenance
├── Home Repairs
├── Gifts
├── Annual Subscriptions

SYSTEM:
├── Transfers
├── Credit Card Payment
├── Income
```

### 5. Missing Sinking Fund Categories
**Problem:** No categories for irregular but predictable expenses.

**Impact:** Large expenses feel like "surprises" and blow the monthly budget.

**Examples missing:**
- Car maintenance (oil, tires, repairs)
- Home repairs/maintenance
- Annual subscriptions (paid yearly)
- Holiday gifts (predictable November spike)

**Recommendation:** Add sinking funds with monthly contributions:
- Auto Maintenance: $50/mo → $600/year buffer
- Home Repairs: $100/mo → $1,200/year buffer
- Gifts: $50/mo → $600/year buffer

### 6. Auto Loans Should Be Separate
**Problem:** Genesis ($935/mo) and Ally ($504/mo) lumped together.

**Impact:** Can't see when one loan pays off, can't plan accordingly.

**Recommendation:** Split into:
- `Auto - Genesis Loan`
- `Auto - Ally Loan`
- `Auto - Fuel & Charging`
- `Auto - Maintenance`
- `Auto - Parking`

---

## ✅ Recommended Category Structure

### Group: Fixed Expenses
| Category | Budget | Notes |
|----------|--------|-------|
| Mortgage | $3,972 | CrossCountry bi-weekly |
| Auto - Genesis | $940 | GV60 loan + Blink |
| Auto - Ally | $510 | 2nd vehicle loan |
| Insurance | $80 | Auto, life |

### Group: Essential Variable
| Category | Budget | Notes |
|----------|--------|-------|
| Utilities | $700 | ComEd, Peoples Gas, Water |
| Groceries | $600 | Jewel, Costco, Whole Foods |
| Healthcare | $150 | Medical, dental, pharmacy |
| Gas & Fuel | $50 | Minimal (EV) |

### Group: Lifestyle
| Category | Budget | Notes |
|----------|--------|-------|
| Dining Out | $300 | Restaurants, coffee, bars |
| Subscriptions | $100 | Streaming, apps |
| Fitness | $55 | Lifetime, etc. |
| Shopping - Household | $400 | Amazon essentials |
| Shopping - Discretionary | $300 | Amazon other, retail |
| Travel | $200 | Trips, hotels |
| Personal Care | $50 | Grooming, etc. |
| Pet Care | $50 | Trupanion, vet, supplies |

### Group: Business (Coyne Solutions)
| Category | Budget | Notes |
|----------|--------|-------|
| Business - Software | $100 | Cloud, tools, SaaS |
| Business - Equipment | $50 | Hardware, office |
| Business - Services | $50 | Legal, accounting |

### Group: Sinking Funds
| Category | Budget | Notes |
|----------|--------|-------|
| Auto Maintenance | $50 | Oil, tires, repairs |
| Home Repairs | $100 | Maintenance, fixes |
| Gifts | $75 | Holidays, birthdays |
| Annual Fees | $25 | Yearly subscriptions |

---

## 📊 Summary

| Metric | Current | Recommended |
|--------|---------|-------------|
| Categories | 31 | 24 |
| Groups | 1 (Ungrouped) | 6 |
| Business tracking | ❌ None | ✅ 3 categories |
| Sinking funds | ❌ None | ✅ 4 categories |
| Shopping granularity | ❌ 1 bucket | ✅ 2 buckets |

---

## 🎯 Action Items

1. [ ] Restructure categories in Actual Budget
2. [ ] Re-categorize 2025 Amazon transactions (sample review)
3. [ ] Mark business expenses with "Business" tag
4. [ ] Set up category groups
5. [ ] Enable weekly budget reports

---

*This audit follows envelope budgeting best practices and is tailored for a high-income household with business income.*
