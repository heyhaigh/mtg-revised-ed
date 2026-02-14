(function () {
  'use strict';

  const STORAGE_KEY = 'mtg-revised-collection';
  let cards = [];
  let collection = {};
  let activeCardId = null;
  let selectedIds = new Set();

  // DOM refs
  const grid = document.getElementById('cardGrid');
  const collectedCount = document.getElementById('collectedCount');
  const totalCount = document.getElementById('totalCount');
  const progressFill = document.getElementById('progressFill');
  const totalValue = document.getElementById('totalValue');
  const avgPrice = document.getElementById('avgPrice');
  const setTotal = document.getElementById('setTotal');
  const searchInput = document.getElementById('searchInput');
  const colorFilter = document.getElementById('colorFilter');
  const rarityFilter = document.getElementById('rarityFilter');
  const collectedFilter = document.getElementById('collectedFilter');
  const priceSort = document.getElementById('priceSort');

  // Collect bar refs
  const collectBar = document.getElementById('collectBar');
  const selectedCountEl = document.getElementById('selectedCount');
  const collectSelectedBtn = document.getElementById('collectSelected');
  const cancelSelectBtn = document.getElementById('cancelSelect');

  // Detail panel refs
  const overlay = document.getElementById('detailOverlay');
  const detailImage = document.getElementById('detailImage');
  const detailName = document.getElementById('detailName');
  const detailType = document.getElementById('detailType');
  const detailRarity = document.getElementById('detailRarity');
  const detailArtist = document.getElementById('detailArtist');
  const detailPrice = document.getElementById('detailPrice');
  const detailCollected = document.getElementById('detailCollected');
  const detailCondition = document.getElementById('detailCondition');
  const detailNotes = document.getElementById('detailNotes');
  const qtyValue = document.getElementById('qtyValue');
  const qtyMinus = document.getElementById('qtyMinus');
  const qtyPlus = document.getElementById('qtyPlus');
  const detailClose = document.getElementById('detailClose');

  // Collection persistence
  function loadCollection() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) collection = JSON.parse(raw);
    } catch { collection = {}; }
  }

  function saveCollection() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
  }

  function getCardData(id) {
    if (!collection[id]) {
      collection[id] = { collected: false, condition: 'NM', quantity: 1, notes: '' };
    }
    return collection[id];
  }

  // Filtering
  function matchesColor(card, filter) {
    if (!filter) return true;
    if (filter === 'M') return card.colors.length > 1;
    if (filter === 'C') return card.colors.length === 0 && !card.type_line.includes('Land');
    if (filter === 'L') return card.type_line.includes('Land');
    return card.colors.length === 1 && card.colors[0] === filter;
  }

  function getFilteredCards() {
    const search = searchInput.value.toLowerCase().trim();
    const color = colorFilter.value;
    const rarity = rarityFilter.value;
    const status = collectedFilter.value;

    const filtered = cards.filter(card => {
      if (search && !card.name.toLowerCase().includes(search)) return false;
      if (!matchesColor(card, color)) return false;
      if (rarity && card.rarity !== rarity) return false;
      if (status === 'collected' && !getCardData(card.id).collected) return false;
      if (status === 'missing' && getCardData(card.id).collected) return false;
      return true;
    });

    const sort = priceSort.value;
    if (sort) {
      filtered.sort((a, b) => {
        const pa = parseFloat(a.price_market || a.price_usd) || 0;
        const pb = parseFloat(b.price_market || b.price_usd) || 0;
        return sort === 'low' ? pa - pb : pb - pa;
      });
    }

    return filtered;
  }

  // Format price
  function fmtPrice(val) {
    if (!val) return '--';
    return '$' + parseFloat(val).toFixed(2);
  }

  // Rendering
  function renderGrid() {
    const filtered = getFilteredCards();
    grid.innerHTML = '';

    filtered.forEach(card => {
      const data = getCardData(card.id);
      const isSelected = selectedIds.has(card.id);
      const el = document.createElement('div');
      el.className = 'card-item'
        + (data.collected ? ' collected' : '')
        + (isSelected ? ' selected' : '');
      el.dataset.id = card.id;

      const marketPrice = card.price_market || card.price_usd;
      const medianPrice = card.price_median;

      el.innerHTML = `
        <div class="card-img-wrap">
          <img class="card-img" src="${card.image_normal}" alt="${card.name}" loading="lazy" width="488" height="680">
          <div class="card-select-btn" data-action="select">${isSelected ? '&#10003;' : ''}</div>
          <div class="card-collected-badge">&#10003;</div>
        </div>
        <div class="card-info">
          <div class="card-info-name" title="${card.name}">${card.name}</div>
          <div class="card-info-type">${card.type_line}</div>
          <div class="card-info-prices">
            <div class="card-price-line">
              <span class="price-label">Market</span>
              <span class="price-value">${fmtPrice(marketPrice)}</span>
            </div>
            <div class="card-price-line">
              <span class="price-label">Median</span>
              <span class="price-value">${fmtPrice(medianPrice)}</span>
            </div>
          </div>
        </div>
      `;

      // Select button click (stop propagation so it doesn't open detail)
      const selectBtn = el.querySelector('.card-select-btn');
      selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSelect(card.id);
      });

      // Card body click opens detail
      el.addEventListener('click', () => openDetail(card.id));
      grid.appendChild(el);
    });
  }

  // Multi-select
  function toggleSelect(id) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
    updateSelectUI(id);
    updateCollectBar();
  }

  function updateSelectUI(id) {
    const el = grid.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    const isSelected = selectedIds.has(id);
    el.classList.toggle('selected', isSelected);
    el.querySelector('.card-select-btn').innerHTML = isSelected ? '&#10003;' : '';
  }

  function updateCollectBar() {
    const count = selectedIds.size;
    selectedCountEl.textContent = count;
    collectBar.classList.toggle('visible', count > 0);
  }

  function clearSelection() {
    selectedIds.forEach(id => {
      const el = grid.querySelector(`[data-id="${id}"]`);
      if (el) {
        el.classList.remove('selected');
        el.querySelector('.card-select-btn').innerHTML = '';
      }
    });
    selectedIds.clear();
    updateCollectBar();
  }

  function collectSelectedCards() {
    selectedIds.forEach(id => {
      const data = getCardData(id);
      data.collected = true;
      // Update grid item
      const el = grid.querySelector(`[data-id="${id}"]`);
      if (el) el.classList.add('collected');
    });
    saveCollection();
    updateStats();
    clearSelection();
  }

  // Collect bar events
  collectSelectedBtn.addEventListener('click', collectSelectedCards);
  cancelSelectBtn.addEventListener('click', clearSelection);

  // Stats
  function updateStats() {
    let count = 0;
    let value = 0;
    let setSum = 0;

    cards.forEach(card => {
      const price = parseFloat(card.price_market || card.price_usd) || 0;
      setSum += price;
      const data = getCardData(card.id);
      if (data.collected) {
        count++;
        value += price * data.quantity;
      }
    });

    const total = cards.length;
    collectedCount.textContent = count;
    totalCount.textContent = total;
    progressFill.style.width = total ? ((count / total) * 100) + '%' : '0%';
    totalValue.textContent = '$' + value.toFixed(2);
    avgPrice.textContent = total ? ('$' + (setSum / total).toFixed(2)) : '$0.00';
    setTotal.textContent = '$' + setSum.toFixed(2);
  }

  // Detail panel
  function openDetail(id) {
    activeCardId = id;
    const card = cards.find(c => c.id === id);
    if (!card) return;

    const data = getCardData(id);

    detailImage.src = card.image_normal || card.image_small;
    detailImage.alt = card.name;
    detailName.textContent = card.name;
    detailType.textContent = card.type_line;
    detailRarity.textContent = card.rarity;
    detailArtist.textContent = card.artist;
    const mkt = card.price_market || card.price_usd;
    const med = card.price_median;
    const tcgUrl = card.tcgplayer_id ? `https://www.tcgplayer.com/product/${card.tcgplayer_id}` : null;

    if (tcgUrl) {
      let html = mkt
        ? `<a href="${tcgUrl}" target="_blank" rel="noopener" class="price-link">Market: $${parseFloat(mkt).toFixed(2)}</a>`
        : 'No price data';
      if (med) html += `  ·  <a href="${tcgUrl}" target="_blank" rel="noopener" class="price-link">Median: $${parseFloat(med).toFixed(2)}</a>`;
      detailPrice.innerHTML = html;
    } else {
      detailPrice.textContent = mkt ? `Market: $${parseFloat(mkt).toFixed(2)}` : 'No price data';
    }
    detailCollected.checked = data.collected;
    detailCondition.value = data.condition;
    qtyValue.textContent = data.quantity;
    detailNotes.value = data.notes;

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDetail() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    activeCardId = null;
  }

  function saveActiveCard() {
    if (!activeCardId) return;
    const data = getCardData(activeCardId);
    data.collected = detailCollected.checked;
    data.condition = detailCondition.value;
    data.quantity = parseInt(qtyValue.textContent, 10) || 1;
    data.notes = detailNotes.value;
    saveCollection();
    updateStats();

    const el = grid.querySelector(`[data-id="${activeCardId}"]`);
    if (el) {
      el.classList.toggle('collected', data.collected);
    }
  }

  // Detail events
  detailClose.addEventListener('click', closeDetail);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDetail();
  });

  detailCollected.addEventListener('change', saveActiveCard);
  detailCondition.addEventListener('change', saveActiveCard);
  detailNotes.addEventListener('input', saveActiveCard);

  qtyPlus.addEventListener('click', () => {
    const cur = parseInt(qtyValue.textContent, 10) || 1;
    qtyValue.textContent = cur + 1;
    saveActiveCard();
  });

  qtyMinus.addEventListener('click', () => {
    const cur = parseInt(qtyValue.textContent, 10) || 1;
    if (cur > 1) {
      qtyValue.textContent = cur - 1;
      saveActiveCard();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (overlay.classList.contains('open')) {
        closeDetail();
      } else if (selectedIds.size > 0) {
        clearSelection();
      }
    }
  });

  // Filter events
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(renderGrid, 200);
  });
  colorFilter.addEventListener('change', renderGrid);
  rarityFilter.addEventListener('change', renderGrid);
  collectedFilter.addEventListener('change', renderGrid);
  priceSort.addEventListener('change', renderGrid);

  // Init
  async function init() {
    loadCollection();
    try {
      const res = await fetch('data/cards.json');
      cards = await res.json();
    } catch (err) {
      grid.innerHTML = '<p style="padding:2rem;text-align:center;color:#c00">Failed to load card data. Run: node scripts/fetch-cards.js</p>';
      return;
    }
    updateStats();
    renderGrid();
  }

  init();
})();
