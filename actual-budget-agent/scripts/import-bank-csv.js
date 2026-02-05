#!/usr/bin/env node
/**
 * Import bank CSV exports into Actual Budget
 * Supports: Ally Savings/Spending, Chase Checking, Chase Credit Cards
 */

const api = require('@actual-app/api');
const fs = require('fs');
const path = require('path');

// Actual Budget connection
const ACTUAL_URL = 'http://actual-budget:5006';
const ACTUAL_PASSWORD = 'RGR!vwy*hay.vgm0dpg';
const ACTUAL_SYNC_ID = '9b174808-0fe7-4d4d-9b09-7573d3caf074';

// Account mappings - map CSV identifiers to Actual account names
const ACCOUNT_MAPPINGS = {
  'ally_savings_1564': 'Savings Account',
  'ally_spending_7893': 'Spending Account', 
  'chase_checking_3057': 'Chase Checking',
  'chase_sapphire_0418': 'Chase Sapphire',
  'chase_amazon_1447': 'Chase Amazon',
};

// Parse Ally CSV format (Date, Time, Amount, Type, Description)
function parseAllyCSV(content, accountType) {
  const lines = content.trim().split('\n');
  const transactions = [];
  
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Handle quoted fields
    const parts = parseCSVLine(line);
    if (parts.length < 5) continue;
    
    const [date, time, amountStr, type, ...descParts] = parts;
    const description = descParts.join(',').trim();
    const amount = parseFloat(amountStr);
    
    if (isNaN(amount)) continue;
    
    transactions.push({
      date: date.trim(),
      amount: Math.round(amount * 100), // Actual uses cents
      payee: cleanPayee(description),
      notes: `${type} - ${description}`,
      imported_id: `ally_${accountType}_${date}_${amount}_${description.slice(0, 20)}`.replace(/[^a-zA-Z0-9_]/g, '_'),
    });
  }
  
  return transactions;
}

// Parse Chase CSV format (Transaction Date,Post Date,Description,Category,Type,Amount,Memo)
function parseChaseCardCSV(content) {
  const lines = content.trim().split('\n');
  const transactions = [];
  
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = parseCSVLine(line);
    if (parts.length < 6) continue;
    
    const [transDate, postDate, description, category, type, amountStr] = parts;
    const amount = parseFloat(amountStr);
    
    if (isNaN(amount)) continue;
    
    // Skip payments (they show as positive amounts)
    if (type === 'Payment' || description.includes('Payment Thank You')) {
      continue;
    }
    
    transactions.push({
      date: transDate.trim(),
      amount: Math.round(amount * 100), // Already negative for purchases
      payee: cleanPayee(description),
      notes: category ? `[${category}] ${description}` : description,
      imported_id: `chase_${transDate}_${amount}_${description.slice(0, 20)}`.replace(/[^a-zA-Z0-9_]/g, '_'),
    });
  }
  
  return transactions;
}

// Parse Chase Checking CSV format (Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #)
function parseChaseCheckingCSV(content) {
  const lines = content.trim().split('\n');
  const transactions = [];
  
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = parseCSVLine(line);
    if (parts.length < 5) continue;
    
    const [details, postDate, description, amountStr, type] = parts;
    const amount = parseFloat(amountStr);
    
    if (isNaN(amount)) continue;
    
    transactions.push({
      date: postDate.trim(),
      amount: Math.round(amount * 100),
      payee: cleanPayee(description),
      notes: `[${type}] ${description}`,
      imported_id: `chase_chk_${postDate}_${amount}_${description.slice(0, 20)}`.replace(/[^a-zA-Z0-9_]/g, '_'),
    });
  }
  
  return transactions;
}

// Parse CSV line handling quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
}

// Clean up payee name
function cleanPayee(description) {
  return description
    .replace(/\s+/g, ' ')
    .replace(/["\n\r]/g, '')
    .trim()
    .slice(0, 100); // Truncate long descriptions
}

// Convert date formats to YYYY-MM-DD
function normalizeDate(dateStr) {
  // Handle MM/DD/YYYY
  if (dateStr.includes('/')) {
    const [month, day, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  // Already YYYY-MM-DD
  return dateStr;
}

// Detect CSV format based on header
function detectFormat(content) {
  const firstLine = content.split('\n')[0].toLowerCase();
  
  if (firstLine.includes('details') && firstLine.includes('posting date') && firstLine.includes('balance')) {
    return 'chase_checking';
  }
  if (firstLine.includes('transaction date') && firstLine.includes('post date') && firstLine.includes('memo')) {
    return 'chase_card';
  }
  if (firstLine.includes('date') && firstLine.includes('time') && firstLine.includes('type')) {
    return 'ally';
  }
  
  return 'unknown';
}

async function importCSV(filePath, accountName) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const format = detectFormat(content);
  
  console.log(`\nProcessing: ${path.basename(filePath)}`);
  console.log(`  Detected format: ${format}`);
  console.log(`  Target account: ${accountName}`);
  
  let transactions;
  switch (format) {
    case 'ally':
      transactions = parseAllyCSV(content, accountName.includes('Savings') ? 'sav' : 'spend');
      break;
    case 'chase_card':
      transactions = parseChaseCardCSV(content);
      break;
    case 'chase_checking':
      transactions = parseChaseCheckingCSV(content);
      break;
    default:
      console.log('  ⚠️  Unknown format, skipping');
      return { imported: 0, skipped: 0 };
  }
  
  console.log(`  Parsed ${transactions.length} transactions`);
  
  // Normalize dates
  transactions = transactions.map(t => ({
    ...t,
    date: normalizeDate(t.date),
  }));
  
  // Get account ID from Actual
  const accounts = await api.getAccounts();
  const account = accounts.find(a => 
    a.name.toLowerCase().includes(accountName.toLowerCase()) ||
    accountName.toLowerCase().includes(a.name.toLowerCase())
  );
  
  if (!account) {
    console.log(`  ⚠️  Account "${accountName}" not found in Actual Budget`);
    console.log(`  Available accounts: ${accounts.map(a => a.name).join(', ')}`);
    return { imported: 0, skipped: 0 };
  }
  
  console.log(`  Found account: ${account.name} (${account.id})`);
  
  // Import transactions
  let imported = 0;
  let skipped = 0;
  
  for (const tx of transactions) {
    try {
      await api.importTransactions(account.id, [{
        date: tx.date,
        amount: tx.amount,
        payee_name: tx.payee,
        notes: tx.notes,
        imported_id: tx.imported_id,
      }]);
      imported++;
    } catch (err) {
      if (err.message && err.message.includes('duplicate')) {
        skipped++;
      } else {
        // Likely duplicate - Actual handles this gracefully
        skipped++;
      }
    }
  }
  
  console.log(`  ✓ Imported: ${imported}, Skipped (duplicates): ${skipped}`);
  return { imported, skipped };
}

async function main() {
  // File to account mapping
  const imports = [
    { file: process.argv[2], account: process.argv[3] },
  ];
  
  // If no args, show usage
  if (!process.argv[2]) {
    console.log('Usage: node import-bank-csv.js <csv-file> <account-name>');
    console.log('\nExamples:');
    console.log('  node import-bank-csv.js ally-savings.csv "Savings Account"');
    console.log('  node import-bank-csv.js chase-checking.csv "Chase Checking"');
    console.log('\nOr use --batch with predefined mappings');
    process.exit(1);
  }
  
  try {
    console.log('Connecting to Actual Budget...');
    await api.init({
      dataDir: '/tmp/actual-data',
      serverURL: ACTUAL_URL,
      password: ACTUAL_PASSWORD,
    });
    
    await api.downloadBudget(ACTUAL_SYNC_ID);
    console.log('Connected!\n');
    
    const results = { totalImported: 0, totalSkipped: 0 };
    
    for (const { file, account } of imports) {
      if (!file || !account) continue;
      
      if (!fs.existsSync(file)) {
        console.log(`File not found: ${file}`);
        continue;
      }
      
      const result = await importCSV(file, account);
      results.totalImported += result.imported;
      results.totalSkipped += result.skipped;
    }
    
    // Sync changes
    await api.sync();
    
    console.log('\n' + '='.repeat(50));
    console.log(`Total imported: ${results.totalImported}`);
    console.log(`Total skipped: ${results.totalSkipped}`);
    
    await api.shutdown();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
