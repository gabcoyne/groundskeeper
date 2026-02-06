#!/usr/bin/env node
/**
 * Weekly Budget Report
 * Generates spending summary with advice for Groundskeeper agent
 */

const api = require('@actual-app/api');

const BUDGET_URL = 'http://actual-budget:5006';
const PASSWORD = 'RGR!vwy*hay.vgm0dpg';
const SYNC_ID = '9b174808-0fe7-4d4d-9b09-7573d3caf074';

// Budget targets (monthly)
const BUDGETS = {
  'Mortgage': 3972,
  'Shopping': 1200,
  'Auto & Transport': 1250,
  'Utilities': 700,
  'Groceries': 600,
  'Dining Out': 300,
  'Healthcare': 150,
  'Subscriptions': 100,
  'Insurance': 80,
  'Fitness': 55,
  'Pet Care': 50,
  'Home & Garden': 100,
  'Travel': 200,
  'Personal Care': 50,
  'Gifts & Donations': 100,
  'Gas & Fuel': 50,
  'Software & Cloud': 25
};

// Advice templates
const ADVICE = {
  overspend: [
    "Consider reviewing recent {category} purchases - any returns possible?",
    "{category} is running hot. Check for subscriptions or recurring charges you forgot about.",
    "You're {pct}% over budget on {category}. Time to pump the brakes for the rest of the month.",
  ],
  underspend: [
    "Great discipline on {category}! Consider moving the surplus to savings.",
    "{category} is well under control. Keep it up!",
  ],
  amazonHigh: [
    "Amazon spending is {pct}% of your discretionary budget. Try a 'cart wait' rule - leave items for 48hrs before buying.",
    "Heavy Amazon month. Review orders for anything that could be returned or avoided next time.",
  ],
  diningLow: [
    "Dining out is impressively low at ${amount}/mo. Make sure you're still enjoying life!",
  ],
  generalTips: [
    "💡 Tip: Review subscriptions quarterly. The average household has 3-4 forgotten recurring charges.",
    "💡 Tip: Sinking funds prevent budget surprises. Consider setting aside $50/mo for car maintenance.",
    "💡 Tip: Business expenses should be tracked separately for tax season. Are you tagging correctly?",
  ]
};

function getAdvice(category, actual, budget) {
  const pct = Math.round((actual / budget) * 100);
  const templates = pct > 100 ? ADVICE.overspend : ADVICE.underspend;
  const template = templates[Math.floor(Math.random() * templates.length)];
  return template
    .replace('{category}', category)
    .replace('{pct}', pct)
    .replace('{amount}', actual.toFixed(0));
}

async function generateReport() {
  await api.init({
    dataDir: '/tmp/actual-data',
    serverURL: BUDGET_URL,
    password: PASSWORD,
  });
  await api.downloadBudget(SYNC_ID);
  
  const accounts = await api.getAccounts();
  const categories = await api.getCategories();
  const catMap = {};
  categories.forEach(c => { catMap[c.id] = c.name; });
  
  // Get current month transactions
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  
  // Calculate days into month for prorating
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthProgress = dayOfMonth / daysInMonth;
  
  // Collect transactions
  const skipPatterns = ['Retirement', 'Investing', 'IRA', '401', 'Self-Directed'];
  let allTxs = [];
  for (const acc of accounts) {
    if (acc.closed || skipPatterns.some(p => acc.name.includes(p))) continue;
    const txs = await api.getTransactions(acc.id);
    allTxs = allTxs.concat(txs.filter(t => t.date >= monthStart && t.amount < 0));
  }
  
  // Group by category
  const spending = {};
  const skipCats = ['Transfer', 'Starting', 'Credit Card', 'Income'];
  allTxs.forEach(t => {
    const cat = catMap[t.category] || 'Uncategorized';
    if (skipCats.some(s => cat.includes(s))) return;
    if (!spending[cat]) spending[cat] = 0;
    spending[cat] += Math.abs(t.amount) / 100;
  });
  
  // Generate report
  let report = `📊 **WEEKLY BUDGET REPORT**\n`;
  report += `*${monthName} • Day ${dayOfMonth} of ${daysInMonth} (${Math.round(monthProgress * 100)}% through month)*\n\n`;
  
  // Calculate totals
  const totalSpent = Object.values(spending).reduce((a, b) => a + b, 0);
  const totalBudget = Object.values(BUDGETS).reduce((a, b) => a + b, 0);
  const proratedBudget = totalBudget * monthProgress;
  
  report += `**Overall:** $${totalSpent.toFixed(0)} spent of $${totalBudget} budget\n`;
  report += `**Pace:** ${totalSpent <= proratedBudget ? '✅ On track' : '⚠️ Over pace'} `;
  report += `($${proratedBudget.toFixed(0)} prorated target)\n\n`;
  
  // Category breakdown
  report += `**Category Status:**\n`;
  const alerts = [];
  const wins = [];
  
  Object.entries(BUDGETS)
    .filter(([cat]) => spending[cat] > 0)
    .sort((a, b) => (spending[b[0]] || 0) - (spending[a[0]] || 0))
    .slice(0, 10)
    .forEach(([cat, budget]) => {
      const actual = spending[cat] || 0;
      const prorated = budget * monthProgress;
      const pct = Math.round((actual / budget) * 100);
      const status = actual <= prorated ? '✅' : actual <= budget ? '⚠️' : '🔴';
      
      report += `${status} ${cat}: $${actual.toFixed(0)}/$${budget} (${pct}%)\n`;
      
      if (actual > budget) {
        alerts.push({ cat, actual, budget, pct });
      } else if (pct < 50 && monthProgress > 0.5) {
        wins.push({ cat, actual, budget, pct });
      }
    });
  
  // Advice section
  report += `\n**💡 Insights:**\n`;
  
  if (alerts.length > 0) {
    const worst = alerts[0];
    report += `• ${getAdvice(worst.cat, worst.actual, worst.budget)}\n`;
  }
  
  if (wins.length > 0) {
    const best = wins[0];
    report += `• ${getAdvice(best.cat, best.actual, best.budget)}\n`;
  }
  
  // Random general tip
  const tip = ADVICE.generalTips[Math.floor(Math.random() * ADVICE.generalTips.length)];
  report += `• ${tip}\n`;
  
  // Shopping-specific advice if high
  const shoppingSpend = spending['Shopping'] || 0;
  if (shoppingSpend > 800) {
    const amazonTip = ADVICE.amazonHigh[Math.floor(Math.random() * ADVICE.amazonHigh.length)]
      .replace('{pct}', Math.round((shoppingSpend / totalSpent) * 100));
    report += `• ${amazonTip}\n`;
  }
  
  await api.shutdown();
  
  return report;
}

// Run
generateReport()
  .then(report => console.log(report))
  .catch(err => {
    console.error('Error generating report:', err.message);
    process.exit(1);
  });
