const api = require('@actual-app/api');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Business expense patterns with deduction rates
const BIZ_RULES = [
  // Software & Cloud (100% if business use)
  { pattern: /google cloud|google workspace|google work|google one|\baws\b|azure|openai|github|quickbooks|intuit|simplefin|webflow|shippo\.com|namecheap|porkbun|digitalocean/i, 
    category: 'Software & Cloud', rate: 1.0, notes: '100% deductible for business software' },
  
  // Business Insurance
  { pattern: /next insurance/i, 
    category: 'Business Insurance', rate: 1.0, notes: 'Business liability/E&O insurance' },
  
  // Professional Development
  { pattern: /milk street|udemy|coursera|linkedin learning|skillshare|masterclass/i, 
    category: 'Professional Development', rate: 1.0, notes: 'Education related to business' },
  
  // Office Supplies & Equipment
  { pattern: /mcmaster|staples|office depot|paper source|michaels|best buy|apple\.com/i, 
    category: 'Office Supplies', rate: 0.5, notes: 'Verify business use - adjust rate accordingly' },
  
  // Business Travel (100% if for business)
  { pattern: /airbnb|vrbo|hotel|marriott|hilton|hyatt|airline|united air|american air|delta|southwest|going\.com|uplift/i, 
    category: 'Travel', rate: 1.0, notes: 'Verify business purpose - keep documentation' },
  
  // Business Meals (50% deductible per IRS)
  { pattern: /doordash|seamless|uber eats|grubhub/i, 
    category: 'Business Meals', rate: 0.5, notes: '50% deductible per IRS rules - document business purpose' },
  
  // Internet/Phone (home office %)
  { pattern: /comcast|xfinity|at&t|verizon|t-mobile/i, 
    category: 'Internet & Phone', rate: 0.3, notes: 'Adjust rate based on home office % - default 30%' },
  
  // Vehicle expenses
  { pattern: /bp gas|shell|exxon|mobil|chevron|speedway|genesis.*blink|ev charging|parking|spothero|car wash/i, 
    category: 'Vehicle', rate: 0.0, notes: 'Track mileage separately - or set rate for business use %' },
  
  // SBA Loan Interest
  { pattern: /u\.?s\.?\s*small business|sba/i, 
    category: 'Loan Interest', rate: 1.0, notes: 'SBA loan interest is deductible' },
  
  // Professional Subscriptions
  { pattern: /wikipedia|substack|patreon|nytimes|wsj|bloomberg/i, 
    category: 'Subscriptions', rate: 0.5, notes: 'Business research - verify relevance' },
  
  // Domain & Hosting
  { pattern: /godaddy|cloudflare|netlify|vercel|heroku|render\.com/i, 
    category: 'Hosting & Domains', rate: 1.0, notes: 'Web infrastructure for business' },
  
  // Professional Services
  { pattern: /lawyer|attorney|accountant|cpa|bookkeeper|legal/i, 
    category: 'Professional Services', rate: 1.0, notes: 'Legal and accounting fees' },
  
  // Banking & Payment Processing
  { pattern: /stripe|square|paypal fee|merchant/i, 
    category: 'Payment Processing', rate: 1.0, notes: 'Payment processing fees' },
];

const DB_PATH = path.join(__dirname, 'tax-deductions.sqlite');

function initDB() {
  const db = new Database(DB_PATH);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS deductions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tax_year INTEGER NOT NULL,
      date TEXT NOT NULL,
      payee TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      deduction_rate REAL NOT NULL,
      deductible_amount REAL NOT NULL,
      notes TEXT,
      verified INTEGER DEFAULT 0,
      source_account TEXT,
      source_txn_id TEXT UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_deductions_year ON deductions(tax_year);
    CREATE INDEX IF NOT EXISTS idx_deductions_category ON deductions(category);
  `);
  
  return db;
}

async function syncDeductions(year = 2025) {
  console.log(`🔄 Syncing ${year} deductions from Actual Budget...`);
  
  // Connect to Actual Budget
  await api.init({ 
    dataDir: './actual-data', 
    serverURL: 'http://actual-budget:5006', 
    password: 'RGR!vwy*hay.vgm0dpg' 
  });
  await api.downloadBudget('9b174808-0fe7-4d4d-9b09-7573d3caf074', { password: 'RGR!vwy*hay.vgm0dpg' });
  
  const payees = await api.getPayees();
  const payeeMap = {};
  payees.forEach(p => payeeMap[p.id] = p.name);
  
  const accounts = await api.getAccounts();
  const accountMap = {};
  accounts.forEach(a => accountMap[a.id] = a.name);
  
  // Collect business expenses
  const expenses = [];
  
  for (const account of accounts) {
    if (account.closed || /retirement|401k|ira|investing|self-directed/i.test(account.name)) continue;
    
    const txns = await api.getTransactions(account.id, `${year}-01-01`, `${year}-12-31`);
    
    for (const t of txns) {
      if (t.amount >= 0 || t.transfer_id) continue;
      
      const payeeName = payeeMap[t.payee] || '';
      
      for (const rule of BIZ_RULES) {
        if (rule.pattern.test(payeeName)) {
          const amount = Math.abs(t.amount / 100);
          expenses.push({
            tax_year: year,
            date: t.date,
            payee: payeeName,
            description: t.notes || null,
            amount: amount,
            category: rule.category,
            deduction_rate: rule.rate,
            deductible_amount: +(amount * rule.rate).toFixed(2),
            notes: rule.notes,
            verified: 0,
            source_account: accountMap[t.account],
            source_txn_id: t.id
          });
          break;
        }
      }
    }
  }
  
  await api.shutdown();
  
  // Write to SQLite
  const db = initDB();
  
  // Clear existing data for this year (to allow re-sync)
  db.prepare(`DELETE FROM deductions WHERE tax_year = ?`).run(year);
  
  // Insert new data
  const insert = db.prepare(`
    INSERT OR REPLACE INTO deductions 
    (tax_year, date, payee, description, amount, category, deduction_rate, 
     deductible_amount, notes, verified, source_account, source_txn_id)
    VALUES (@tax_year, @date, @payee, @description, @amount, @category, @deduction_rate,
            @deductible_amount, @notes, @verified, @source_account, @source_txn_id)
  `);
  
  const insertMany = db.transaction((items) => {
    for (const item of items) insert.run(item);
  });
  
  insertMany(expenses);
  
  // Generate summary
  console.log(`\n✅ Synced ${expenses.length} potential deductions for ${year}\n`);
  
  const summary = db.prepare(`
    SELECT category, 
           COUNT(*) as count,
           ROUND(SUM(amount), 2) as total_spent,
           ROUND(SUM(deductible_amount), 2) as total_deductible
    FROM deductions 
    WHERE tax_year = ?
    GROUP BY category
    ORDER BY total_deductible DESC
  `).all(year);
  
  console.log('📊 Summary by Category:\n');
  console.log('Category                    | Count |    Spent | Deductible');
  console.log('----------------------------|-------|----------|----------');
  
  let grandSpent = 0, grandDeductible = 0;
  summary.forEach(r => {
    const cat = r.category.padEnd(27);
    const cnt = String(r.count).padStart(5);
    const spent = ('$' + r.total_spent.toFixed(2)).padStart(9);
    const ded = ('$' + r.total_deductible.toFixed(2)).padStart(10);
    console.log(`${cat} | ${cnt} | ${spent} | ${ded}`);
    grandSpent += r.total_spent;
    grandDeductible += r.total_deductible;
  });
  
  console.log('----------------------------|-------|----------|----------');
  console.log(`${'TOTAL'.padEnd(27)} | ${String(expenses.length).padStart(5)} | ${('$' + grandSpent.toFixed(2)).padStart(9)} | ${('$' + grandDeductible.toFixed(2)).padStart(10)}`);
  
  db.close();
  console.log(`\n💾 Database saved to: ${DB_PATH}`);
}

function report(year = 2025) {
  const db = initDB();
  
  console.log(`\n📋 ${year} TAX DEDUCTION REPORT\n`);
  console.log(`Generated: ${new Date().toISOString()}\n`);
  
  const rows = db.prepare(`
    SELECT * FROM deductions 
    WHERE tax_year = ?
    ORDER BY category, date
  `).all(year);
  
  if (rows.length === 0) {
    console.log('No deductions found. Run: node tax-deductions.js sync');
    db.close();
    return;
  }
  
  let currentCat = '';
  let catTotal = 0;
  let grandTotal = 0;
  
  rows.forEach(r => {
    if (r.category !== currentCat) {
      if (currentCat) {
        console.log(`  ${'─'.repeat(50)}`);
        console.log(`  Subtotal: $${catTotal.toFixed(2)}\n`);
      }
      console.log(`📁 ${r.category}`);
      currentCat = r.category;
      catTotal = 0;
    }
    const verified = r.verified ? '✓' : ' ';
    const rate = (r.deduction_rate * 100).toFixed(0);
    console.log(`  ${verified} ${r.date} | $${r.amount.toFixed(2).padStart(8)} × ${rate.padStart(3)}% = $${r.deductible_amount.toFixed(2).padStart(8)} | ${r.payee}`);
    catTotal += r.deductible_amount;
    grandTotal += r.deductible_amount;
  });
  
  console.log(`  ${'─'.repeat(50)}`);
  console.log(`  Subtotal: $${catTotal.toFixed(2)}\n`);
  console.log(`${'═'.repeat(55)}`);
  console.log(`TOTAL DEDUCTIBLE: $${grandTotal.toFixed(2)}`);
  console.log(`${'═'.repeat(55)}`);
  
  db.close();
}

function exportCSV(year = 2025) {
  const db = initDB();
  const csvPath = path.join(__dirname, `deductions-${year}.csv`);
  
  const rows = db.prepare(`
    SELECT tax_year, date, payee, description, amount, category, 
           deduction_rate, deductible_amount, notes, verified, source_account
    FROM deductions 
    WHERE tax_year = ?
    ORDER BY category, date
  `).all(year);
  
  const header = 'tax_year,date,payee,description,amount,category,deduction_rate,deductible_amount,notes,verified,source_account';
  const csvRows = rows.map(r => {
    return [
      r.tax_year,
      r.date,
      `"${(r.payee || '').replace(/"/g, '""')}"`,
      `"${(r.description || '').replace(/"/g, '""')}"`,
      r.amount,
      `"${r.category}"`,
      r.deduction_rate,
      r.deductible_amount,
      `"${(r.notes || '').replace(/"/g, '""')}"`,
      r.verified,
      `"${r.source_account || ''}"`
    ].join(',');
  });
  
  fs.writeFileSync(csvPath, [header, ...csvRows].join('\n'));
  console.log(`📄 Exported ${rows.length} records to: ${csvPath}`);
  
  db.close();
}

function exportJSON(year = 2025) {
  const db = initDB();
  const jsonPath = path.join(__dirname, `deductions-${year}.json`);
  
  const rows = db.prepare(`SELECT * FROM deductions WHERE tax_year = ? ORDER BY category, date`).all(year);
  
  const summary = db.prepare(`
    SELECT category, 
           COUNT(*) as count,
           SUM(amount) as total_spent,
           SUM(deductible_amount) as total_deductible
    FROM deductions WHERE tax_year = ?
    GROUP BY category
  `).all(year);
  
  const output = {
    tax_year: year,
    generated: new Date().toISOString(),
    summary: {
      total_items: rows.length,
      total_spent: rows.reduce((s, r) => s + r.amount, 0),
      total_deductible: rows.reduce((s, r) => s + r.deductible_amount, 0),
      by_category: summary
    },
    deductions: rows
  };
  
  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
  console.log(`📄 Exported to: ${jsonPath}`);
  
  db.close();
}

function verify(id, verified = true) {
  const db = initDB();
  db.prepare(`UPDATE deductions SET verified = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(verified ? 1 : 0, id);
  console.log(`✅ Deduction #${id} marked as ${verified ? 'verified' : 'unverified'}`);
  db.close();
}

function setRate(id, rate) {
  const db = initDB();
  const row = db.prepare(`SELECT amount FROM deductions WHERE id = ?`).get(id);
  if (!row) {
    console.log(`❌ Deduction #${id} not found`);
    db.close();
    return;
  }
  const newDeductible = +(row.amount * rate).toFixed(2);
  db.prepare(`UPDATE deductions SET deduction_rate = ?, deductible_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(rate, newDeductible, id);
  console.log(`✅ Deduction #${id} rate set to ${(rate * 100).toFixed(0)}% (deductible: $${newDeductible})`);
  db.close();
}

// CLI
const cmd = process.argv[2] || 'help';
const arg1 = process.argv[3];
const arg2 = process.argv[4];

switch (cmd) {
  case 'sync':
    syncDeductions(parseInt(arg1) || 2025).catch(console.error);
    break;
  case 'report':
    report(parseInt(arg1) || 2025);
    break;
  case 'csv':
    exportCSV(parseInt(arg1) || 2025);
    break;
  case 'json':
    exportJSON(parseInt(arg1) || 2025);
    break;
  case 'verify':
    verify(parseInt(arg1), arg2 !== 'false');
    break;
  case 'rate':
    setRate(parseInt(arg1), parseFloat(arg2));
    break;
  default:
    console.log(`
Coyne Solutions Tax Deduction Tracker

Usage: node tax-deductions.js <command> [args]

Commands:
  sync [year]        Sync deductions from Actual Budget (default: 2025)
  report [year]      Print detailed report
  csv [year]         Export to CSV file
  json [year]        Export to JSON file
  verify <id>        Mark deduction as verified
  rate <id> <rate>   Set deduction rate (0.0-1.0)

Examples:
  node tax-deductions.js sync 2025
  node tax-deductions.js report
  node tax-deductions.js csv 2025
  node tax-deductions.js verify 42
  node tax-deductions.js rate 15 0.5
`);
}
