#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const SEARCH_URL = 'https://api.scryfall.com/cards/search?q=set:3ed&order=name&page=';
const RATE_LIMIT_MS = 150; // Scryfall asks for 50-100ms between requests

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'MTGRevisedTracker/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }
        resolve(JSON.parse(data));
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllCards() {
  const allCards = [];
  let page = 1;
  let hasMore = true;

  console.log('Fetching Revised Edition (3ED) cards from Scryfall...\n');

  while (hasMore) {
    const url = SEARCH_URL + page;
    console.log(`  Page ${page}: ${url}`);

    const response = await fetch(url);
    const cards = response.data.map(card => ({
      id: card.id,
      name: card.name,
      collector_number: card.collector_number,
      type_line: card.type_line,
      mana_cost: card.mana_cost || '',
      rarity: card.rarity,
      colors: card.colors || [],
      artist: card.artist,
      image_normal: card.image_uris?.normal || '',
      image_small: card.image_uris?.small || '',
      price_usd: card.prices?.usd || null,
      tcgplayer_id: card.tcgplayer_id || null,
    }));

    allCards.push(...cards);
    console.log(`  -> Got ${cards.length} cards (total: ${allCards.length})`);

    hasMore = response.has_more;
    if (hasMore) {
      await sleep(RATE_LIMIT_MS);
      page++;
    }
  }

  // Sort by collector number numerically
  allCards.sort((a, b) => {
    const numA = parseInt(a.collector_number, 10);
    const numB = parseInt(b.collector_number, 10);
    return numA - numB;
  });

  const outPath = path.join(__dirname, '..', 'data', 'cards.json');
  fs.writeFileSync(outPath, JSON.stringify(allCards, null, 2));
  console.log(`\nDone! ${allCards.length} cards saved to ${outPath}`);
}

fetchAllCards().catch(err => {
  console.error('Failed to fetch cards:', err.message);
  process.exit(1);
});
