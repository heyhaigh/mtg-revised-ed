#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// 500ms between requests to avoid TCGplayer rate limits
const RATE_LIMIT_MS = 500;

// Pass --force to re-fetch all prices (default: only fetch missing)
const forceAll = process.argv.includes('--force');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 403) {
          reject(new Error('RATE_LIMITED'));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPrices() {
  const cardsPath = path.join(__dirname, '..', 'data', 'cards.json');
  const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf-8'));

  const toFetch = cards.filter(c => {
    if (!c.tcgplayer_id) return false;
    if (forceAll) return true;
    return !c.price_median; // Only fetch missing
  });

  console.log(`TCGplayer price fetch: ${toFetch.length} cards to update (${cards.length} total)`);
  if (!forceAll) console.log('  (use --force to re-fetch all prices)\n');

  let fetched = 0;
  let failed = 0;
  let rateLimited = false;

  for (const card of toFetch) {
    if (rateLimited) {
      failed++;
      continue;
    }

    const url = `https://mpapi.tcgplayer.com/v2/product/${card.tcgplayer_id}/pricepoints`;

    try {
      const data = await fetchJSON(url);
      const normal = data.find(p => p.printingType === 'Normal');
      if (normal) {
        card.price_market = normal.marketPrice ? String(normal.marketPrice) : card.price_usd;
        card.price_median = normal.listedMedianPrice ? String(normal.listedMedianPrice) : null;
      }
      fetched++;
      if (fetched % 10 === 0) {
        process.stdout.write(`  ${fetched}/${toFetch.length} fetched...\r`);
      }
    } catch (err) {
      if (err.message === 'RATE_LIMITED') {
        console.log(`\n  Rate limited after ${fetched} requests. Saving progress...`);
        rateLimited = true;
        failed++;
      } else {
        failed++;
      }
    }

    await sleep(RATE_LIMIT_MS);
  }

  // Ensure all cards have price_market fallback
  for (const card of cards) {
    if (!card.price_market) card.price_market = card.price_usd || null;
  }

  console.log(`\n  Fetched: ${fetched}, Failed: ${failed}`);

  fs.writeFileSync(cardsPath, JSON.stringify(cards, null, 2));
  console.log(`Done! Prices saved to ${cardsPath}`);

  if (rateLimited) {
    console.log('\nTip: Wait a few minutes and re-run to fetch remaining prices.');
  }
}

fetchPrices().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
