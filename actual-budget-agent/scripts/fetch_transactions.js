/**
 * Fetch transactions from Actual Budget
 * 
 * Uses the official @actual-app/api package to connect and query.
 */

const api = require('@actual-app/api');

const CONFIG = {
  serverURL: 'http://actual-budget:5006',
  password: 'RGR!vwy*hay.vgm0dpg',
  syncId: '9b174808-0fe7-4d4d-9b09-7573d3caf074',
  budgetId: '51b5bac4-bacd-4fa6-9043-1b5c459164eb',
  dataDir: '/tmp/actual-data',
};

async function main() {
  try {
    // Initialize the API
    await api.init({
      serverURL: CONFIG.serverURL,
      password: CONFIG.password,
      dataDir: CONFIG.dataDir,
    });

    // Download the budget
    console.error('Downloading budget...');
    await api.downloadBudget(CONFIG.syncId);

    // Get accounts
    const accounts = await api.getAccounts();
    console.error(`Found ${accounts.length} accounts`);

    // Calculate date range (last 12 months)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 12);
    
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    console.error(`Fetching transactions from ${startStr} to ${endStr}`);

    // Get all transactions for last 12 months
    const transactions = await api.getTransactions(
      undefined, // all accounts
      startStr,
      endStr
    );

    console.error(`Found ${transactions.length} transactions`);

    // Get categories for mapping
    const categories = await api.getCategories();
    const categoryMap = {};
    for (const cat of categories) {
      categoryMap[cat.id] = cat.name;
      if (cat.group_id) {
        // Try to get group name
        const group = categories.find(c => c.id === cat.group_id && c.is_income !== undefined);
        if (group) {
          categoryMap[cat.id] = `${group.name}:${cat.name}`;
        }
      }
    }

    // Get payees for mapping
    const payees = await api.getPayees();
    const payeeMap = {};
    for (const p of payees) {
      payeeMap[p.id] = p.name;
    }

    // Output transactions as JSON
    const output = transactions.map(t => ({
      id: t.id,
      date: t.date,
      amount: t.amount, // in cents
      payee: payeeMap[t.payee] || t.payee,
      payee_id: t.payee,
      category: categoryMap[t.category] || t.category,
      category_id: t.category,
      account: t.account,
      notes: t.notes,
      cleared: t.cleared,
      reconciled: t.reconciled,
    }));

    // Output to stdout as JSON
    console.log(JSON.stringify({
      status: 'ok',
      count: output.length,
      start_date: startStr,
      end_date: endStr,
      accounts: accounts.map(a => ({ id: a.id, name: a.name, type: a.type })),
      categories: categories.map(c => ({ id: c.id, name: c.name, group: c.group_id })),
      transactions: output,
    }, null, 2));

    await api.shutdown();
  } catch (error) {
    console.error('Error:', error.message);
    console.log(JSON.stringify({ status: 'error', error: error.message }));
    process.exit(1);
  }
}

main();
