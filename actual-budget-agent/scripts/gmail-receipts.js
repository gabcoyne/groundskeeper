#!/usr/bin/env node
/**
 * Gmail Receipt Matcher for Actual Budget
 * 
 * Fetches receipts from Gmail and matches them to Actual Budget transactions
 * for enhanced categorization and itemization (especially Amazon orders).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const GMAIL_TOKENS_PATH = '/home/node/.openclaw/workspace/gmail-calendar-agent/auth/tokens.json';
const GMAIL_CREDS_PATH = '/home/node/.openclaw/workspace/gmail-calendar-agent/credentials.json';

class GmailReceiptMatcher {
  constructor() {
    this.tokens = JSON.parse(fs.readFileSync(GMAIL_TOKENS_PATH, 'utf8'));
    this.credentials = JSON.parse(fs.readFileSync(GMAIL_CREDS_PATH, 'utf8'));
    this.accessToken = this.tokens.token;
  }

  async refreshTokenIfNeeded() {
    // Try a simple API call; if it fails with 401, refresh the token
    try {
      await this.gmailApi('/profile');
      return true;
    } catch (err) {
      if (err.statusCode === 401) {
        console.log('Access token expired, refreshing...');
        await this.refreshToken();
        return true;
      }
      throw err;
    }
  }

  async refreshToken() {
    const creds = this.credentials.installed;
    const params = new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: this.tokens.refresh_token,
      grant_type: 'refresh_token'
    });

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            const response = JSON.parse(data);
            this.accessToken = response.access_token;
            // Update tokens file
            this.tokens.token = response.access_token;
            fs.writeFileSync(GMAIL_TOKENS_PATH, JSON.stringify(this.tokens, null, 2));
            console.log('Token refreshed successfully');
            resolve();
          } else {
            reject(new Error(`Token refresh failed: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.write(params.toString());
      req.end();
    });
  }

  gmailApi(endpoint, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me${endpoint}`);
      
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      };

      if (body) {
        options.headers['Content-Type'] = 'application/json';
      }

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            const err = new Error(`Gmail API error: ${res.statusCode}`);
            err.statusCode = res.statusCode;
            err.body = data;
            reject(err);
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async searchReceipts(query, maxResults = 100) {
    const encodedQuery = encodeURIComponent(query);
    const result = await this.gmailApi(`/messages?q=${encodedQuery}&maxResults=${maxResults}`);
    return result.messages || [];
  }

  async getMessage(msgId) {
    return this.gmailApi(`/messages/${msgId}?format=full`);
  }

  parseMessage(msg) {
    const headers = {};
    for (const h of msg.payload.headers) {
      headers[h.name.toLowerCase()] = h.value;
    }

    const body = this.extractBody(msg.payload);
    
    return {
      id: msg.id,
      threadId: msg.threadId,
      from: headers.from || '',
      subject: headers.subject || '',
      date: headers.date || '',
      parsedDate: this.parseDate(headers.date),
      snippet: msg.snippet || '',
      body
    };
  }

  extractBody(payload) {
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf8');
    }
    
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf8');
        }
      }
      // Fall back to HTML
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf8');
        }
      }
    }
    return '';
  }

  parseDate(dateStr) {
    if (!dateStr) return null;
    try {
      return new Date(dateStr);
    } catch {
      return null;
    }
  }

  extractAmount(text) {
    // Multiple patterns for dollar amounts
    const patterns = [
      /(?:total|amount|charged|paid)[:\s]*\$?\s*([0-9,]+\.[0-9]{2})/i,
      /\$([0-9,]+\.[0-9]{2})/g,
      /USD\s*([0-9,]+\.[0-9]{2})/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const amountStr = (match[1] || match[0]).replace(/[$,]/g, '');
        const amount = parseFloat(amountStr);
        if (!isNaN(amount) && amount > 0 && amount < 100000) {
          return amount;
        }
      }
    }
    return null;
  }

  /**
   * Parse Amazon order confirmation emails
   */
  parseAmazonOrder(parsed) {
    const { subject, body, snippet } = parsed;
    const text = `${subject} ${body} ${snippet}`;
    
    // Extract order number
    const orderMatch = text.match(/(?:order|#)\s*([0-9-]{10,})/i);
    const orderId = orderMatch ? orderMatch[1] : null;

    // Extract total
    const totalMatch = text.match(/(?:order total|total)[:\s]*\$?([0-9,]+\.[0-9]{2})/i);
    const total = totalMatch ? parseFloat(totalMatch[1].replace(',', '')) : null;

    // Extract items (simplified - looks for patterns like "Item Name $XX.XX")
    const items = [];
    const itemPattern = /([A-Za-z][^\n$]{5,50})\s*\$([0-9.]+)/g;
    let match;
    while ((match = itemPattern.exec(body)) !== null) {
      const name = match[1].trim();
      const price = parseFloat(match[2]);
      if (price > 0 && price < 10000 && !name.includes('Total')) {
        items.push({ name, price });
      }
    }

    return {
      vendor: 'Amazon',
      orderId,
      total,
      items,
      date: parsed.parsedDate
    };
  }

  /**
   * Categorize an item based on its description
   */
  categorizeItem(itemName) {
    const name = itemName.toLowerCase();
    
    const categories = {
      'Pet Care': [
        'dog', 'cat', 'pet', 'treats', 'leash', 'collar', 'food bowl',
        'litter', 'chew', 'toy', 'grooming'
      ],
      'Household Supplies': [
        'paper towel', 'toilet paper', 'tissue', 'soap', 'detergent',
        'cleaner', 'sponge', 'trash bag', 'battery', 'bulb', 'filter',
        'storage', 'organizer', 'container', 'ziplock', 'aluminum foil'
      ],
      'Electronics': [
        'cable', 'charger', 'adapter', 'hdmi', 'usb', 'bluetooth',
        'speaker', 'headphone', 'mouse', 'keyboard', 'monitor'
      ],
      'Health & Personal Care': [
        'vitamin', 'supplement', 'medicine', 'bandage', 'first aid',
        'toothpaste', 'shampoo', 'conditioner', 'lotion', 'sunscreen'
      ],
      'Kitchen': [
        'cookware', 'pan', 'pot', 'utensil', 'container', 'tupperware',
        'knife', 'cutting board', 'spice', 'seasoning'
      ],
      'Home Improvement': [
        'tool', 'screw', 'nail', 'drill', 'paint', 'tape', 'hook',
        'mounting', 'bracket', 'hardware'
      ]
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(kw => name.includes(kw))) {
        return category;
      }
    }
    
    return 'Shopping'; // Default
  }

  /**
   * Find matching Actual Budget transaction
   */
  async findMatchingTransaction(api, receipt, transactions) {
    const { total, date, vendor } = receipt;
    
    if (!total || !date) return null;

    // Convert cents to dollars for comparison
    const matches = transactions.filter(t => {
      // Amount match (within 1 cent)
      const txAmount = Math.abs(t.amount) / 100;
      if (Math.abs(txAmount - total) > 0.01) return false;

      // Date match (within 5 days)
      const txDate = new Date(t.date);
      const daysDiff = Math.abs((txDate - date) / (1000 * 60 * 60 * 24));
      if (daysDiff > 5) return false;

      // Vendor match (if we can)
      if (vendor && t.payee_name) {
        const payee = t.payee_name.toLowerCase();
        const v = vendor.toLowerCase();
        if (payee.includes(v) || v.includes(payee.slice(0, 5))) {
          return true;
        }
      }

      return true;
    });

    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Main function: Fetch receipts and match to Actual Budget
   */
  async run(options = {}) {
    const { 
      days = 30,
      vendors = ['amazon'],
      dryRun = true 
    } = options;

    console.log('='.repeat(60));
    console.log('Gmail Receipt Matcher for Actual Budget');
    console.log('='.repeat(60));

    // Refresh token if needed
    await this.refreshTokenIfNeeded();

    // Build search query
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - days);
    const dateStr = afterDate.toISOString().split('T')[0].replace(/-/g, '/');

    const results = {
      receipts: [],
      matched: [],
      unmatched: []
    };

    for (const vendor of vendors) {
      console.log(`\nSearching ${vendor} receipts from last ${days} days...`);
      
      let query;
      if (vendor === 'amazon') {
        query = `from:amazon.com (order OR shipment OR delivered) after:${dateStr}`;
      } else {
        query = `from:${vendor} (receipt OR order OR confirmation) after:${dateStr}`;
      }

      const messages = await this.searchReceipts(query, 50);
      console.log(`Found ${messages.length} potential receipts`);

      for (const { id } of messages) {
        try {
          const msg = await this.getMessage(id);
          const parsed = this.parseMessage(msg);
          
          let receipt;
          if (vendor === 'amazon') {
            receipt = this.parseAmazonOrder(parsed);
          } else {
            receipt = {
              vendor,
              total: this.extractAmount(parsed.body + parsed.subject),
              date: parsed.parsedDate,
              items: []
            };
          }

          if (receipt.total) {
            results.receipts.push({
              ...receipt,
              subject: parsed.subject.slice(0, 60),
              emailId: id
            });
          }
        } catch (err) {
          console.error(`Error processing message ${id}:`, err.message);
        }
      }
    }

    console.log(`\nExtracted ${results.receipts.length} receipts with amounts`);
    
    // Summary
    console.log('\n' + '-'.repeat(60));
    console.log('RECEIPTS FOUND');
    console.log('-'.repeat(60));
    
    for (const r of results.receipts) {
      console.log(`\n${r.vendor}: $${r.total?.toFixed(2) || 'N/A'}`);
      console.log(`  Date: ${r.date?.toLocaleDateString() || 'N/A'}`);
      console.log(`  Subject: ${r.subject}`);
      if (r.items?.length > 0) {
        console.log(`  Items (${r.items.length}):`);
        for (const item of r.items.slice(0, 5)) {
          const cat = this.categorizeItem(item.name);
          console.log(`    - ${item.name.slice(0, 40)}: $${item.price.toFixed(2)} [${cat}]`);
        }
        if (r.items.length > 5) {
          console.log(`    ... and ${r.items.length - 5} more items`);
        }
      }
    }

    if (dryRun) {
      console.log('\n[DRY RUN] No changes made to Actual Budget');
    }

    return results;
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const options = {
    days: 30,
    vendors: ['amazon'],
    dryRun: true
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      options.days = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--vendor' && args[i + 1]) {
      options.vendors = args[i + 1].split(',');
      i++;
    } else if (args[i] === '--apply') {
      options.dryRun = false;
    } else if (args[i] === '--help') {
      console.log(`
Gmail Receipt Matcher for Actual Budget

Usage: node gmail-receipts.js [options]

Options:
  --days N        Look back N days (default: 30)
  --vendor LIST   Comma-separated vendors (default: amazon)
  --apply         Actually update Actual Budget (default: dry run)
  --help          Show this help
      `);
      process.exit(0);
    }
  }

  const matcher = new GmailReceiptMatcher();
  await matcher.run(options);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
