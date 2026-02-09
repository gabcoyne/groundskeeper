#!/usr/bin/env node
/**
 * Auto-link duplicate payment transactions as transfers
 * 
 * SimpleFIN imports credit card payments as separate transactions on both
 * the checking and credit card accounts. This script finds matching pairs
 * and links them as proper transfers.
 */

const api = require('@actual-app/api');

const CONFIG = {
  dataDir: './actual-data',
  serverURL: 'http://actual-budget:5006',
  password: 'RGR!vwy*hay.vgm0dpg',
  syncId: '9b174808-0fe7-4d4d-9b09-7573d3caf074'
};

// Patterns to identify credit card payments from checking
const PAYMENT_PATTERNS = [
  /payment to chase card ending in (\d+)/i,
  /chase credit card/i,
  /chase credit crd autopay/i,
  /applecard gsbank payment/i,
  /apple credit card/i,
];

async function linkTransfers(dryRun = true) {
  console.log('='.repeat(60));
  console.log('Auto-Link Credit Card Payment Transfers');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will modify)'}\n`);

  await api.init(CONFIG);
  await api.downloadBudget(CONFIG.syncId);

  const accounts = await api.getAccounts();
  const categories = await api.getCategories();
  
  // Find accounts
  const checking = accounts.find(a => a.name.toLowerCase().includes('checking'));
  const creditCards = accounts.filter(a => 
    a.name.toLowerCase().includes('visa') ||
    a.name.toLowerCase().includes('chase') ||
    a.name.toLowerCase().includes('sapphire') ||
    a.name.toLowerCase().includes('freedom') ||
    a.name.toLowerCase().includes('united') ||
    a.name.toLowerCase().includes('apple')
  );

  console.log(`Checking account: ${checking?.name || 'NOT FOUND'}`);
  console.log(`Credit cards found: ${creditCards.map(c => c.name).join(', ')}\n`);

  if (!checking) {
    console.error('Could not find checking account!');
    await api.shutdown();
    return;
  }

  // Get all checking transactions
  const checkingTx = await api.getTransactions(checking.id);
  
  // Find outgoing payments to credit cards (negative amounts, matching patterns)
  const outgoingPayments = checkingTx.filter(t => {
    if (t.amount >= 0) return false; // Must be outgoing
    if (t.transfer_id) return false; // Already linked
    const payee = (t.payee_name || t.imported_payee || '').toLowerCase();
    return PAYMENT_PATTERNS.some(p => p.test(payee));
  });

  console.log(`Found ${outgoingPayments.length} unlinked outgoing payments from checking\n`);

  const results = {
    matched: [],
    unmatched: [],
    errors: []
  };

  // For each credit card, find matching incoming payments
  for (const card of creditCards) {
    const cardTx = await api.getTransactions(card.id);
    
    // Find incoming payments (positive amounts, not already transfers)
    const incomingPayments = cardTx.filter(t => 
      t.amount > 0 && 
      !t.transfer_id &&
      ((t.payee_name || t.imported_payee || '').toLowerCase().includes('payment') ||
       (t.payee_name || t.imported_payee || '').toLowerCase().includes('autopay'))
    );

    console.log(`${card.name}: ${incomingPayments.length} unlinked incoming payments`);

    // Try to match outgoing to incoming
    for (const outgoing of outgoingPayments) {
      // Check if this payment is for this specific card
      const outPayee = (outgoing.payee_name || outgoing.imported_payee || '').toLowerCase();
      
      // Extract card number if present
      const cardNumMatch = outPayee.match(/ending in (\d+)/);
      if (cardNumMatch) {
        const lastFour = cardNumMatch[1];
        if (!card.name.includes(lastFour)) continue; // Wrong card
      }

      // Find matching incoming payment
      const outAmount = Math.abs(outgoing.amount);
      const outDate = new Date(outgoing.date);

      for (const incoming of incomingPayments) {
        if (incoming.amount !== outAmount) continue; // Amount must match exactly
        
        const inDate = new Date(incoming.date);
        const daysDiff = Math.abs((outDate - inDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff > 5) continue; // Must be within 5 days

        // Found a match!
        results.matched.push({
          outgoing: {
            id: outgoing.id,
            date: outgoing.date,
            amount: outgoing.amount / 100,
            payee: outgoing.payee_name || outgoing.imported_payee,
            account: checking.name
          },
          incoming: {
            id: incoming.id,
            date: incoming.date,
            amount: incoming.amount / 100,
            payee: incoming.payee_name || incoming.imported_payee,
            account: card.name
          }
        });

        // Remove from available lists to prevent double-matching
        const outIdx = outgoingPayments.indexOf(outgoing);
        if (outIdx > -1) outgoingPayments.splice(outIdx, 1);
        
        const inIdx = incomingPayments.indexOf(incoming);
        if (inIdx > -1) incomingPayments.splice(inIdx, 1);

        break; // Move to next outgoing
      }
    }

    // Track unmatched incoming
    for (const inc of incomingPayments) {
      results.unmatched.push({
        type: 'incoming',
        account: card.name,
        date: inc.date,
        amount: inc.amount / 100,
        payee: inc.payee_name || inc.imported_payee
      });
    }
  }

  // Track unmatched outgoing
  for (const out of outgoingPayments) {
    results.unmatched.push({
      type: 'outgoing',
      account: checking.name,
      date: out.date,
      amount: out.amount / 100,
      payee: out.payee_name || out.imported_payee
    });
  }

  // Report results
  console.log('\n' + '-'.repeat(60));
  console.log('MATCHED PAIRS');
  console.log('-'.repeat(60));

  for (const match of results.matched) {
    console.log(`\n✓ $${Math.abs(match.outgoing.amount).toFixed(2)}`);
    console.log(`  OUT: ${match.outgoing.date} | ${match.outgoing.payee?.slice(0, 40)}`);
    console.log(`  IN:  ${match.incoming.date} | ${match.incoming.payee?.slice(0, 40)} (${match.incoming.account.slice(0, 25)})`);
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`SUMMARY: ${results.matched.length} pairs to link`);
  console.log('-'.repeat(60));

  // Apply changes if not dry run
  if (!dryRun && results.matched.length > 0) {
    console.log('\nLinking transfers...');
    
    // Get all payees once
    const payees = await api.getPayees();
    
    for (const match of results.matched) {
      try {
        // Find the transfer payee for the credit card account
        // The transfer payee has transfer_acct = the card's account ID
        const cardAccountId = creditCards.find(c => c.name === match.incoming.account)?.id;
        const transferPayee = payees.find(p => p.transfer_acct === cardAccountId);
        
        if (!transferPayee) {
          console.log(`  Skipped: No transfer payee for ${match.incoming.account}`);
          continue;
        }

        // Step 1: Update the CHECKING transaction to use the transfer payee
        // This converts it from a regular payment to a transfer
        await api.updateTransaction(match.outgoing.id, {
          payee: transferPayee.id
        });
        
        // Step 2: Delete the duplicate on the credit card side
        // The transfer will auto-create the corresponding entry
        await api.deleteTransaction(match.incoming.id);
        
        console.log(`  ✓ Linked: $${Math.abs(match.outgoing.amount).toFixed(2)} on ${match.outgoing.date}`);
      } catch (err) {
        console.error(`  ✗ Error: ${err.message}`);
        results.errors.push({ match, error: err.message });
      }
    }
    
    console.log(`\nLinked ${results.matched.length - results.errors.length} transfer pairs`);
    if (results.errors.length > 0) {
      console.log(`Errors: ${results.errors.length}`);
    }
  }

  if (results.unmatched.length > 0) {
    console.log('\n' + '-'.repeat(60));
    console.log('UNMATCHED TRANSACTIONS (need manual review)');
    console.log('-'.repeat(60));
    
    const unmatchedOut = results.unmatched.filter(u => u.type === 'outgoing');
    const unmatchedIn = results.unmatched.filter(u => u.type === 'incoming');
    
    if (unmatchedOut.length > 0) {
      console.log(`\nOutgoing from checking (${unmatchedOut.length}):`);
      for (const u of unmatchedOut.slice(0, 15)) {
        console.log(`  ${u.date} | $${Math.abs(u.amount).toFixed(2).padStart(9)} | ${u.payee?.slice(0, 45)}`);
      }
      if (unmatchedOut.length > 15) console.log(`  ... and ${unmatchedOut.length - 15} more`);
    }
    
    if (unmatchedIn.length > 0) {
      console.log(`\nIncoming to cards (${unmatchedIn.length}):`);
      for (const u of unmatchedIn.slice(0, 15)) {
        console.log(`  ${u.date} | $${u.amount.toFixed(2).padStart(9)} | ${u.account.slice(0, 20)} | ${u.payee?.slice(0, 25)}`);
      }
      if (unmatchedIn.length > 15) console.log(`  ... and ${unmatchedIn.length - 15} more`);
    }
  }

  await api.shutdown();
  
  return results;
}

// CLI
const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');

if (args.includes('--help')) {
  console.log(`
Link Credit Card Payment Transfers

Usage: node link-transfers.js [options]

Options:
  --apply    Actually link the transfers (default: dry run)
  --help     Show this help

This script finds duplicate credit card payment transactions and links them
as proper transfers between checking and credit card accounts.
  `);
  process.exit(0);
}

linkTransfers(dryRun).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
