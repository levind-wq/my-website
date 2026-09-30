/* ═══════════════════════════
   UniLibrary – Main JS
═══════════════════════════ */

const API = "http://127.0.0.1:5000";

// ── State ──────────────────────────────────────────────
let state = {
  page: 1,
  perPage: 20,
  search: "",
  categoryUrl: "",
  categoryName: "All Books",
  minPrice: "",
  maxPrice: "",
  minRating: 0,
  sort: "",
  totalPages: 1,
  totalBooks: 0,
  view: "grid"
};

// ══════════════════════════════════════════════════════
//  PARTICLE CANVAS
// ══════════════════════════════════════════════════════
(function initParticles() {
  const canvas = document.getElementById("particles-canvas");
  const ctx = canvas.getContext("2d");
  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x  = Math.random() * W;
      this.y  = Math.random() * H;
      this.r  = Math.random() * 1.8 + 0.3;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = (Math.random() - 0.5) * 0.3 - 0.1;
      this.alpha = Math.random() * 0.6 + 0.1;
      this.color = Math.random() > 0.5
        ? `rgba(196,160,84,${this.alpha})`
        : `rgba(124,111,212,${this.alpha})`;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.y < -10 || this.x < -10 || this.x > W + 10) this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
  }

  for (let i = 0; i < 120; i++) particles.push(new Particle());

  function loop() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(loop);
  }
  loop();
})();

// ══════════════════════════════════════════════════════
//  NAVBAR SCROLL
// ══════════════════════════════════════════════════════
window.addEventListener("scroll", () => {
  const nav = document.getElementById("navbar");
  nav.classList.toggle("scrolled", window.scrollY > 50);
});

// ══════════════════════════════════════════════════════
//  STATS
// ══════════════════════════════════════════════════════
async function loadStats() {
  try {
    const res = await fetch(`${API}/api/stats`);
    const data = await res.json();

    animateValue("avg-price", `£${data.avg_price.toFixed(2)}`);
    animateValue("min-price", `£${data.min_price.toFixed(2)}`);
    animateValue("max-price", `£${data.max_price.toFixed(2)}`);
    animateValue("in-stock", `${data.in_stock_count}/${data.sample_size}`);

    ["stat-avg","stat-min","stat-max","stat-stock"].forEach(id => {
      document.getElementById(id).classList.remove("loading");
    });

    renderRatingChart(data.rating_distribution);
  } catch (e) {
    console.error("Stats error:", e);
  }
}

function animateValue(id, finalVal) {
  const el = document.getElementById(id);
  el.style.opacity = "0";
  el.style.transform = "translateY(8px)";
  el.textContent = finalVal;
  setTimeout(() => {
    el.style.transition = "all 0.5s ease";
    el.style.opacity = "1";
    el.style.transform = "none";
  }, 50);
}

function renderRatingChart(dist) {
  const container = document.getElementById("rating-chart");
  const max = Math.max(...Object.values(dist), 1);
  const labels = ["One","Two","Three","Four","Five"];

  container.innerHTML = [5,4,3,2,1].map(stars => {
    const count = dist[stars] || 0;
    const pct = Math.round((count / max) * 100);
    const filled = "⭐".repeat(stars);
    const empty  = "☆".repeat(5 - stars);
    return `
      <div class="rating-row">
        <div class="rating-label">
          <span class="star-f">${filled}</span><span class="star-e">${empty}</span>
        </div>
        <div class="rating-bar-bg">
          <div class="rating-bar-fill" data-pct="${pct}" style="width:0%"></div>
        </div>
        <div class="rating-count">${count}</div>
      </div>`;
  }).join("");

  // Animate bars after render
  requestAnimationFrame(() => {
    document.querySelectorAll(".rating-bar-fill").forEach(el => {
      el.style.width = el.dataset.pct + "%";
    });
  });
}

// ══════════════════════════════════════════════════════
//  CATEGORIES
// ══════════════════════════════════════════════════════
async function loadCategories() {
  try {
    const res  = await fetch(`${API}/api/categories`);
    const data = await res.json();
    const wrap = document.getElementById("cat-pills");
    document.getElementById("cat-loading").remove();

    data.categories.forEach(cat => {
      const btn = document.createElement("button");
      btn.className = "cat-pill";
      btn.textContent = cat.name;
      btn.dataset.url = cat.url;
      btn.onclick = () => selectCategory(btn);
      wrap.appendChild(btn);
    });
  } catch (e) {
    document.getElementById("cat-loading").textContent = "Could not load categories.";
  }
}

function selectCategory(btn) {
  document.querySelectorAll(".cat-pill").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  state.categoryUrl  = btn.dataset.url || "";
  state.categoryName = btn.textContent;
  state.page = 1;
  loadBooks();
}

// ══════════════════════════════════════════════════════
//  BOOKS
// ══════════════════════════════════════════════════════
async function loadBooks() {
  showSkeletons();

  const params = new URLSearchParams({
    page:     state.page,
    per_page: state.perPage,
    sort:     state.sort,
    min_rating: state.minRating
  });
  if (state.search)      params.set("search", state.search);
  if (state.categoryUrl) params.set("category_url", state.categoryUrl);
  if (state.minPrice)    params.set("min_price", state.minPrice);
  if (state.maxPrice)    params.set("max_price", state.maxPrice);

  try {
    const res  = await fetch(`${API}/api/books?${params}`);
    const data = await res.json();
    state.totalPages = data.total_pages;
    state.totalBooks = data.total;

    renderBooks(data.books);
    renderPagination();
    updateMeta(data.total, data.page, data.total_pages);
    updateNavBadge(data.total);
  } catch (e) {
    showError("Could not connect to the Flask server. Make sure app.py is running.");
  }
}

function showSkeletons() {
  const grid = document.getElementById("books-grid");
  grid.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const sk = document.createElement("div");
    sk.className = "book-skeleton";
    grid.appendChild(sk);
  }
}

function showError(msg) {
  document.getElementById("books-grid").innerHTML = `
    <div class="no-results" style="grid-column:1/-1">
      <span class="nr-icon">🔌</span>
      <h3>Connection Error</h3>
      <p>${msg}</p>
    </div>`;
}

function renderBooks(books) {
  const grid = document.getElementById("books-grid");
  grid.innerHTML = "";

  if (!books.length) {
    grid.innerHTML = `
      <div class="no-results">
        <span class="nr-icon">📭</span>
        <h3>No books found</h3>
        <p>Try adjusting your filters or search query.</p>
      </div>`;
    return;
  }

  books.forEach((book, i) => {
    const stars = renderStars(book.rating);
    const card  = document.createElement("div");
    card.className = "book-card";
    card.style.animationDelay = `${i * 40}ms`;
    card.onclick = () => openModal(book.book_url);
    card.innerHTML = `
      <div class="book-img-wrap">
        <img class="book-img" src="${book.image_url}" alt="${escapeHtml(book.title)}"
             loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><rect fill=%22%231a1e2e%22 width=%22200%22 height=%22200%22/><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 fill=%22%23c4a054%22 font-size=%2240%22>📖</text></svg>'" />
        <span class="book-badge ${book.in_stock ? '' : 'out'}">${book.in_stock ? 'In Stock' : 'Out of Stock'}</span>
      </div>
      <div class="book-body">
        <div class="book-title">${escapeHtml(book.title)}</div>
        <div class="book-stars">${stars}</div>
        <div class="book-price">£${book.price.toFixed(2)}</div>
        <div class="book-view-btn">View Details →</div>
      </div>`;
    grid.appendChild(card);
  });
}

function renderStars(rating) {
  let html = "";
  for (let i = 1; i <= 5; i++) {
    html += `<span class="${i <= rating ? 'star-f' : 'star-e'}">${i <= rating ? '⭐' : '☆'}</span>`;
  }
  return html;
}

function updateMeta(total, page, totalPages) {
  document.getElementById("results-count").innerHTML =
    `Showing page <strong>${page}</strong> of <strong>${totalPages}</strong> — <strong>${total}</strong> book${total !== 1 ? 's' : ''}`;
}

function updateNavBadge(total) {
  document.getElementById("total-badge").textContent = `${total} books`;
  document.getElementById("hs-total").textContent = total > 1000 ? "1000+" : total;
}

// ── Pagination ─────────────────────────────────────────
function renderPagination() {
  const wrap = document.getElementById("pagination");
  wrap.innerHTML = "";
  if (state.totalPages <= 1) return;

  const createBtn = (label, page, cls = "", disabled = false) => {
    const btn = document.createElement("button");
    btn.className = `page-btn ${cls}`;
    btn.textContent = label;
    btn.disabled = disabled;
    if (!disabled) btn.onclick = () => { state.page = page; loadBooks(); scrollToCatalog(); };
    return btn;
  };

  wrap.appendChild(createBtn("← Prev", state.page - 1, "prev", state.page === 1));

  const range = getPageRange(state.page, state.totalPages);
  range.forEach(p => {
    if (p === "…") {
      const el = document.createElement("span");
      el.textContent = "…";
      el.style.cssText = "color:var(--text-3);display:flex;align-items:center;padding:0 4px";
      wrap.appendChild(el);
    } else {
      wrap.appendChild(createBtn(p, p, p === state.page ? "active" : ""));
    }
  });

  wrap.appendChild(createBtn("Next →", state.page + 1, "next", state.page === state.totalPages));
}

function getPageRange(cur, total) {
  if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
  if (cur <= 4)   return [1,2,3,4,5,"…",total];
  if (cur >= total - 3) return [1,"…",total-4,total-3,total-2,total-1,total];
  return [1,"…",cur-1,cur,cur+1,"…",total];
}

// ══════════════════════════════════════════════════════
//  MODAL
// ══════════════════════════════════════════════════════
async function openModal(bookUrl) {
  const overlay = document.getElementById("modal-overlay");
  const body    = document.getElementById("modal-body");

  body.innerHTML = `
    <div class="modal-loading">
      <div class="spinner"></div>
      <span>Fetching book details…</span>
    </div>`;
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";

  try {
    const res  = await fetch(`${API}/api/book-detail?url=${encodeURIComponent(bookUrl)}`);
    const book = await res.json();

    const stars = renderStars(book.rating);
    body.innerHTML = `
      <div class="modal-content">
        <div class="modal-top">
          <div class="modal-img-wrap">
            <img class="modal-img" src="${book.image_url}" alt="${escapeHtml(book.title || '')}"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22220%22><rect fill=%22%231a1e2e%22 width=%22160%22 height=%22220%22/><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 fill=%22%23c4a054%22 font-size=%2260%22>📖</text></svg>'" />
          </div>
          <div class="modal-info">
            <h2 class="modal-title">${escapeHtml(book.title || 'Unknown')}</h2>
            <div class="modal-stars">${stars}</div>
            <div class="modal-price-row">
              <span class="modal-price">£${(book.price || 0).toFixed(2)}</span>
              <span class="modal-stock ${book.in_stock ? 'in' : 'out'}">
                ${book.in_stock ? '✓ In Stock' : '✗ Out of Stock'}
              </span>
            </div>
            <div class="modal-meta-grid">
              <div class="meta-item">
                <span class="meta-label">UPC</span>
                <span class="meta-value">${book.upc || '—'}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Product Type</span>
                <span class="meta-value">${book.product_type || 'Book'}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Reviews</span>
                <span class="meta-value">${book.num_reviews || '0'}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Rating</span>
                <span class="meta-value">${book.rating}/5 Stars</span>
              </div>
            </div>
          </div>
        </div>
        ${book.description ? `
        <div class="modal-desc-section">
          <div class="modal-desc-title">Description</div>
          <p class="modal-desc">${escapeHtml(book.description)}</p>
        </div>` : ''}
      </div>`;
  } catch (e) {
    body.innerHTML = `<div class="modal-loading"><span>Failed to load book details.</span></div>`;
  }
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  document.body.style.overflow = "";
}

document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

// ══════════════════════════════════════════════════════
//  FILTERS & CONTROLS
// ══════════════════════════════════════════════════════
function applyFilters() {
  state.search    = document.getElementById("search-input").value.trim();
  state.sort      = document.getElementById("sort-select").value;
  state.minRating = parseInt(document.getElementById("rating-filter").value) || 0;
  state.minPrice  = document.getElementById("min-price-filter").value;
  state.maxPrice  = document.getElementById("max-price-filter").value;
  state.page      = 1;
  toggleSearchClear();
  loadBooks();
}

function resetFilters() {
  document.getElementById("search-input").value    = "";
  document.getElementById("sort-select").value     = "";
  document.getElementById("rating-filter").value   = "0";
  document.getElementById("min-price-filter").value = "";
  document.getElementById("max-price-filter").value = "";
  state.search    = "";
  state.sort      = "";
  state.minRating = 0;
  state.minPrice  = "";
  state.maxPrice  = "";
  state.page      = 1;
  toggleSearchClear();
  loadBooks();
}

function clearSearch() {
  document.getElementById("search-input").value = "";
  state.search = "";
  state.page   = 1;
  toggleSearchClear();
  loadBooks();
}

function toggleSearchClear() {
  const btn = document.getElementById("search-clear");
  const val = document.getElementById("search-input").value;
  btn.style.display = val ? "block" : "none";
}

// Live search on Enter
document.getElementById("search-input").addEventListener("keydown", e => {
  if (e.key === "Enter") applyFilters();
  toggleSearchClear();
});
document.getElementById("search-input").addEventListener("input", toggleSearchClear);

// Dropdown triggers
document.getElementById("sort-select").addEventListener("change", applyFilters);
document.getElementById("rating-filter").addEventListener("change", applyFilters);

// ── View toggle ────────────────────────────────────────
function setView(v) {
  state.view = v;
  const grid = document.getElementById("books-grid");
  grid.classList.toggle("list-view", v === "list");
  document.getElementById("view-grid").classList.toggle("active", v === "grid");
  document.getElementById("view-list").classList.toggle("active", v === "list");
}

// ── Scroll helpers ──────────────────────────────────────
function scrollToCatalog() {
  document.getElementById("catalog-section").scrollIntoView({ behavior: "smooth" });
}
function scrollToStats() {
  document.getElementById("stats-section").scrollIntoView({ behavior: "smooth" });
}

// ══════════════════════════════════════════════════════
//  UTIL
// ══════════════════════════════════════════════════════
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ══════════════════════════════════════════════════════
//  INTERSECTION OBSERVER – animate chart on scroll
// ══════════════════════════════════════════════════════
const io = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      document.querySelectorAll(".rating-bar-fill").forEach(el => {
        el.style.width = el.dataset.pct + "%";
      });
      io.disconnect();
    }
  });
}, { threshold: 0.3 });

const chartCard = document.querySelector(".chart-card");
if (chartCard) io.observe(chartCard);

// ══════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════
(function init() {
  loadStats();
  loadCategories();
  loadBooks();
})();
