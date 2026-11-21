'use strict';

/* =========================================================
   Döviz Hesap — reklamsız döviz çevirici + hesap makinesi
   ========================================================= */

const OZ_TO_GRAM = 31.1034768;
const RATE_TTL_MS = 30 * 60 * 1000; // 30 dk'dan eskiyse yenile

const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ---------- Para birimi bilgileri ---------- */
const SPECIAL = {
  GAU: { name: 'Gram Altın', flag: '🥇' },
  GAG: { name: 'Gram Gümüş', flag: '🥈' },
  BTC: { name: 'Bitcoin', flag: '₿' },
  ETH: { name: 'Ethereum', flag: 'Ξ' },
};
const TR_NAMES = {
  TRY: 'Türk Lirası', USD: 'ABD Doları', EUR: 'Euro', GBP: 'İngiliz Sterlini',
  CHF: 'İsviçre Frangı', JPY: 'Japon Yeni', SAR: 'Suudi Riyali', AED: 'BAE Dirhemi',
  RUB: 'Rus Rublesi', CNY: 'Çin Yuanı', CAD: 'Kanada Doları', AUD: 'Avustralya Doları',
  AZN: 'Azerbaycan Manatı', GEL: 'Gürcistan Larisi', KWD: 'Kuveyt Dinarı', QAR: 'Katar Riyali',
};
const FLAG_OVERRIDE = { EUR: '🇪🇺', XAF: '🌍', XOF: '🌍', XCD: '🌎', XPF: '🌏', ANG: '🇨🇼' };

let displayNames = null;
try { displayNames = new Intl.DisplayNames(['tr'], { type: 'currency' }); } catch {}

function curName(code) {
  if (SPECIAL[code]) return SPECIAL[code].name;
  if (TR_NAMES[code]) return TR_NAMES[code];
  try { const n = displayNames && displayNames.of(code); if (n && n !== code) return n; } catch {}
  return code;
}
function curFlag(code) {
  if (SPECIAL[code]) return SPECIAL[code].flag;
  if (FLAG_OVERRIDE[code]) return FLAG_OVERRIDE[code];
  const cc = code.slice(0, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '💵';
  return String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

/* ---------- Kur verisi ---------- */
// rates: 1 USD = rates[CODE] birim
let rates = store.get('rates', null);
let ratesTime = store.get('ratesTime', 0);

const ISO = (() => {
  try { return new Set(Intl.supportedValuesOf('currency')); } catch { return null; }
})();

async function fetchJSON(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctl.signal });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function sourceFawaz() {
  const urls = [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
    'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json',
  ];
  let lastErr;
  for (const u of urls) {
    try {
      const j = await fetchJSON(u);
      const src = j.usd;
      const out = { USD: 1 };
      for (const [k, v] of Object.entries(src)) {
        const K = k.toUpperCase();
        if (!(v > 0)) continue;
        if (K === 'XAU') out.GAU = v * OZ_TO_GRAM;
        else if (K === 'XAG') out.GAG = v * OZ_TO_GRAM;
        else if (K === 'BTC' || K === 'ETH') out[K] = v;
        else if (/^[A-Z]{3}$/.test(K) && (!ISO || ISO.has(K)) && !K.startsWith('X') || ['XAF', 'XOF', 'XCD', 'XPF'].includes(K)) out[K] = v;
      }
      if (!out.TRY) throw new Error('eksik veri');
      return out;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function sourceErApi() {
  const j = await fetchJSON('https://open.er-api.com/v6/latest/USD');
  if (j.result !== 'success') throw new Error('er-api');
  return { ...j.rates, USD: 1 };
}

async function refreshRates(manual = false) {
  const btn = document.getElementById('refresh');
  btn.classList.add('spin');
  try {
    let fresh;
    try { fresh = await sourceFawaz(); }
    catch { fresh = await sourceErApi(); }
    // Yedek kaynakta altın yoksa eski altın değerini koru
    if (rates) for (const k of ['GAU', 'GAG', 'BTC', 'ETH']) if (!fresh[k] && rates[k]) fresh[k] = rates[k];
    rates = fresh;
    ratesTime = Date.now();
    store.set('rates', rates);
    store.set('ratesTime', ratesTime);
    if (manual) toast('Kurlar güncellendi');
  } catch (e) {
    toast(rates ? 'Bağlantı yok — son kayıtlı kurlar kullanılıyor' : 'Kurlar alınamadı. İnternet bağlantını kontrol et.');
  } finally {
    btn.classList.remove('spin');
    updateStatus();
    renderFx();
  }
}

function updateStatus() {
  const el = document.getElementById('updated');
  if (!ratesTime) { el.textContent = 'Kur verisi yok'; return; }
  const d = new Date(ratesTime);
  const same = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  el.textContent = 'Güncelleme: ' + (same ? time : d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) + ' ' + time);
}

/* ---------- Sayı biçimlendirme ---------- */
function fmt(n, opts = {}) {
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  let max = opts.max;
  if (max == null) max = abs === 0 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  const min = opts.max == null && abs >= 1 && Math.abs(n % 1) >= 0.005 ? 2 : 0;
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: max, minimumFractionDigits: min }).format(n);
}
// Hesap ifadesindeki sayıları binlik ayraçla göster
function prettyExpr(s) {
  return s.replace(/\d+(,\d*)?/g, m => {
    const [i, d] = m.split(',');
    const ip = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return d === undefined ? ip : ip + ',' + d;
  });
}

/* ---------- İfade değerlendirici (eval kullanmaz) ---------- */
// Desteklenen: + − × ÷ % ( ) , ve başta/parantezde eksi
function evaluate(src) {
  const s = src.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.');
  let i = 0;
  const peek = () => s[i];
  const eat = c => (s[i] === c ? (i++, true) : false);

  function number() {
    const st = i;
    while (i < s.length && /[0-9.]/.test(s[i])) i++;
    if (st === i) throw new Error('sayı');
    const v = parseFloat(s.slice(st, i));
    if (isNaN(v)) throw new Error('sayı');
    return v;
  }
  function factor() {
    if (eat('-')) { const f = factor(); return { v: -f.v, pct: f.pct }; }
    if (eat('+')) return factor();
    let v;
    if (eat('(')) { v = expr(); eat(')'); } // kapanmamış parantez tolere edilir
    else v = number();
    if (eat('%')) return { v, pct: true };
    return { v, pct: false };
  }
  function term() {
    let f = factor();
    let single = true;
    let v = f.pct ? f.v / 100 : f.v;
    while (peek() === '*' || peek() === '/') {
      single = false;
      const op = s[i++];
      const g = factor();
      const gv = g.pct ? g.v / 100 : g.v;
      v = op === '*' ? v * gv : v / gv;
    }
    return single && f.pct ? { v: f.v, pct: true } : { v, pct: false };
  }
  function expr() {
    let t = term();
    let v = t.pct ? t.v / 100 : t.v;
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const u = term();
      // 200 + 10% = 220 (yüzde, soldaki değerin yüzdesi)
      const uv = u.pct ? v * u.v / 100 : u.v;
      v = op === '+' ? v + uv : v - uv;
    }
    return v;
  }
  if (!s.length) return 0;
  const r = expr();
  if (i !== s.length) throw new Error('sözdizimi');
  return Math.round(r * 1e12) / 1e12;
}
// Yazılırken sondaki yarım operatörü yok sayarak ön izleme
function tryEval(src) {
  let s = src;
  while (s.length && /[+−×÷(,]$/.test(s)) s = s.slice(0, -1);
  if (!s) return null;
  try { const v = evaluate(s); return isFinite(v) ? v : null; } catch { return null; }
}
const hasOp = s => /[+×÷%(]|.−/.test(s);

/* ---------- Ortak giriş mantığı ---------- */
const OPS = '+−×÷';
function applyKey(expr, key) {
  const last = expr.slice(-1);
  switch (key) {
    case 'C': return '0';
    case '⌫': return expr.length <= 1 ? '0' : expr.slice(0, -1);
    case ',': {
      const seg = expr.split(/[+−×÷()%]/).pop();
      if (seg.includes(',')) return expr;
      if (seg === '' ) return expr + '0,';
      return expr + ',';
    }
    case '()': {
      const open = (expr.match(/\(/g) || []).length - (expr.match(/\)/g) || []).length;
      if (expr === '0') return '(';
      if (open > 0 && /[0-9%)]$/.test(expr)) return expr + ')';
      if (/[0-9%)]$/.test(expr)) return expr + '×(';
      return expr + '(';
    }
    case '%':
      if (/[0-9)]$/.test(expr)) return expr + '%';
      return expr;
    default:
      if (OPS.includes(key)) {
        if (expr === '0' && key === '−') return '−';
        if (last === '(' && key === '−') return expr + '−';
        if (last === '(') return expr;
        if (OPS.includes(last)) return expr.length === 1 ? (key === '−' ? '−' : '0') : expr.slice(0, -1) + key;
        if (last === ',') return expr.slice(0, -1) + key;
        return expr + key;
      }
      // rakam
      if (expr === '0') return key;
      if (expr.length > 60) return expr;
      if (last === ')' || last === '%') return expr + '×' + key;
      // "5+0" sonrası "3" → "5+3"
      if (last === '0' && /(^|[+−×÷(])0$/.test(expr)) return expr.slice(0, -1) + key;
      return expr + key;
  }
}
function numToExpr(n) {
  if (!isFinite(n)) return '0';
  let s = String(Math.round(n * 1e10) / 1e10);
  if (s.includes('e')) s = n.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('-', '−').replace('.', ',');
}

/* ---------- Tuş takımı ---------- */
const KEYS = [
  ['C', 'fn'], ['()', 'fn'], ['%', 'fn'], ['÷', 'op'],
  ['7'], ['8'], ['9'], ['×', 'op'],
  ['4'], ['5'], ['6'], ['−', 'op'],
  ['1'], ['2'], ['3'], ['+', 'op'],
  ['⌫', 'fn'], ['0'], [','], ['=', 'eq'],
];
function buildKeypad() {
  const kp = document.getElementById('keypad');
  for (const [k, cls] of KEYS) {
    const b = document.createElement('button');
    b.className = 'key' + (cls ? ' ' + cls : '');
    b.textContent = k === '()' ? '( )' : k;
    b.dataset.k = k;
    kp.appendChild(b);
  }
  kp.addEventListener('pointerdown', e => {
    const b = e.target.closest('.key');
    if (!b) return;
    e.preventDefault();
    if (navigator.vibrate) navigator.vibrate(6);
    onKey(b.dataset.k);
  });
  // ⌫ uzun basınca tümünü sil
  let timer;
  kp.addEventListener('pointerdown', e => {
    const b = e.target.closest('.key');
    if (b && b.dataset.k === '⌫') timer = setTimeout(() => onKey('C'), 550);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => kp.addEventListener(ev, () => clearTimeout(timer)));
}

let currentTab = 'fx';
function onKey(k) {
  if (currentTab === 'fx') fxKey(k); else calcKey(k);
}

/* ---------- Döviz ---------- */
let favs = store.get('favs', ['TRY', 'USD', 'EUR', 'GBP', 'GAU']);
let active = store.get('active', 'USD');
let fxExpr = store.get('fxExpr', '1');
if (!favs.includes(active)) active = favs[0];

function convert(amount, from, to) {
  if (!rates || !rates[from] || !rates[to]) return NaN;
  return amount * rates[to] / rates[from];
}

function renderFx() {
  const list = document.getElementById('fx-list');
  const amount = tryEval(fxExpr) ?? 0;
  list.innerHTML = '';
  for (const code of favs) {
    const li = document.createElement('li');
    li.className = 'fx-row' + (code === active ? ' active' : '');
    li.dataset.code = code;
    let amt, sub = '';
    if (code === active) {
      amt = hasOp(fxExpr) ? fmt(amount) : prettyExpr(fxExpr);
      sub = hasOp(fxExpr) ? prettyExpr(fxExpr) : '';
    } else {
      const v = convert(amount, active, code);
      amt = fmt(v);
      const unit = convert(1, code, active);
      sub = isFinite(unit) ? `1 ${code} = ${fmt(unit)} ${active}` : 'kur yok';
    }
    li.innerHTML = `
      <div class="fx-flag">${curFlag(code)}</div>
      <div class="fx-id"><div class="fx-code">${code}</div><div class="fx-name">${curName(code)}</div></div>
      <div class="fx-val"><div class="fx-amount">${amt}</div><div class="fx-expr">${sub}</div></div>
      <button class="fx-del">Kaldır</button>`;
    list.appendChild(li);
  }
  if (!document.getElementById('fx-hint')) {
    const p = document.createElement('p');
    p.id = 'fx-hint'; p.className = 'hint';
    p.textContent = 'Satıra dokun: o para birimini gir • Sola kaydır: kaldır';
    list.after(p);
  }
}

function setActive(code) {
  if (code === active) return;
  const amount = tryEval(fxExpr) ?? 0;
  const v = convert(amount, active, code);
  active = code;
  fxExpr = isFinite(v) && v !== 0 ? numToExpr(Math.round(v * 100) / 100 || v) : '0';
  saveFx();
  renderFx();
}
function saveFx() { store.set('favs', favs); store.set('active', active); store.set('fxExpr', fxExpr); }

function fxKey(k) {
  if (k === '=') {
    const v = tryEval(fxExpr);
    fxExpr = v == null ? '0' : numToExpr(v);
  } else fxExpr = applyKey(fxExpr, k);
  saveFx();
  renderFx();
}

function setupFxList() {
  const list = document.getElementById('fx-list');
  let sx = 0, sy = 0, row = null, dx = 0, swiping = false;
  list.addEventListener('pointerdown', e => {
    row = e.target.closest('.fx-row'); if (!row) return;
    sx = e.clientX; sy = e.clientY; dx = 0; swiping = false;
  });
  list.addEventListener('pointermove', e => {
    if (!row) return;
    dx = e.clientX - sx;
    if (!swiping && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(e.clientY - sy)) swiping = true;
    if (swiping) row.style.transform = `translateX(${Math.min(0, Math.max(-90, dx))}px)`;
  });
  const end = e => {
    if (!row) return;
    const r = row; row = null;
    r.style.transform = '';
    if (e.target.closest('.fx-del')) {
      removeFav(r.dataset.code); return;
    }
    if (swiping) {
      document.querySelectorAll('.fx-row.show-del').forEach(x => x !== r && x.classList.remove('show-del'));
      if (dx < -50) r.classList.add('show-del'); else r.classList.remove('show-del');
      return;
    }
    if (r.classList.contains('show-del')) { r.classList.remove('show-del'); return; }
    setActive(r.dataset.code);
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', () => { if (row) row.style.transform = ''; row = null; });
}

function removeFav(code) {
  if (favs.length <= 2) { toast('En az 2 para birimi kalmalı'); renderFx(); return; }
  favs = favs.filter(c => c !== code);
  if (active === code) { active = favs[0]; fxExpr = '1'; }
  saveFx(); renderFx();
}

/* ---------- Para birimi seçici ---------- */
const POPULAR = ['TRY', 'USD', 'EUR', 'GBP', 'GAU', 'GAG', 'CHF', 'JPY', 'SAR', 'AED', 'RUB', 'CNY', 'CAD', 'AUD', 'AZN', 'BTC', 'ETH'];
function openPicker() {
  document.getElementById('picker').classList.remove('hidden');
  const inp = document.getElementById('picker-search');
  inp.value = '';
  renderPicker('');
}
function closePicker() { document.getElementById('picker').classList.add('hidden'); }
function norm(s) { return s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i'); }
function renderPicker(q) {
  const ul = document.getElementById('picker-list');
  const all = rates ? Object.keys(rates) : POPULAR;
  const rest = all.filter(c => !POPULAR.includes(c)).sort((a, b) => curName(a).localeCompare(curName(b), 'tr'));
  const codes = [...POPULAR.filter(c => all.includes(c)), ...rest];
  const nq = norm(q.trim());
  ul.innerHTML = '';
  for (const c of codes) {
    if (nq && !norm(c + ' ' + curName(c)).includes(nq)) continue;
    const li = document.createElement('li');
    li.dataset.code = c;
    li.innerHTML = `<span class="fx-flag">${curFlag(c)}</span><b>${c}</b><span class="p-name">${curName(c)}</span><span class="p-check">${favs.includes(c) ? '✓' : ''}</span>`;
    ul.appendChild(li);
  }
}
function setupPicker() {
  document.getElementById('add-cur').onclick = openPicker;
  document.getElementById('picker-close').onclick = closePicker;
  document.getElementById('picker').addEventListener('click', e => { if (e.target.id === 'picker') closePicker(); });
  document.getElementById('picker-search').addEventListener('input', e => renderPicker(e.target.value));
  document.getElementById('picker-list').addEventListener('click', e => {
    const li = e.target.closest('li'); if (!li) return;
    const c = li.dataset.code;
    if (favs.includes(c)) { removeFav(c); }
    else { favs.push(c); saveFx(); renderFx(); }
    li.querySelector('.p-check').textContent = favs.includes(c) ? '✓' : '';
  });
}

/* ---------- Hesap makinesi ---------- */
let calcExpr = store.get('calcExpr', '0');
let calcHist = store.get('calcHist', []);
let justEvaluated = false;

function renderCalc() {
  document.getElementById('calc-expr').textContent = prettyExpr(calcExpr);
  const v = tryEval(calcExpr);
  document.getElementById('calc-preview').textContent = v != null && hasOp(calcExpr) ? '= ' + fmt(v, { max: 10 }) : '';
  const h = document.getElementById('calc-history');
  h.innerHTML = calcHist.slice(-30).map((x, i) =>
    `<div class="h-item" data-i="${i}">${prettyExpr(x.e)} =<div class="h-res">${fmt(x.r, { max: 10 })}</div></div>`).join('');
  h.scrollTop = h.scrollHeight;
}
function calcKey(k) {
  if (k === '=') {
    const v = tryEval(calcExpr);
    if (v == null || !hasOp(calcExpr)) return;
    calcHist.push({ e: calcExpr, r: v });
    if (calcHist.length > 100) calcHist = calcHist.slice(-100);
    calcExpr = numToExpr(v);
    justEvaluated = true;
  } else {
    // Sonuçtan sonra rakama basınca yeni hesap başlar
    if (justEvaluated && /^[0-9,]$/.test(k)) calcExpr = '0';
    justEvaluated = false;
    calcExpr = applyKey(calcExpr, k);
  }
  store.set('calcExpr', calcExpr); store.set('calcHist', calcHist);
  renderCalc();
}
function setupCalc() {
  document.getElementById('calc-clear-hist').onclick = () => { calcHist = []; store.set('calcHist', calcHist); renderCalc(); };
  document.getElementById('calc-to-fx').onclick = () => {
    const v = tryEval(calcExpr);
    if (v == null) return;
    fxExpr = numToExpr(v); saveFx(); renderFx(); switchTab('fx');
    toast(`${fmt(v, { max: 10 })} ${active} olarak aktarıldı`);
  };
  document.getElementById('calc-history').addEventListener('click', e => {
    const it = e.target.closest('.h-item'); if (!it) return;
    const x = calcHist.slice(-30)[+it.dataset.i];
    calcExpr = numToExpr(x.r); justEvaluated = true; store.set('calcExpr', calcExpr); renderCalc();
  });
}

/* ---------- Sekmeler ---------- */
function switchTab(t) {
  currentTab = t;
  store.set('tab', t);
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + t));
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  document.getElementById('title').textContent = t === 'fx' ? 'Döviz' : 'Hesap Makinesi';
}

/* ---------- Klavye desteği (masaüstü) ---------- */
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const map = { '*': '×', '/': '÷', '-': '−', '+': '+', '.': ',', ',': ',', Enter: '=', '=': '=', Backspace: '⌫', Escape: 'C', '%': '%', '(': '()', ')': '()' };
  const k = /^[0-9]$/.test(e.key) ? e.key : map[e.key];
  if (k) { e.preventDefault(); onKey(k); }
});

/* ---------- Bildirim ---------- */
let toastT;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------- Başlat ---------- */
function init() {
  buildKeypad();
  setupFxList();
  setupPicker();
  setupCalc();
  document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
  document.getElementById('refresh').onclick = () => refreshRates(true);
  switchTab(store.get('tab', 'fx'));
  updateStatus();
  renderFx();
  renderCalc();
  if (!rates || Date.now() - ratesTime > RATE_TTL_MS) refreshRates();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - ratesTime > RATE_TTL_MS) refreshRates();
  });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
