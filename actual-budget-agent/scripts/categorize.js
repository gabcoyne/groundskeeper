const api = require('@actual-app/api');

// Category mapping rules - payee patterns to category names
const CATEGORY_RULES = {
  // ===== INCOME =====
  'Income': [
    /payroll/i, /prefect technolo/i, /direct deposit/i, /salary/i,
    /federal reserve wire/i, /dividend/i, /interest payment/i,
    /deposit/i, /distribution/i, /interest paid/i
  ],

  // ===== FOOD & DINING =====
  'Dining Out': [
    /portillo/i, /simon tacos/i, /barca/i, /doordash/i, /uber eats/i,
    /grubhub/i, /fry the coop/i, /ruk sushi/i, /breakfast house/i,
    /brgrbelly/i, /bryn mar breakfast/i, /starbucks/i, /dunkin/i,
    /mcdonald/i, /chipotle/i, /lifecafe/i, /restaurant/i, /cafe/i,
    /coffee/i, /airship coffee/i, /bad coffee/i, /alcoholics/i,
    /bar\b/i, /tavern/i, /pub\b/i, /bowl\b/i, /diversey river bowl/i,
    /seamless/i, /galit/i, /sepia/i, /smoque bbq/i, /speakeasyle/i,
    /original pancake/i, /three tarts/i, /franks pizzeria/i, /aurora/i,
    /s\s*k\s*y\s*lincoln/i, /milk street/i
  ],
  'Groceries': [
    /jewel.?osco/i, /aldi/i, /costco/i, /wild fork/i, /target/i,
    /whole foods/i, /trader joe/i, /mariano/i, /walmart/i, /safeway/i,
    /kroger/i, /fresh market/i, /fresh farms/i
  ],

  // ===== TRANSPORTATION =====
  'Gas & Fuel': [
    /\bbp\b/i, /shell/i, /exxon/i, /mobil/i, /chevron/i, /gas station/i,
    /speedway/i, /marathon/i, /citgo/i
  ],
  'Auto & Transport': [
    /uber trip/i, /uber\b/i, /lyft/i, /car wash/i, /lawrence express/i,
    /genesis/i, /bluelink/i, /hyundai/i, /parking/i, /chipay/i,
    /car care auto/i, /genesis fi/i, /spothero/i, /park chicago/i,
    /ventra/i, /superior collision/i
  ],

  // ===== HOUSING & UTILITIES =====
  'Utilities': [
    /comed/i, /peoples gas/i, /nicor/i, /at&t/i, /comcast/i, /xfinity/i,
    /verizon/i, /t-mobile/i, /electric/i, /water bill/i
  ],
  'Home & Garden': [
    /mcmaster.?carr/i, /crafty beaver/i, /home depot/i, /lowes/i,
    /ace hardware/i, /menards/i, /crate.?barrel/i, /anthropologie/i,
    /got.?junk/i, /celeste.*flower/i, /terracotto/i
  ],

  // ===== HEALTH & WELLNESS =====
  'Healthcare': [
    /hospital/i, /northshore/i, /nshore/i, /dental/i, /webster dental/i,
    /pharmacy/i, /cvs/i, /walgreens/i, /amazon pharmacy/i, /doctor/i,
    /medical/i, /pacific life/i, /northwestern mutual/i, /mychart/i
  ],
  'Fitness': [
    /lifetime fitness/i, /hard core\s*iron/i, /peloton/i, /gym/i,
    /fitness/i, /crossfit/i, /planet fitness/i, /equinox/i, /yoga/i
  ],

  // ===== PET =====
  'Pet Care': [
    /trupanion/i, /pet service/i, /portage park anim/i, /friendly paws/i,
    /veterinar/i, /petco/i, /petsmart/i, /chewy/i, /pet food/i, /grooming/i
  ],

  // ===== SUBSCRIPTIONS & DIGITAL =====
  'Subscriptions': [
    /spotify/i, /netflix/i, /hulu/i, /disney/i, /hbo/i, /apple music/i,
    /youtube/i, /amazon prime/i, /audible/i, /kindle/i, /newsgroup ninja/i,
    /soundcloud/i, /nts live/i, /subscribestar/i, /patreon/i, /substack/i,
    /wordpress/i, /porkbun/i, /fox digital/i, /wikipedia/i, /steam\b/i,
    /ticketweb/i, /true panther/i, /jackhafford/i, /naturalcycles/i
  ],
  'Software & Cloud': [
    /google cloud/i, /google workspace/i, /google work/i, /google one/i,
    /google\b/i, /aws/i, /azure/i, /digital ocean/i,
    /quickbooks/i, /intuit/i, /simplefin/i, /github/i, /dropbox/i,
    /1password/i, /lastpass/i, /notion/i, /slack/i, /zoom/i,
    /openai/i, /webflow/i, /namecheap/i, /shippo/i, /nest\b/i
  ],

  // ===== INSURANCE =====
  'Insurance': [
    /cinti insurance/i, /next insurance/i, /state farm/i, /allstate/i,
    /geico/i, /progressive/i, /insurance/i
  ],

  // ===== TRAVEL =====
  'Travel': [
    /airbnb/i, /vrbo/i, /hotel/i, /marriott/i, /hilton/i, /hyatt/i,
    /airline/i, /united air/i, /american air/i, /delta/i, /southwest/i,
    /expedia/i, /booking\.com/i, /going\.com/i, /uplift/i
  ],

  // ===== SHOPPING =====
  'Shopping': [
    /amazon(?! prime| pharmacy)/i, /ebay/i, /etsy/i, /best buy/i,
    /apple\.com/i, /nordstrom/i, /macy/i, /hoffman tactical/i,
    /j\s*crew/i, /lands.*end/i, /nike/i, /uniqlo/i, /todd snyder/i,
    /sergio tacchini/i, /glerups/i, /mildblend/i, /goodwill/i,
    /paper source/i, /michaels/i, /rosalia store/i, /rifle\b/i
  ],

  // ===== TRANSFERS & PAYMENTS =====
  'Transfers': [
    /zelle/i, /venmo/i, /paypal/i, /transfer/i, /online transfer/i,
    /ally bank/i, /betterment/i, /schwab/i, /crosscountry/i
  ],
  'Credit Card Payment': [
    /chase credit card/i, /apple credit card/i, /amex/i, /payment\b/i
  ],

  // ===== FEES & TAXES =====
  'Fees': [
    /wire fee/i, /\bfee\b/i, /service charge/i, /atm fee/i
  ],
  'Taxes & Gov': [
    /city of chicago/i, /irs\b/i, /illinois/i, /tax\b/i,
    /u\.?s\.?\s*small business/i, /sba\b/i
  ],

  // ===== BUSINESS =====
  'Business Expense': [
    /ln cookcoitps/i, /upgrade.*inc/i
  ],

  // ===== PERSONAL =====
  'Personal Care': [
    /portage gentlemen/i, /barber/i, /salon/i, /spa\b/i, /massage/i,
    /exfolia/i
  ],
  'Gifts & Donations': [
    /check #/i
  ],

  // ===== CATCH-ALL =====
  'Uncategorized': []
};

// Desired category structure - will create these if they don't exist
const CATEGORY_STRUCTURE = {
  'Income': ['Income'],
  'Food & Dining': ['Dining Out', 'Groceries'],
  'Transportation': ['Gas & Fuel', 'Auto & Transport'],
  'Housing': ['Utilities', 'Home & Garden'],
  'Health': ['Healthcare', 'Fitness'],
  'Lifestyle': ['Pet Care', 'Personal Care', 'Shopping'],
  'Digital': ['Subscriptions', 'Software & Cloud'],
  'Financial': ['Insurance', 'Transfers', 'Credit Card Payment', 'Fees', 'Taxes & Gov'],
  'Other': ['Travel', 'Business Expense', 'Gifts & Donations', 'Uncategorized']
};

async function main() {
  console.log('🔄 Connecting to Actual Budget...');
  await api.init({ 
    dataDir: './actual-data', 
    serverURL: 'http://actual-budget:5006', 
    password: 'RGR!vwy*hay.vgm0dpg' 
  });
  await api.downloadBudget('9b174808-0fe7-4d4d-9b09-7573d3caf074', { password: 'RGR!vwy*hay.vgm0dpg' });
  
  // Build payee lookup
  const payees = await api.getPayees();
  const payeeMap = {};
  payees.forEach(p => payeeMap[p.id] = p.name);
  
  // Get existing categories
  const existingCategories = await api.getCategories();
  const existingGroups = await api.getCategoryGroups();
  
  console.log('\n📂 Existing categories:', existingCategories.length);
  console.log('📁 Existing groups:', existingGroups.length);
  
  // Create category lookup
  const categoryByName = {};
  existingCategories.forEach(c => categoryByName[c.name] = c.id);
  
  const groupByName = {};
  existingGroups.forEach(g => groupByName[g.name] = g.id);
  
  // Create missing category groups and categories
  console.log('\n🏗️  Setting up category structure...');
  for (const [groupName, categories] of Object.entries(CATEGORY_STRUCTURE)) {
    let groupId = groupByName[groupName];
    if (!groupId) {
      console.log(`  Creating group: ${groupName}`);
      groupId = await api.createCategoryGroup({ name: groupName });
      groupByName[groupName] = groupId;
    }
    
    for (const catName of categories) {
      if (!categoryByName[catName]) {
        console.log(`    Creating category: ${catName}`);
        const catId = await api.createCategory({ name: catName, group_id: groupId });
        categoryByName[catName] = catId;
      }
    }
  }
  
  // Function to categorize a payee name
  function categorizePayee(payeeName) {
    if (!payeeName) return 'Uncategorized';
    
    for (const [category, patterns] of Object.entries(CATEGORY_RULES)) {
      for (const pattern of patterns) {
        if (pattern.test(payeeName)) {
          return category;
        }
      }
    }
    return 'Uncategorized';
  }
  
  // Get all accounts
  const accounts = await api.getAccounts();
  
  let totalUpdated = 0;
  let totalSkipped = 0;
  let uncategorizedPayees = new Set();
  
  console.log('\n📊 Processing transactions...');
  
  for (const account of accounts) {
    if (account.closed) continue;
    
    // Skip investment/retirement accounts
    if (/retirement|401k|ira|investing|self-directed/i.test(account.name)) {
      console.log(`  Skipping investment account: ${account.name}`);
      continue;
    }
    
    const txns = await api.getTransactions(account.id, '2024-01-01', '2026-12-31');
    let accountUpdated = 0;
    
    for (const txn of txns) {
      // Skip already categorized
      if (txn.category) {
        totalSkipped++;
        continue;
      }
      
      // Skip transfers (split transactions, internal moves)
      if (txn.transfer_id) {
        totalSkipped++;
        continue;
      }
      
      const payeeName = payeeMap[txn.payee] || '';
      const categoryName = categorizePayee(payeeName);
      const categoryId = categoryByName[categoryName];
      
      if (categoryName === 'Uncategorized' && payeeName) {
        uncategorizedPayees.add(payeeName);
      }
      
      if (categoryId && categoryId !== txn.category) {
        await api.updateTransaction(txn.id, { category: categoryId });
        accountUpdated++;
        totalUpdated++;
      }
    }
    
    if (accountUpdated > 0) {
      console.log(`  ${account.name}: ${accountUpdated} transactions categorized`);
    }
  }
  
  console.log('\n✅ Categorization complete!');
  console.log(`   Updated: ${totalUpdated}`);
  console.log(`   Skipped (already categorized or transfers): ${totalSkipped}`);
  
  if (uncategorizedPayees.size > 0) {
    console.log('\n⚠️  Payees that couldn\'t be auto-categorized:');
    Array.from(uncategorizedPayees).sort().forEach(p => console.log(`   - ${p}`));
  }
  
  await api.shutdown();
}

main().catch(e => { 
  console.error('❌ Error:', e); 
  process.exit(1); 
});
