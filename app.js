const API_BASE = "https://api.frankfurter.app";
const CACHE_KEY = "cc_cached_rates_v1";
const HISTORY_KEY = "cc_history_v1";
const FAVORITES_KEY = "cc_favorites_v1";
const THEME_KEY = "cc_theme_v1";
const SUPPORTED_KEY = "cc_supported_currencies_v1";
const SOURCE_KEY = "cc_rate_source_v1";
const CACHE_TTL_MS = 1000 * 60 * 30;
const CURRENCY_TTL_MS = 1000 * 60 * 60 * 24 * 3;
const FALLBACK_RATE = {
  USD: { PKR: 278, EUR: 0.92, GBP: 0.79, AED: 3.67, INR: 83.3 },
  EUR: { USD: 1.09, PKR: 303, GBP: 0.86, INR: 90.9 },
  PKR: { USD: 0.0036, EUR: 0.0033, INR: 0.299 },
};
const DEMO_BASE_RATES = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  PKR: 278,
  INR: 83.3,
  AED: 3.67,
  SAR: 3.75,
  JPY: 151.2,
  CAD: 1.36,
  AUD: 1.52,
  CHF: 0.9,
  SGD: 1.35,
  CNY: 7.23,
};
const DEFAULT_SUPPORTED = {
  AUD: "Australian Dollar",
  CAD: "Canadian Dollar",
  CHF: "Swiss Franc",
  CNY: "Chinese Renminbi",
  EUR: "Euro",
  GBP: "Pound Sterling",
  INR: "Indian Rupee",
  JPY: "Japanese Yen",
  PKR: "Pakistani Rupee",
  SAR: "Saudi Riyal",
  SGD: "Singapore Dollar",
  USD: "US Dollar",
  AED: "UAE Dirham",
 };

const dom = {
  amount: document.querySelector("#amount"),
  from: document.querySelector("#fromCurrency"),
  to: document.querySelector("#toCurrency"),
  convertBtn: document.querySelector("#convertBtn"),
  result: document.querySelector("#result"),
  status: document.querySelector("#status"),
  rateInfo: document.querySelector("#rateInfo"),
  datalist: document.querySelector("#currencyOptions"),
  swap: document.querySelector("#swapBtn"),
  history: document.querySelector("#historyList"),
  favorites: document.querySelector("#favoritesList"),
  favFromBtn: document.querySelector("#favFromBtn"),
  favToBtn: document.querySelector("#favToBtn"),
  compareChips: document.querySelector("#multiSelect"),
  compareResults: document.querySelector("#comparisonResults"),
  themeToggle: document.querySelector("#themeToggle"),
  voiceBtn: document.querySelector("#voiceBtn"),
  copyBtn: document.querySelector("#copyBtn"),
  shareBtn: document.querySelector("#shareBtn"),
  trendCanvas: document.querySelector("#trendCanvas"),
  rangeBtns: document.querySelectorAll(".range-btn"),
  installBtn: document.querySelector("#installBtn"),
  dataSource: document.querySelector("#dataSource"),
};

const state = {
  from: "USD",
  to: "PKR",
  amount: 100,
  theme: localStorage.getItem(THEME_KEY) || "dark",
  history: JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"),
  favorites: JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"),
  compare: ["EUR", "GBP", "AED"],
  trendDays: 7,
  ratesCache: JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"),
  supported: {},
  source: localStorage.getItem(SOURCE_KEY) || "demo",
  installPrompt: null,
};

function debounce(fn, delay = 420) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function setStatus(text, kind = "neutral") {
  dom.status.textContent = text;
  dom.status.style.color = kind === "error" ? "var(--error)" : kind === "ok" ? "var(--ok)" : "var(--muted)";
}

function getCurrencyMeta(code) {
  const display = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "currency" }) : null;
  const fallbackName = state.supported[code] || "";
  return `${code} - ${display ? display.of(code) || fallbackName || code : fallbackName || code}`;
}

function validCode(value) {
  const code = (value || "").trim().toUpperCase();
  return state.supported[code] ? code : "";
}

function saveState() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(0, 12)));
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites.slice(0, 15)));
  localStorage.setItem(CACHE_KEY, JSON.stringify(state.ratesCache));
  localStorage.setItem(SOURCE_KEY, state.source);
}

function parseUrlState() {
  const params = new URLSearchParams(window.location.search);
  state.from = validCode(params.get("from")) || state.from;
  state.to = validCode(params.get("to")) || state.to;
  const amount = Number(params.get("amount"));
  if (!Number.isNaN(amount) && amount > 0) {
    state.amount = amount;
  }
}

async function loadSupportedCurrencies() {
  if (state.source === "demo") {
    state.supported = { ...DEFAULT_SUPPORTED };
    return;
  }
  const cached = JSON.parse(localStorage.getItem(SUPPORTED_KEY) || "{}");
  if (cached.data && cached.timestamp && Date.now() - cached.timestamp < CURRENCY_TTL_MS) {
    state.supported = cached.data;
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/currencies`);
    if (!response.ok) throw new Error("Currency list API failed");
    const data = await response.json();
    state.supported = data;
    localStorage.setItem(SUPPORTED_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (error) {
    state.supported = cached.data || DEFAULT_SUPPORTED;
  }
}

function getDemoRates(base) {
  const baseValue = DEMO_BASE_RATES[base];
  if (!baseValue) return {};
  const rates = {};
  Object.keys(DEMO_BASE_RATES).forEach((code) => {
    rates[code] = DEMO_BASE_RATES[code] / baseValue;
  });
  return rates;
}

function applyTheme() {
  document.body.classList.toggle("dark", state.theme === "dark");
  dom.themeToggle.textContent = state.theme === "dark" ? "🌙" : "☀️";
  localStorage.setItem(THEME_KEY, state.theme);
}

function fillCurrencyDatalist() {
  const allCodes = Object.keys(state.supported);
  const sorted = [...new Set([...state.favorites, ...allCodes])];
  dom.datalist.innerHTML = sorted.map((code) => `<option value="${code}">${getCurrencyMeta(code)}</option>`).join("");
}

function renderFavorites() {
  if (!state.favorites.length) {
    dom.favorites.innerHTML = '<div class="list-item">No favorites yet.</div>';
  } else {
    dom.favorites.innerHTML = state.favorites
      .slice(0, 8)
      .map((code) => `<button class="list-item ghost quick-fav" data-code="${code}" type="button">${code}</button>`)
      .join("");
  }
  dom.favFromBtn.textContent = state.favorites.includes(state.from) ? "★" : "☆";
  dom.favToBtn.textContent = state.favorites.includes(state.to) ? "★" : "☆";
}

function renderHistory() {
  if (!state.history.length) {
    dom.history.innerHTML = '<div class="list-item">No conversions yet.</div>';
    return;
  }
  dom.history.innerHTML = state.history
    .slice(0, 8)
    .map(
      (item) => `<div class="list-item">${item.amount} ${item.from} → ${item.result} ${item.to}
      <div class="subtle">${new Date(item.at).toLocaleString()}</div></div>`
    )
    .join("");
}

function renderComparison(rates) {
  const amount = Number(dom.amount.value) || 1;
  dom.compareResults.innerHTML = state.compare
    .filter((c) => c !== state.from)
    .map((code) => {
      const value = rates[code];
      const result = value ? (amount * value).toFixed(2) : "--";
      return `<div class="comparison-item"><strong>${code}</strong><br>${result}</div>`;
    })
    .join("");
}

function renderCompareChips() {
  const candidates = ["EUR", "GBP", "JPY", "AED", "INR", "SAR", "CAD", "AUD"];
  dom.compareChips.innerHTML = candidates
    .map((code) => `<button class="chip ${state.compare.includes(code) ? "active" : ""}" data-code="${code}" type="button">${code}</button>`)
    .join("");
}

function saveRateCache(base, rates) {
  state.ratesCache[base] = { rates, timestamp: Date.now() };
  saveState();
}

async function getRates(base) {
  if (state.source === "demo") {
    const demoRates = getDemoRates(base);
    setStatus("Using demo offline rates", "ok");
    return demoRates;
  }

  const cached = state.ratesCache[base];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    setStatus("Using cached live rate", "ok");
    return cached.rates;
  }

  try {
    const response = await fetch(`${API_BASE}/latest?from=${encodeURIComponent(base)}`);
    if (!response.ok) throw new Error("Rate API failed");
    const data = await response.json();
    saveRateCache(base, data.rates);
    setStatus(navigator.onLine ? "Live rates updated" : "Offline: cached rates", "ok");
    return data.rates;
  } catch (error) {
    if (cached) {
      setStatus("API unavailable, using last saved rates", "error");
      return cached.rates;
    }
    // Auto-fallback to demo mode to keep conversion always working.
    const demoRates = getDemoRates(base);
    if (Object.keys(demoRates).length) {
      state.source = "demo";
      localStorage.setItem(SOURCE_KEY, state.source);
      if (dom.dataSource) dom.dataSource.value = "demo";
      setStatus("Live API unavailable, auto-switched to Demo Data", "error");
      return demoRates;
    }

    if (FALLBACK_RATE[base]) {
      setStatus("Limited offline rates loaded", "error");
      return FALLBACK_RATE[base];
    }
    setStatus("No rates available right now", "error");
    return {};
  }
}

function normalizeInputs() {
  let from = validCode(dom.from.value) || state.from;
  let to = validCode(dom.to.value) || state.to;
  if (!state.supported[from]) from = "USD";
  if (!state.supported[to]) to = "PKR";
  let amount = Number(dom.amount.value);
  if (Number.isNaN(amount) || amount <= 0) amount = 1;

  state.from = from;
  state.to = to;
  state.amount = amount;
  dom.from.value = from;
  dom.to.value = to;
  dom.amount.value = amount;
}

async function convertAndRender() {
  normalizeInputs();
  if (state.from === state.to) {
    dom.result.textContent = `${state.amount} ${state.from} = ${state.amount.toFixed(4)} ${state.to}`;
    dom.rateInfo.textContent = `1 ${state.from} = 1.000000 ${state.to}`;
    renderComparison({});
    updateShareUrl();
    drawTrend(state.trendDays);
    return;
  }
  const rates = await getRates(state.from);
  const rate = rates[state.to];

  if (!rate) {
    dom.result.textContent = `${state.amount} ${state.from} = -- ${state.to}`;
    dom.rateInfo.textContent = "Rate unavailable for selected pair. Try a supported currency.";
    renderComparison(rates);
    return;
  }

  const converted = state.amount * rate;
  dom.result.textContent = `${state.amount} ${state.from} = ${converted.toFixed(4)} ${state.to}`;
  dom.rateInfo.textContent = `1 ${state.from} = ${rate.toFixed(6)} ${state.to}`;

  state.history.unshift({
    amount: state.amount,
    from: state.from,
    to: state.to,
    result: converted.toFixed(4),
    at: Date.now(),
  });
  saveState();
  renderHistory();
  renderComparison(rates);
  updateShareUrl();
  drawTrend(state.trendDays);
}

function updateShareUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("from", state.from);
  url.searchParams.set("to", state.to);
  url.searchParams.set("amount", String(state.amount));
  history.replaceState({}, "", url.toString());
}

async function drawTrend(days) {
  const end = new Date();
  const start = new Date(Date.now() - (days - 1) * 86400000);
  const format = (d) => d.toISOString().split("T")[0];
  const ctx = dom.trendCanvas.getContext("2d");
  const width = dom.trendCanvas.width;
  const height = dom.trendCanvas.height;
  ctx.clearRect(0, 0, width, height);

  try {
    if (state.source === "demo") {
      const baseRate = DEMO_BASE_RATES[state.to] / DEMO_BASE_RATES[state.from];
      const entries = Array.from({ length: days }, (_, index) => {
        const wave = Math.sin(index / 2) * 0.01;
        return baseRate * (1 + wave);
      });
      const min = Math.min(...entries);
      const max = Math.max(...entries);
      const stepX = width / Math.max(entries.length - 1, 1);
      ctx.beginPath();
      entries.forEach((value, index) => {
        const scaled = (value - min) / (max - min || 1);
        const x = index * stepX;
        const y = height - scaled * (height - 20) - 10;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--accent").trim();
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }

    if (state.from === state.to) throw new Error("No trend for same currency");
    const url = `${API_BASE}/${format(start)}..${format(end)}?from=${encodeURIComponent(state.from)}&to=${encodeURIComponent(state.to)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Trend API failed");
    const data = await res.json();
    const entries = Object.values(data.rates).map((row) => row[state.to]).filter(Boolean);
    if (!entries.length) throw new Error("No trend values");

    const min = Math.min(...entries);
    const max = Math.max(...entries);
    const stepX = width / Math.max(entries.length - 1, 1);

    ctx.beginPath();
    entries.forEach((value, index) => {
      const scaled = (value - min) / (max - min || 1);
      const x = index * stepX;
      const y = height - scaled * (height - 20) - 10;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--accent").trim();
    ctx.lineWidth = 2;
    ctx.stroke();
  } catch (error) {
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--muted").trim();
    ctx.font = "14px Inter, Arial";
    ctx.fillText("Trend unavailable right now", 14, 40);
  }
}

function toggleFavorite(code) {
  if (!code) return;
  if (state.favorites.includes(code)) {
    state.favorites = state.favorites.filter((item) => item !== code);
  } else {
    state.favorites.unshift(code);
  }
  saveState();
  fillCurrencyDatalist();
  renderFavorites();
}

function initVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    dom.voiceBtn.disabled = true;
    dom.voiceBtn.title = "Voice input not supported in this browser";
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const value = Number(transcript.replace(/[^\d.]/g, ""));
    if (!Number.isNaN(value)) {
      dom.amount.value = value;
      debouncedConvert();
    }
  };
  dom.voiceBtn.addEventListener("click", () => recognition.start());
}

async function copyResult() {
  try {
    if (!navigator.clipboard) throw new Error("No clipboard API");
    await navigator.clipboard.writeText(dom.result.textContent || "");
    setStatus("Result copied to clipboard", "ok");
  } catch (error) {
    setStatus("Copy failed on this browser/context", "error");
  }
}

async function shareResult() {
  const text = `${dom.result.textContent} (${dom.rateInfo.textContent})`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Currency Conversion", text, url: window.location.href });
      return;
    }
    if (!navigator.clipboard) throw new Error("No clipboard API");
    await navigator.clipboard.writeText(window.location.href);
    setStatus("Share link copied to clipboard", "ok");
  } catch (error) {
    setStatus("Share not available on this browser", "error");
  }
}

function setInitialCurrencyFromLocale() {
  const region = (Intl.DateTimeFormat().resolvedOptions().locale.split("-")[1] || "").toUpperCase();
  const probable = Object.entries(countryList).find(([code, country]) => country === region && state.supported[code]);
  if (probable) {
    state.from = probable[0];
  }
}

function bindEvents() {
  dom.convertBtn.addEventListener("click", convertAndRender);
  dom.swap.addEventListener("click", () => {
    [dom.from.value, dom.to.value] = [dom.to.value, dom.from.value];
    convertAndRender();
  });
  dom.amount.addEventListener("input", debouncedConvert);
  dom.from.addEventListener("input", debouncedConvert);
  dom.to.addEventListener("input", debouncedConvert);
  dom.favFromBtn.addEventListener("click", () => toggleFavorite(validCode(dom.from.value)));
  dom.favToBtn.addEventListener("click", () => toggleFavorite(validCode(dom.to.value)));
  dom.copyBtn.addEventListener("click", copyResult);
  dom.shareBtn.addEventListener("click", shareResult);
  dom.themeToggle.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    drawTrend(state.trendDays);
  });
  dom.dataSource.addEventListener("change", () => {
    state.source = dom.dataSource.value === "live" ? "live" : "demo";
    localStorage.setItem(SOURCE_KEY, state.source);
    state.ratesCache = {};
    loadSupportedCurrencies().then(() => {
      fillCurrencyDatalist();
      if (!state.supported[state.from]) state.from = "USD";
      if (!state.supported[state.to]) state.to = "PKR";
      dom.from.value = state.from;
      dom.to.value = state.to;
      convertAndRender();
    });
  });

  dom.compareChips.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    const code = chip.dataset.code;
    if (state.compare.includes(code)) {
      state.compare = state.compare.filter((item) => item !== code);
    } else if (state.compare.length < 6) {
      state.compare.push(code);
    }
    renderCompareChips();
    debouncedConvert();
  });

  dom.favorites.addEventListener("click", (event) => {
    const btn = event.target.closest(".quick-fav");
    if (!btn) return;
    dom.to.value = btn.dataset.code;
    debouncedConvert();
  });

  dom.rangeBtns.forEach((button) => {
    button.addEventListener("click", () => {
      dom.rangeBtns.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.trendDays = Number(button.dataset.range);
      drawTrend(state.trendDays);
    });
  });

  window.addEventListener("online", () => setStatus("Back online: refreshing rates", "ok"));
  window.addEventListener("offline", () => setStatus("Offline mode: using saved rates", "error"));
}

function setupPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    dom.installBtn.classList.remove("hidden");
  });
  dom.installBtn.addEventListener("click", async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    dom.installBtn.classList.add("hidden");
  });
}

const debouncedConvert = debounce(convertAndRender);

function init() {
  Promise.resolve()
    .then(loadSupportedCurrencies)
    .then(() => {
      parseUrlState();
      setInitialCurrencyFromLocale();
      applyTheme();
      fillCurrencyDatalist();
      renderFavorites();
      renderHistory();
      renderCompareChips();

      if (!state.supported[state.from]) state.from = "USD";
      if (!state.supported[state.to]) state.to = "PKR";
      dom.from.value = state.from;
      dom.to.value = state.to;
      dom.amount.value = state.amount;
      dom.dataSource.value = state.source === "live" ? "live" : "demo";

      bindEvents();
      initVoiceInput();
      setupPWA();
      convertAndRender();
    });
}

init();