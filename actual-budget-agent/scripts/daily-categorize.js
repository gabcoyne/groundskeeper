#!/usr/bin/env node
/**
 * Daily Transaction Categorization
 * - Auto-categorizes high-confidence matches
 * - Collects uncertain transactions for user review
 */

const api = require('@actual-app/api');

const CONFIG = {
  serverURL: 'http://actual-budget:5006',
  password: 'RGR!vwy*hay.vgm0dpg',
  syncId: '9b174808-0fe7-4d4d-9b09-7573d3caf074'
};

// HIGH CONFIDENCE rules (90%+ certain)
const HIGH_CONFIDENCE_RULES = {
  // Income
  'Income': [
    { pattern: /prefect.*payroll/i, confidence: 'HIGH' },
    { pattern: /payroll/i, confidence: 'HIGH' },
  ],
  
  // Mortgage
  'Mortgage': [
    { pattern: /crosscountry/i, confidence: 'HIGH' },
  ],
  
  // Auto Loans - specific
  'Auto - GV70 Loan': [
    { pattern: /gf genesis fi/i, confidence: 'HIGH' },
    { pattern: /genesis fi/i, confidence: 'HIGH' },
  ],
  'Auto - GV60 Loan': [
    { pattern: /ally.*paymt/i, confidence: 'HIGH' },
  ],
  'Auto - Parking': [
    { pattern: /chipay/i, confidence: 'HIGH' },
    { pattern: /spothero/i, confidence: 'HIGH' },
    { pattern: /laz parking/i, confidence: 'HIGH' },
    { pattern: /park.*chicago/i, confidence: 'HIGH' },
  ],
  'Auto - Maintenance': [
    { pattern: /car wash/i, confidence: 'HIGH' },
    { pattern: /car care auto/i, confidence: 'HIGH' },
  ],
  
  // Gas
  'Gas & Fuel': [
    { pattern: /\bshell\b/i, confidence: 'HIGH' },
    { pattern: /\bbp\s*(gas|#|\d)/i, confidence: 'HIGH' },
    { pattern: /exxon/i, confidence: 'HIGH' },
    { pattern: /chevron/i, confidence: 'HIGH' },
  ],
  
  // Pet Care
  'Pet Care': [
    { pattern: /trupanion/i, confidence: 'HIGH' },
    { pattern: /friendly paws/i, confidence: 'HIGH' },
    { pattern: /petco/i, confidence: 'HIGH' },
    { pattern: /petsmart/i, confidence: 'HIGH' },
    { pattern: /pet supplies plus/i, confidence: 'HIGH' },
    { pattern: /chewy/i, confidence: 'HIGH' },
    { pattern: /portage park anim/i, confidence: 'HIGH' },
  ],
  
  // Groceries
  'Groceries': [
    { pattern: /jewel.?osco/i, confidence: 'HIGH' },
    { pattern: /whole\s*foods/i, confidence: 'HIGH' },
    { pattern: /trader joe/i, confidence: 'HIGH' },
    { pattern: /mariano/i, confidence: 'HIGH' },
    { pattern: /costco(?!.*gas)/i, confidence: 'HIGH' },
    { pattern: /aldi/i, confidence: 'HIGH' },
  ],
  
  // Dining
  'Dining Out': [
    { pattern: /doordash/i, confidence: 'HIGH' },
    { pattern: /uber eats/i, confidence: 'HIGH' },
    { pattern: /grubhub/i, confidence: 'HIGH' },
    { pattern: /starbucks/i, confidence: 'HIGH' },
    { pattern: /dunkin/i, confidence: 'HIGH' },
    { pattern: /mcdonald/i, confidence: 'HIGH' },
    { pattern: /chipotle/i, confidence: 'HIGH' },
  ],
  
  // Alcohol & Bars
  'Alcohol & Bars': [
    { pattern: /binny.?s/i, confidence: 'HIGH' },
    { pattern: /total wine/i, confidence: 'HIGH' },
  ],
  
  // Utilities
  'Utilities': [
    { pattern: /comed/i, confidence: 'HIGH' },
    { pattern: /peoples gas/i, confidence: 'HIGH' },
    { pattern: /nicor/i, confidence: 'HIGH' },
  ],
  
  // Insurance
  'Insurance': [
    { pattern: /northwestern mutual/i, confidence: 'HIGH' },
    { pattern: /cinti insurance/i, confidence: 'HIGH' },
    { pattern: /state farm/i, confidence: 'HIGH' },
  ],
  
  // Fitness
  'Fitness': [
    { pattern: /lifetime fitness/i, confidence: 'HIGH' },
    { pattern: /equinox/i, confidence: 'HIGH' },
    { pattern: /peloton/i, confidence: 'HIGH' },
  ],
  
  // Subscriptions
  'Subscriptions': [
    { pattern: /netflix/i, confidence: 'HIGH' },
    { pattern: /spotify/i, confidence: 'HIGH' },
    { pattern: /hulu/i, confidence: 'HIGH' },
    { pattern: /disney\+/i, confidence: 'HIGH' },
    { pattern: /amazon prime/i, confidence: 'HIGH' },
    { pattern: /apple\.com\/bill/i, confidence: 'HIGH' },
  ],
  
  // Healthcare
  'Healthcare': [
    { pattern: /cvs/i, confidence: 'HIGH' },
    { pattern: /walgreens/i, confidence: 'HIGH' },
    { pattern: /northshore/i, confidence: 'HIGH' },
    { pattern: /webster dental/i, confidence: 'HIGH' },
  ],
  
  // Credit Card Payment (skip)
  'Credit Card Payment': [
    { pattern: /ally cc/i, confidence: 'HIGH' },
    { pattern: /payment to chase/i, confidence: 'HIGH' },
    { pattern: /chase credit crd/i, confidence: 'HIGH' },
  ],
  
  // Transfers (skip)
  'Transfers': [
    { pattern: /transfer/i, confidence: 'HIGH' },
    { pattern: /zelle/i, confidence: 'HIGH' },
    { pattern: /venmo/i, confidence: 'HIGH' },
  ],
};

// Skip these accounts
const SKIP_ACCOUNTS = ['Retirement', 'Investing', 'IRA', '401', 'Self-Directed'];

async function main() {
  await api.init({ dataDir: '/tmp/actual-data', serverURL: CONFIG.serverURL, password: CONFIG.password });
  await api.downloadBudget(CONFIG.syncId);
  
  const accounts = await api.getAccounts();
  const categories = await api.getCategories();
  const payees = await api.getPayees();
  
  const catByName = {};
  categories.forEach(c => { catByName[c.name] = c.id; });
  
  const payeeMap = {};
  payees.forEach(p => { payeeMap[p.id] = p.name; });
  
  // Find uncategorized transactions from last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);
  
  let uncategorized = [];
  let autoCategorized = [];
  let needsReview = [];
  
  for (const acc of accounts) {
    if (acc.closed || SKIP_ACCOUNTS.some(s => acc.name.includes(s))) continue;
    
    const txs = await api.getTransactions(acc.id);
    
    for (const t of txs) {
      if (!t.date || t.date < cutoff) continue;
      if (t.category) continue; // Already categorized
      
      const payeeName = payeeMap[t.payee] || t.imported_payee || '';
      
      // Try to match
      let matched = false;
      
      for (const [catName, rules] of Object.entries(HIGH_CONFIDENCE_RULES)) {
        for (const rule of rules) {
          if (rule.pattern.test(payeeName)) {
            const catId = catByName[catName];
            if (catId) {
              await api.updateTransaction(t.id, { category: catId });
              autoCategorized.push({ date: t.date, payee: payeeName, amount: t.amount, category: catName });
              matched = true;
              break;
            }
          }
        }
        if (matched) break;
      }
      
      if (!matched) {
        needsReview.push({
          id: t.id,
          date: t.date,
          payee: payeeName,
          amount: t.amount / 100,
          account: acc.name
        });
      }
    }
  }
  
  // Output results as JSON for the agent to parse
  const result = {
    autoCategorized: autoCategorized.length,
    needsReview: needsReview.slice(0, 20), // Limit to 20 for review
    totalUncategorized: needsReview.length
  };
  
  if (autoCategorized.length > 0) {
    await api.sync();
  }
  
  console.log(JSON.stringify(result, null, 2));
  
  await api.shutdown();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
