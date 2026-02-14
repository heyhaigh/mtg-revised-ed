# MTG Revised Edition Tracker - Session Learnings

## Scryfall API

### Endpoint & Pagination
- Search endpoint: `https://api.scryfall.com/cards/search?q=set:3ed&order=name&page=1`
- Returns max 175 cards per page, use `has_more` flag for pagination
- Rate limit: 50-100ms between requests (we use 150ms to be safe)
- Always include `User-Agent` header

### Card Count Discrepancy
- Revised Edition is listed as 306 cards, but Scryfall returns **296**
- Scryfall deduplicates basic land variants (e.g., multiple Plains arts count as one entry)
- Not a bug — just how Scryfall indexes the set

### Price Fields Available
| Field | Description |
|-------|-------------|
| `prices.usd` | TCGplayer Market Price (algorithm-derived average of recent sales) |
| `prices.usd_foil` | Foil price (null for Revised — no foils existed) |
| `prices.usd_etched` | Etched foil (null for Revised) |
| `prices.eur` | Cardmarket price in EUR |
| `prices.tix` | MTGO tix price |

**Key insight**: `prices.usd` is NOT a NM-specific price. It's TCGplayer's algorithmic "Market Price" weighted across all conditions.

### Useful Fields for Pricing
- `tcgplayer_id` — numeric product ID, usable for TCGplayer API calls
- `purchase_uris.tcgplayer` — affiliate link to TCGplayer product page
- `cardmarket_id` — European marketplace ID

---

## TCGplayer Pricepoints API

### Working Public Endpoint
```
GET https://mpapi.tcgplayer.com/v2/product/{tcgplayer_id}/pricepoints
```

Returns:
```json
[
  {
    "printingType": "Normal",
    "marketPrice": 13.66,
    "buylistMarketPrice": null,
    "listedMedianPrice": 13.59
  },
  {
    "printingType": "Foil",
    "marketPrice": null,
    "buylistMarketPrice": null,
    "listedMedianPrice": null
  }
]
```

### Price Definitions
- **marketPrice** — Algorithm-derived average based on recent completed sales (same as Scryfall's `prices.usd`)
- **listedMedianPrice** — Median price of all currently active listings
- **buylistMarketPrice** — What stores will pay to buy from you (usually null for older sets)

### Rate Limits
- ~150 requests before getting 403 Forbidden at 120ms intervals
- **500ms delay** is safer for batch fetching
- After hitting 403, need to wait ~15+ minutes before retrying
- Script should detect 403 and stop early to save progress
- Incremental fetching (skip cards that already have prices) avoids re-triggering limits

### What's NOT Available (Without Auth)
- Condition-specific pricing (NM, LP, MP, HP, DMG)
- Individual listing data
- Price history
- The `/v2/product/{id}/listings` endpoint returns 404 without auth
- The `/v2/product/{id}/details` endpoint also returns empty

### CORS
- The `mpapi.tcgplayer.com` endpoint does **not** return CORS headers
- Cannot fetch from client-side JavaScript on a different origin
- Price fetching must be done server-side or via Node scripts

---

## Card Image Display

### The Letterboxing Problem
Using `object-fit: contain` with a fixed `aspect-ratio` on card images causes visible empty space (letterboxing) when the container aspect ratio doesn't exactly match the image:

```css
/* BAD — creates gray padding above/below image */
.card-img {
  width: 100%;
  aspect-ratio: 488 / 680;
  object-fit: contain;
  background: #f0f0f0;
}
```

### The Fix
Let the image determine its own height naturally:

```css
/* GOOD — image fills container tightly */
.card-img {
  width: 100%;
  height: auto;
  display: block;
}
```

The `width="488" height="680"` HTML attributes still provide aspect ratio hints for layout shift prevention, but `height: auto` in CSS overrides the fixed height.

### Scryfall Image Sizes
| Size | Dimensions | Use Case |
|------|-----------|----------|
| `image_small` | 146 × 204 | Tiny thumbnails |
| `image_normal` | 488 × 680 | Card grid display |
| `image_large` | 672 × 936 | Detail/zoom view |

Use `image_normal` for grid cards — `image_small` is too blurry for anything beyond tiny icons.

---

## Detail Panel Layout

### Mobile vs Desktop Card Art
- Mobile: Stack image above info, image at full panel width (`max-width: 420px`, centered)
- Desktop (768px+): Side-by-side flex with image at `280px` width
- Original 160px was too small — 3x increase to ~420-480px makes the card art the focal point

### Layout Pattern
```css
/* Mobile: stacked */
.detail-content {
  display: flex;
  flex-direction: column;
}
.detail-image {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
}

/* Desktop: side-by-side */
@media (min-width: 768px) {
  .detail-content { flex-direction: row; }
  .detail-image { width: 280px; flex-shrink: 0; margin: 0; }
}
```

---

## Multi-Select Collection Flow

### UX Pattern
1. Hover over card → checkbox appears (top-right, `opacity: 0` → `1` on hover)
2. Click checkbox → card enters "selected" state (green border on checkbox)
3. Floating bottom bar appears with count + "Cancel" / "Collect" buttons
4. Click "Collect" → all selected cards marked as collected, badges appear
5. Escape key clears selection

### Touch Device Consideration
```css
@media (hover: none) {
  .card-select-btn { opacity: 0.7; } /* Always visible on touch */
}
```

---

## Static Site Pricing Strategy

### Current Approach
- Prices baked into `data/cards.json` via Node scripts
- `fetch-cards.js` — pulls card data + Scryfall market price + tcgplayer_id
- `fetch-prices.js` — enriches with TCGplayer market + median prices
- Run scripts locally, commit updated JSON, push to GitHub Pages

### Refresh Cadence
- Card data rarely changes (run `fetch-cards.js` occasionally)
- Prices shift daily — run `fetch-prices.js` every 4-12 hours
- Script is incremental: only fetches cards missing prices unless `--force` flag used

### Future Options for Auto-Refresh
- GitHub Actions cron job running `fetch-prices.js` + auto-commit
- Client-side fetch not viable due to CORS restrictions on TCGplayer API

---

## Project Architecture

```
mtg-revised-ed/
├── index.html              # Single page app
├── css/styles.css          # Light theme, mobile-first responsive
├── js/app.js               # IIFE — rendering, filtering, localStorage, multi-select
├── data/cards.json         # 296 cards with prices (pre-fetched)
└── scripts/
    ├── fetch-cards.js      # Scryfall API → cards.json
    └── fetch-prices.js     # TCGplayer API → enriches cards.json prices
```

### localStorage Schema
Key: `mtg-revised-collection`
```json
{
  "card-uuid": {
    "collected": true,
    "condition": "NM",
    "quantity": 1,
    "notes": "Slight edge wear"
  }
}
```

### cards.json Card Shape
```json
{
  "id": "uuid",
  "name": "Armageddon",
  "collector_number": "2",
  "type_line": "Sorcery",
  "mana_cost": "{3}{W}",
  "rarity": "rare",
  "colors": ["W"],
  "artist": "Jesper Myrfors",
  "image_normal": "https://cards.scryfall.io/normal/front/.../uuid.jpg",
  "image_small": "https://cards.scryfall.io/small/front/.../uuid.jpg",
  "price_usd": "13.66",
  "tcgplayer_id": 1334,
  "price_market": "13.66",
  "price_median": "13.59"
}
```
