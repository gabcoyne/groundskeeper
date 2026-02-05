/**
 * Categorize transactions and update Actual Budget
 * 
 * Reads transactions, applies categorization rules, and pushes updates.
 */

const api = require('@actual-app/api');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  serverURL: 'http://actual-budget:5006',
  password: 'RGR!vwy*hay.vgm0dpg',
  syncId: '9b174808-0fe7-4d4d-9b09-7573d3caf074',
  dataDir: '/tmp/actual-data',
};

// Category mapping rules (payee pattern -> category name)
const CATEGORY_RULES = [
  // Groceries
  { pattern: /jewel|aldi|mariano|costco|whole ?foods|trader joe|fresh farms|target/i, category: 'Food' },
  { pattern: /walmart.*grocery|grocery/i, category: 'Food' },
  
  // Dining
  { pattern: /uber\s*eats|doordash|grubhub|seamless/i, category: 'Food' },
  { pattern: /restaurant|grill|bistro|cafe|diner|kitchen|tavern|bar\s|pub\s/i, category: 'Food' },
  { pattern: /portillo|chipotle|panera|starbucks|dunkin|mcdonald|wendy|burger king/i, category: 'Food' },
  { pattern: /pizza|bakery|coffee|breakfast|bbq|taco/i, category: 'Food' },
  { pattern: /galit|sepia|sky|tank kitchen|franks|three tarts/i, category: 'Food' },
  
  // Bills - Fixed
  { pattern: /comed|peoples gas|nicor|electric|gas\s*bill/i, category: 'Bills' },
  { pattern: /comcast|xfinity|at&t|verizon|t-mobile|internet/i, category: 'Bills' },
  { pattern: /city of chicago.*water|water bill/i, category: 'Bills' },
  { pattern: /insurance|state farm|allstate|geico|progressive|northwestern mutual|pacific life|trupanion|cinti ins/i, category: 'Bills' },
  { pattern: /genesis fi|car payment|auto loan/i, category: 'Bills' },
  { pattern: /sba eidl|loan payment/i, category: 'Bills' },
  
  // Bills - Flexible (Subscriptions)
  { pattern: /netflix|hulu|disney|hbo|spotify|apple\s*(music|tv)|amazon\s*prime|youtube/i, category: 'Bills (Flexible)' },
  { pattern: /peloton|gym|fitness|la fitness|lifetime/i, category: 'Bills (Flexible)' },
  { pattern: /openai|chatgpt|google\s*(one|workspace|cloud)|adobe|microsoft|dropbox/i, category: 'Bills (Flexible)' },
  { pattern: /patreon|subscribestar|substack|medium/i, category: 'Bills (Flexible)' },
  { pattern: /audible|kindle|amazon prime/i, category: 'Bills (Flexible)' },
  { pattern: /webflow|namecheap|porkbun|wordpress/i, category: 'Bills (Flexible)' },
  { pattern: /nest|ring|security/i, category: 'Bills (Flexible)' },
  { pattern: /nts live|soundcloud|steam/i, category: 'Bills (Flexible)' },
  
  // Transportation
  { pattern: /uber(?!\s*eats)|lyft/i, category: 'General' },
  { pattern: /shell|bp|exxon|mobil|chevron|marathon|gas\s*station/i, category: 'General' },
  { pattern: /parking|park chicago|spothero|laz parking/i, category: 'General' },
  { pattern: /tollway|ipass|ventra|cta|metra/i, category: 'General' },
  { pattern: /hyundai.*blink|ev.*charg/i, category: 'General' },
  
  // Shopping
  { pattern: /amazon(?!\s*(prime|pharmacy))/i, category: 'General' },
  { pattern: /target|walmart(?!.*grocery)/i, category: 'General' },
  { pattern: /home depot|lowes|menards|crafty beaver/i, category: 'General' },
  { pattern: /best buy|apple\s*store|micro center/i, category: 'General' },
  { pattern: /nordstrom|macy|gap|zara|uniqlo|j crew|nike|todd snyder|lands.*end|anthropologie/i, category: 'General' },
  { pattern: /ikea|crate|barrel|pottery barn/i, category: 'General' },
  { pattern: /walgreens|cvs|pharmacy/i, category: 'General' },
  { pattern: /pet|dog|friendly paws|trupanion/i, category: 'General' },
  
  // Health & Medical
  { pattern: /doctor|medical|clinic|hospital|dental|webster dental|northshore/i, category: 'Bills' },
  { pattern: /amazon\s*pharmacy/i, category: 'General' },
  
  // Savings/Investments
  { pattern: /betterment|schwab|transfer|investment/i, category: 'Savings' },
  
  // Income
  { pattern: /payroll|salary|prefect technolo.*payroll|direct deposit/i, category: 'Income' },
  { pattern: /fedwire|wire.*credit|protectly/i, category: 'Income' },
  { pattern: /interest payment|dividend/i, category: 'Income' },
  { pattern: /zelle.*from/i, category: 'Income' },
  
  // Transfers (excluded from categorization)
  { pattern: /zelle.*to|payment to chase|chase credit card|online transfer/i, category: null },
  { pattern: /payment thank you|automatic payment/i, category: null },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  try {
    await api.init({
      serverURL: CONFIG.serverURL,
      password: CONFIG.password,
      dataDir: CONFIG.dataDir,
    });

    console.error('Downloading budget...');
    await api.downloadBudget(CONFIG.syncId);

    // Get existing categories
    const categories = await api.getCategories();
    const categoryMap = {};
    for (const cat of categories) {
      categoryMap[cat.name] = cat.id;
    }
    console.error('Categories:', Object.keys(categoryMap).join(', '));

    // Get transactions without categories
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 12);
    
    const transactions = await api.getTransactions(
      undefined,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );

    // Get payees for mapping
    const payees = await api.getPayees();
    const payeeMap = {};
    for (const p of payees) {
      payeeMap[p.id] = p.name;
    }

    console.error(`Processing ${transactions.length} transactions...`);

    let categorized = 0;
    let skipped = 0;
    let alreadyCategorized = 0;
    const updates = [];
    const summary = {};

    for (const txn of transactions) {
      // Skip if already categorized (not null and not "Starting Balances")
      if (txn.category && !txn.category.includes('Starting')) {
        alreadyCategorized++;
        continue;
      }

      const payeeName = payeeMap[txn.payee] || '';
      const notes = txn.notes || '';
      const searchText = `${payeeName} ${notes}`;

      // Find matching category
      let matchedCategory = null;
      for (const rule of CATEGORY_RULES) {
        if (rule.pattern.test(searchText)) {
          matchedCategory = rule.category;
          break;
        }
      }

      if (matchedCategory === null) {
        // Explicit skip (transfers, payments)
        skipped++;
        continue;
      }

      if (!matchedCategory) {
        // No match found
        skipped++;
        if (!summary['Uncategorized']) summary['Uncategorized'] = [];
        summary['Uncategorized'].push({ payee: payeeName, notes, amount: txn.amount });
        continue;
      }

      const categoryId = categoryMap[matchedCategory];
      if (!categoryId) {
        console.error(`Warning: Category "${matchedCategory}" not found in budget`);
        skipped++;
        continue;
      }

      // Track summary
      if (!summary[matchedCategory]) summary[matchedCategory] = 0;
      summary[matchedCategory]++;
      categorized++;

      updates.push({
        id: txn.id,
        category: categoryId,
      });
    }

    console.error(`\nSummary:`);
    console.error(`  Already categorized: ${alreadyCategorized}`);
    console.error(`  Newly categorized: ${categorized}`);
    console.error(`  Skipped (transfers/unknown): ${skipped}`);
    console.error(`\nBy category:`);
    for (const [cat, count] of Object.entries(summary)) {
      if (cat !== 'Uncategorized') {
        console.error(`  ${cat}: ${count}`);
      }
    }

    if (summary['Uncategorized']) {
      console.error(`\nUncategorized transactions (${summary['Uncategorized'].length}):`);
      for (const txn of summary['Uncategorized'].slice(0, 10)) {
        console.error(`  - ${txn.payee || 'Unknown'}: ${txn.notes || ''} ($${(txn.amount / 100).toFixed(2)})`);
      }
      if (summary['Uncategorized'].length > 10) {
        console.error(`  ... and ${summary['Uncategorized'].length - 10} more`);
      }
    }

    if (dryRun) {
      console.error('\n[DRY RUN] No changes applied.');
    } else if (updates.length > 0) {
      console.error(`\nApplying ${updates.length} updates...`);
      
      for (const update of updates) {
        await api.updateTransaction(update.id, { category: update.category });
      }
      
      console.error('Syncing changes...');
      await api.sync();
      console.error('Done!');
    }

    // Output JSON summary
    console.log(JSON.stringify({
      status: 'ok',
      total: transactions.length,
      alreadyCategorized,
      newlyCategorized: categorized,
      skipped,
      byCategory: summary,
      dryRun,
    }, null, 2));

    await api.shutdown();
  } catch (error) {
    console.error('Error:', error.message);
    console.log(JSON.stringify({ status: 'error', error: error.message }));
    process.exit(1);
  }
}

main();
