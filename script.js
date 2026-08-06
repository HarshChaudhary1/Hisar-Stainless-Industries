const GOOGLE_SHEET_RAW_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRoP4gXwYwSWh7R6hLxHC2TGnTrJAZn0kAXXnVtrLEEM25mn5LoFY0e_fZUpMhlRRbvupiEeauwoJRb/pub?output=csv';          // <-- REPLACE: Raw Materials sheet CSV link
const GOOGLE_SHEET_HARDWARE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ2vFpWygFj4hlj43uwbTKq6KCavxWIZ1i3filKIvT_d-vKnTidVDcA8Y9pZv97fO2On-TWNQjZ14Nq/pub?output=csv';     // <-- REPLACE: Hardware & Small Items sheet CSV link
const GOOGLE_SHEET_FABRICATION_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS1qG2gIK6AD0dlBfQCy0ksmJ47r9OVRP4PVPhSGjDugi2e5VUkRg8CTK0TsF4BB-F6nK4fIKfYA3zA/pub?output=csv'; // <-- REPLACE: Fabrication Charges sheet CSV link


let num=document.getElementById("num1");
let date=new Date();
let years= date.getFullYear()-2012;

num.textContent=`${years}+`;


function detectDelimiter(sampleLine){
  const candidates = [',', '\t', ';'];
  let best = ',', bestCount = -1;
  candidates.forEach(d => {
    const count = sampleLine.split(d).length - 1;
    if(count > bestCount){ bestCount = count; best = d; }
  });
  return best;
}

function parseCsv(text){
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delimiter = detectDelimiter(firstLine);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if(c === '"') inQuotes = true;
      else if(c === delimiter){ row.push(field); field = ''; }
      else if(c === '\n' || c === '\r'){
        if(c === '\r' && text[i+1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else field += c;
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  const nonEmpty = rows.filter(r => r.some(c => c.trim() !== ''));
  if(!nonEmpty.length) return [];
  const headers = nonEmpty[0].map(h => h.trim());
  return nonEmpty.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = (r[i] || '').trim());
    return obj;
  });
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

// turns "DIA: 25.4mm|THK: 0.8mm" into { DIA: '25.4mm', THK: '0.8mm' }
function parseSpecs(specsStr){
  const result = {};
  (specsStr || '').split('|').forEach(pair => {
    const idx = pair.indexOf(':');
    if(idx === -1) return;
    const key = pair.slice(0, idx).trim().toUpperCase();
    const val = pair.slice(idx + 1).trim();
    if(key && val) result[key] = val;
  });
  return result;
}

// natural sort helper for values like "12.7mm", "15.8mm" — sorts by the leading number
function sortByLeadingNumber(values){
  return [...values].sort((a, b) => {
    const numA = parseFloat(a) || 0;
    const numB = parseFloat(b) || 0;
    return numA - numB;
  });
}

function buildCard(item){
  const card = document.createElement('div');
  card.className = 'tag-card';
  card.dataset.itemId = item.id;

  const badge = (item.sample || '').toLowerCase() === 'yes'
    ? '<span class="sample-badge">Sample</span>' : '';

  const specsHtml = (item.specs || '')
    .split('|').map(s => escapeHtml(s.trim())).filter(Boolean).join('<br>');

  // single GST-inclusive price only — no with/without GST toggle anymore
  const price = item.price_with_gst ? `₹${escapeHtml(item.price_with_gst)}` : 'On request';
  const unit = escapeHtml(item.unit || '');

  card.innerHTML = `
    ${badge}
    <h4>${escapeHtml(item.name || '')}</h4>
    <div class="tag-specs">${specsHtml}</div>
    <div class="tag-price-row">
      <span class="amount">${price}</span> <span class="unit">${unit ? '/ ' + unit + ' + GST' : ''}</span>
    </div>
  `;
  return card;
}

function buildSubcatBlock(subName, items){
  const block = document.createElement('div');
  block.className = 'subcat-block';

  const head = document.createElement('div');
  head.className = 'subcat-head';
  head.innerHTML = `
    <div class="subcat-head-left"><h3>${escapeHtml(subName)}</h3><span class="count">${items.length} item${items.length > 1 ? 's' : ''}</span></div>
    <span class="chevron">&#9656;</span>
  `;
  block.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'tag-grid collapsed'; // collapsed by default so long lists don't force scrolling
  items.forEach(item => grid.appendChild(buildCard(item)));
  block.appendChild(grid);

  head.addEventListener('click', () => {
    grid.classList.toggle('collapsed');
    head.classList.toggle('open');
  });

  return block;
}

function renderCategory(containerId, rows){
  const container = document.getElementById(containerId);
  if(!container) return;

  if(!rows.length){
    container.innerHTML = '<p class="catalog-loading">No items match right now.</p>';
    return;
  }

  container.innerHTML = '';

  // if every row has a "grade" filled in, group by grade first, then subcategory
  const hasGrade = rows.every(r => (r.grade || '').trim() !== '');

  if(hasGrade){
    const gradeGroups = {};
    rows.forEach(r => {
      const grade = r.grade.trim();
      if(!gradeGroups[grade]) gradeGroups[grade] = {};
      const sub = r.subcategory || 'Other';
      if(!gradeGroups[grade][sub]) gradeGroups[grade][sub] = [];
      gradeGroups[grade][sub].push(r);
    });

    Object.keys(gradeGroups).forEach(gradeName => {
      const gradeBlock = document.createElement('div');
      gradeBlock.className = 'grade-block';

      const gradeHead = document.createElement('div');
      gradeHead.className = 'grade-head';
      gradeHead.innerHTML = `<h2>Grade ${escapeHtml(gradeName)}</h2>`;
      gradeBlock.appendChild(gradeHead);

      const subcats = gradeGroups[gradeName];
      Object.keys(subcats).forEach(subName => {
        gradeBlock.appendChild(buildSubcatBlock(subName, subcats[subName]));
      });

      container.appendChild(gradeBlock);
    });
  } else {
    const grouped = {};
    rows.forEach(r => {
      const sub = r.subcategory || 'Other';
      if(!grouped[sub]) grouped[sub] = [];
      grouped[sub].push(r);
    });
    Object.keys(grouped).forEach(subName => {
      container.appendChild(buildSubcatBlock(subName, grouped[subName]));
    });
  }
}

// ============================================================
// FILTER BAR — search + grade + subcategory, per section
// ============================================================
// catalogState keeps the full, unfiltered rows for each container so the
// filter bar can re-slice them instantly without re-fetching the sheet.
const catalogState = {};

function populateFilterOptions(containerId, rows){
  const bar = document.querySelector(`.catalog-filter-bar[data-target="${containerId}"]`);
  if(!bar) return;

  const gradeSelect = bar.querySelector('.filter-grade');
  const subcatSelect = bar.querySelector('.filter-subcat');
  const diaSelect = bar.querySelector('.filter-dia');
  const thkSelect = bar.querySelector('.filter-thk');

  const grades = [...new Set(rows.map(r => (r.grade || '').trim()).filter(Boolean))].sort();
  const subcats = [...new Set(rows.map(r => (r.subcategory || '').trim()).filter(Boolean))].sort();
  const dias = sortByLeadingNumber([...new Set(rows.map(r => parseSpecs(r.specs).SIZE).filter(Boolean))]);
  const thks = sortByLeadingNumber([...new Set(rows.map(r => parseSpecs(r.specs).THKNS).filter(Boolean))]);

  if(gradeSelect){
    if(!grades.length){
      gradeSelect.style.display = 'none';
    } else {
      gradeSelect.innerHTML = '<option value="">All Grades</option>' +
        grades.map(g => `<option value="${escapeHtml(g)}">Grade ${escapeHtml(g)}</option>`).join('');
    }
  }
  if(subcatSelect){
    subcatSelect.innerHTML = '<option value="">All Types</option>' +
      subcats.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  }
  if(diaSelect){
    if(!dias.length){
      diaSelect.style.display = 'none';
    } else {
      diaSelect.style.display = '';
      diaSelect.innerHTML = '<option value="">All Diameters</option>' +
        dias.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
    }
  }
  if(thkSelect){
    if(!thks.length){
      thkSelect.style.display = 'none';
    } else {
      thkSelect.style.display = '';
      thkSelect.innerHTML = '<option value="">All Thickness</option>' +
        thks.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
    }
  }
}

function applyFilters(containerId){
  const rows = catalogState[containerId] || [];
  const bar = document.querySelector(`.catalog-filter-bar[data-target="${containerId}"]`);
  if(!bar){ renderCategory(containerId, rows); return; }

  const searchTerm = (bar.querySelector('.filter-search')?.value || '').trim().toLowerCase();
  const gradeVal = bar.querySelector('.filter-grade')?.value || '';
  const subcatVal = bar.querySelector('.filter-subcat')?.value || '';
  const diaVal = bar.querySelector('.filter-dia')?.value || '';
  const thkVal = bar.querySelector('.filter-thk')?.value || '';

  const filtered = rows.filter(r => {
    if(gradeVal && (r.grade || '').trim() !== gradeVal) return false;
    if(subcatVal && (r.subcategory || '').trim() !== subcatVal) return false;
    if(diaVal || thkVal){
      const specs = parseSpecs(r.specs);
      if(diaVal && specs.SIZE !== diaVal) return false;
      if(thkVal && specs.THKNS !== thkVal) return false;
    }
    if(searchTerm){
      const haystack = `${r.name || ''} ${r.specs || ''}`.toLowerCase();
      if(!haystack.includes(searchTerm)) return false;
    }
    return true;
  });

  renderCategory(containerId, filtered);

  // when a search/filter is active, auto-expand results so the user doesn't
  // have to click through collapsed sections to see what matched
  if(searchTerm || gradeVal || subcatVal || diaVal || thkVal){
    document.querySelectorAll(`#${containerId} .tag-grid`).forEach(g => g.classList.remove('collapsed'));
    document.querySelectorAll(`#${containerId} .subcat-head`).forEach(h => h.classList.add('open'));
  }
}

function wireFilterBar(containerId){
  const bar = document.querySelector(`.catalog-filter-bar[data-target="${containerId}"]`);
  if(!bar) return;
  const search = bar.querySelector('.filter-search');
  const gradeSelect = bar.querySelector('.filter-grade');
  const subcatSelect = bar.querySelector('.filter-subcat');
  const diaSelect = bar.querySelector('.filter-dia');
  const thkSelect = bar.querySelector('.filter-thk');

  search?.addEventListener('input', () => applyFilters(containerId));
  gradeSelect?.addEventListener('change', () => applyFilters(containerId));
  subcatSelect?.addEventListener('change', () => applyFilters(containerId));
  diaSelect?.addEventListener('change', () => applyFilters(containerId));
  thkSelect?.addEventListener('change', () => applyFilters(containerId));
}

function loadCategory(url, containerId){
  const container = document.getElementById(containerId);
  const bar = document.querySelector(`.catalog-filter-bar[data-target="${containerId}"]`);
  if(!url){
    if(container) container.innerHTML = '<p class="catalog-loading">This section isn\'t connected to a sheet yet.</p>';
    if(bar) bar.style.display = 'none';
    return;
  }
  fetch(url)
    .then(res => res.text())
    .then(text => {
      const rows = parseCsv(text);
      catalogState[containerId] = rows;
      if(!rows.length){
        if(bar) bar.style.display = 'none';
      } else {
        populateFilterOptions(containerId, rows);
        wireFilterBar(containerId);
      }
      renderCategory(containerId, rows);
    })
    .catch(err => {
      console.warn('Could not load sheet for', containerId, err);
      if(container) container.innerHTML = '<p class="catalog-loading">Could not load items right now. Please check back later.</p>';
      if(bar) bar.style.display = 'none';
    });
}

loadCategory(GOOGLE_SHEET_RAW_URL, 'raw-materials-list');
loadCategory(GOOGLE_SHEET_HARDWARE_URL, 'hardware-list');
loadCategory(GOOGLE_SHEET_FABRICATION_URL, 'fabrication-list');

// ---------- auto-rotating slideshows (hero swatches + fabrication photos) ----------
// Each slideshow container just needs child elements with class "swatch-slide"
// or "fab-slide" — one should start with class "active". When real photos are
// ready, just put an <img> inside each slide div instead of the placeholder text;
// the fade/zoom behavior keeps working exactly the same.
function initSlideshow(container, slideSelector, intervalMs, initialDelay){
  const slides = container.querySelectorAll(slideSelector);
  if(slides.length < 2) return;
  let idx = 0;
  slides.forEach((s, i) => { if(s.classList.contains('active')) idx = i; });
  setTimeout(() => {
    setInterval(() => {
      slides[idx].classList.remove('active');
      idx = (idx + 1) % slides.length;
      slides[idx].classList.add('active');
    }, intervalMs);
  }, initialDelay || 0);
}

// hero swatches: all rotate every 3 seconds
document.querySelectorAll('.hero-visual .swatch[data-slideshow]').forEach(el => {
  initSlideshow(el, '.swatch-slide', 3000, 0);
});

// fabrication cards: rotate every 3.5s, staggered slightly so all 3 don't flip in unison
document.querySelectorAll('.fab-card .fab-slideshow[data-slideshow]').forEach((el, i) => {
  initSlideshow(el, '.fab-slide', 3500, i * 400);
});

// ============================================================
// PRELOADER — animated intro before the homepage appears
// ============================================================
// Shows once per browser session (won't replay every time the person
// revisits within the same tab session — only on their first load).
// Respects prefers-reduced-motion by skipping straight to the site.
(function initPreloader(){
  const preloader = document.getElementById('preloader');
  if(!preloader) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const alreadyShown = sessionStorage.getItem('hsi_preloader_shown');

  if(reduceMotion || alreadyShown){
    preloader.remove();
    return;
  }
  sessionStorage.setItem('hsi_preloader_shown', '1');

  document.body.style.overflow = 'hidden';

  const titleEl = preloader.querySelector('.preloader-title');
  const text = titleEl.dataset.text || titleEl.textContent;
  titleEl.innerHTML = text.split('').map((ch, i) =>
    `<span style="animation-delay:${i * 40}ms">${ch === ' ' ? '&nbsp;' : ch}</span>`
  ).join('');

  const lettersDone = text.length * 40 + 650;   // last letter's delay + its own spark-ignite duration
  const holdAfterLine = 900;                    // time line + tagline stay visible before zooming
  const zoomInAt = lettersDone + holdAfterLine; // text starts zooming in big
  const zoomInDuration = 700;
  const exitAt = zoomInAt + 500;                // whole scene starts zooming out + fading (slight overlap for continuous motion)
  const exitDuration = 600;
  const removedAt = exitAt + exitDuration + 100;

  setTimeout(() => preloader.classList.add('line-draw'), lettersDone);
  setTimeout(() => preloader.classList.add('zoom-in'), zoomInAt);
  setTimeout(() => preloader.classList.add('preloader-exit'), exitAt);
  setTimeout(() => {
    preloader.style.display = 'none';
    document.body.style.overflow = '';
  }, removedAt);
})();

// ---------- mobile nav ----------
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const primaryNav = document.getElementById('primaryNav');
  hamburgerBtn.addEventListener('click', () => {
    const isOpen = primaryNav.classList.toggle('open');
    hamburgerBtn.setAttribute('aria-expanded', isOpen);
  });
  primaryNav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => primaryNav.classList.remove('open'));
  });

  // ---------- gallery tabs ----------
  document.querySelectorAll('.gtab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.gtab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.gallery-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ---------- contact form -> WhatsApp ----------
  const contactForm = document.getElementById('contactForm');
  const formMsg = document.getElementById('form-msg');
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('cf-name').value.trim();
    const phone = document.getElementById('cf-phone').value.trim();
    const need = document.getElementById('cf-need').value;
    const msg = document.getElementById('cf-msg').value.trim();

    if(!name || !phone){
      formMsg.textContent = 'Please fill in your name and phone number.';
      formMsg.style.color = '#B23A2E';
      formMsg.classList.add('show');
      return;
    }

    // REPLACE: phone number in the wa.me link below
    const waNumber = '919996753920';
    const text = `Hi, I'm ${name} (${phone}).%0ARequirement: ${need}%0AMessage: ${msg || 'N/A'}`;
    window.open(`https://wa.me/${waNumber}?text=${text}`, '_blank');

    formMsg.textContent = 'Opening WhatsApp with your message...';
    formMsg.style.color = '#2E7D32';
    formMsg.classList.add('show');
    contactForm.reset();
  });
