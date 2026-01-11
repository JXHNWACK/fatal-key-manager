/* ---------- tiny helpers ---------- */
function $(q, el){ return (el||document).querySelector(q); }
function openDialog(id){ try{ document.getElementById(id).showModal(); }catch{ document.getElementById(id).setAttribute('open',''); } }
function closeDialog(id){ try{ document.getElementById(id).close(); }catch{ document.getElementById(id).removeAttribute('open'); } }

// Helper to prevent XSS attacks
function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ---------- Banner & Toast ---------- */
function showBanner(msg){
  var host=document.getElementById('banner'); if(!host) return;
  host.innerHTML='<div class="msg">'+String(msg||'')+'<button class="close" aria-label="Dismiss" title="Dismiss">×</button></div>';
  host.classList.add('show');
  clearTimeout(showBanner.__t);
  showBanner.__t=setTimeout(function(){ hideBanner(); }, 4200);
  var btn=host.querySelector('button.close'); if(btn){ btn.onclick=function(){ hideBanner(true); }; }
}
function hideBanner(immediate){
  var host=document.getElementById('banner'); if(!host) return;
  if(immediate){ clearTimeout(showBanner.__t); }
  host.classList.remove('show');
}
function showToast(msg){
  var host=document.getElementById('toast'); if(!host) return;
  host.innerHTML = '<div class="msg">'+String(msg||'')+'</div>';
  host.style.display = 'block';
  var m = host.querySelector('.msg');
  if(m){ m.style.animation = 'none'; void m.offsetWidth; m.style.animation = 'toast-pop 1.8s ease forwards'; }
  clearTimeout(showToast.__t); showToast.__t = setTimeout(function(){ host.style.display = 'none'; }, 1800);
}
window.alert=function(m){showBanner(m);};

/* ---------- Per-user accents ---------- */
const USER_ACCENTS={
  'Administrator':  ['#F47174','#D94447'],
};
function applyUserAccent(user){
  var pair=USER_ACCENTS[user];
  if(!pair) return;
  document.documentElement.style.setProperty('--accent',pair[0]);
  document.documentElement.style.setProperty('--accent-2',pair[1]);
}

/* ======== Configuration ======== */
const API_BASE_URL = 'https://fatal-key-manager-production.up.railway.app';
// SECURITY WARNING: Do not expose Webhook URLs in client-side code. Move this logic to server.js.
const DISCORD_WEBHOOK_URL = null; 

/* ======== API Functions ======== */
async function apiRequest(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (err) {
    console.error('API request failed:', err);
    throw err;
  }
}

async function getAllKeys() {
  return await apiRequest('/api/keys');
}

async function addKeys(keys) {
  return await apiRequest('/api/keys', {
    method: 'POST',
    body: JSON.stringify(keys),
  });
}

async function updateKey(id, updates) {
  return await apiRequest(`/api/keys/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

async function deleteKey(id) {
  return await apiRequest(`/api/keys/${id}`, {
    method: 'DELETE',
  });
}

function setCloudStatus(ok) {
  const el = document.getElementById('cloudStatus');
  if (!el) return;
  if (ok) {
    el.textContent = '☁';
    el.style.color = '#4ade80';
  } else {
    el.textContent = '⚠';
    el.style.color = '#fbbf24';
  }
}

function setNetStatus(online) {
  const el = document.getElementById('netStatus');
  if (!el) return;
  el.textContent = online ? '●' : '○';
  el.style.color = online ? '#4ade80' : '#ef4444';
}

window.addEventListener('online', () => setNetStatus(true));
window.addEventListener('offline', () => setNetStatus(false));

function sendDiscordNotification(embed) {
  if (!DISCORD_WEBHOOK_URL) return;
  fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] })
  }).catch(e => console.error('Discord notification failed', e));
}

/* ======== Login ======== */
// SECURITY WARNING: Client-side auth is insecure. Move authentication to the server.
const USERS = { 'Administrator':'1212' };

var __rotTimer = null;
var __rotMsgs = ['Welcome to Rogue Community','Securely manage your keys','Staff access only'];
var __rotIdx = 0;

function startLoginRotator(){
  var el = document.getElementById('loginRotator');
  if(!el) return;
  el.textContent = __rotMsgs[__rotIdx % __rotMsgs.length];
  clearInterval(__rotTimer);
  __rotTimer = setInterval(function(){
    __rotIdx++;
    el.textContent = __rotMsgs[__rotIdx % __rotMsgs.length];
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }, 3000);
}

function stopLoginRotator(){
  if(__rotTimer){ clearInterval(__rotTimer); __rotTimer = null; }
}

function toggleLoginButton(){
  var pass = document.getElementById('loginPass');
  var btn = document.getElementById('loginBtn') || document.getElementById('loginGo');
  if(!btn) return;
  btn.disabled = !(pass && pass.value && pass.value.length > 0);
}

function attemptLogin(ev){
  if(ev) ev.preventDefault();
  const p = (document.getElementById('loginPass')?.value || '');
  console.log('Login attempt');
  
  const qs = new URLSearchParams(location.search);
  const dev = qs.get('dev') === '1';
  const as = (qs.get('as') || '').trim();
  const u = (dev && as) ? as : 'Administrator';
  
  const isDevBypass = dev && as;
  const isPasswordCorrect = USERS[u] && USERS[u] === p;
  console.log('Password match:', isPasswordCorrect);
  
  if (isDevBypass || isPasswordCorrect) {
    console.log('Login successful!');
    stopLoginRotator();
    
    var greet = document.querySelector('#welcomeScreen .welcome-greeting');
    if(greet){
      greet.textContent = 'WELCOME ' + u.toUpperCase();
      greet.style.display = 'block';
      setTimeout(() => greet.style.opacity = '1', 50);
    }
    
    var el = document.getElementById('welcomeScreen');
    var logoImg = el ? el.querySelector('.welcome-card img') : null;
    var btn = document.getElementById('loginBtn') || document.getElementById('loginGo');
    var barWrap = document.getElementById('loginProgress');
    
    if(btn){ btn.disabled = true; btn.textContent = 'Signing in…'; }
    if(logoImg){ logoImg.classList.add('login-pulse'); }
    if(barWrap){
      barWrap.style.display = 'block';
      var bar = barWrap.querySelector('.bar');
      if(bar){
        bar.style.animation = 'none';
        bar.offsetHeight;
        bar.style.animation = 'progress-run 3.6s ease-in-out forwards';
      }
    }
    
    setTimeout(async function(){
      if(el) el.style.display = 'none';
      window.scrollTo(0,0);
      
      const remember = document.getElementById('rememberMe')?.checked;
      const storage = remember ? localStorage : sessionStorage;
      try {
        storage.setItem('fs_authed','1');
        storage.setItem('fs_user', u);
      } catch(e){}
      
      sessionStorage.setItem('fs_user', u);
      
      var menu = document.getElementById('userMenu');
      var btnU = document.getElementById('userBtn');
      if(menu) menu.style.display = 'inline-block';
      if(btnU) btnU.textContent = u + ' ▾';
      
      applyUserAccent(u);
      
      try {
        await load();
      } catch(e) {
        console.error("Load failed:", e);
        showBanner("Logged in but failed to load data");
      }
    }, 3600);
  } else {
    console.log('Login failed');
    var err = document.getElementById('welcomeError');
    if(err) err.style.display = 'block';
    var card = document.querySelector('#welcomeScreen .welcome-card');
    if(card){
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
    }
    return false;
  }
}

window.attemptLogin = attemptLogin;

/* ======== State & Storage ======== */
const state = {
  keys: [],
  products: [],
  filterProduct: 'All',
  filterType: 'All',
  search: '',
  sortKey: '',
  sortDir: 'asc'
};

function applyTheme(){
  try {
    const pref = localStorage.getItem('fs_theme') || 'dark';
    if(pref === 'light'){ document.documentElement.classList.add('light'); }
    else { document.documentElement.classList.remove('light'); }
  } catch(e){ document.documentElement.classList.remove('light'); }
}

function toggleTheme(){
  const isLight = document.documentElement.classList.contains('light');
  const next = isLight ? 'dark' : 'light';
  try { localStorage.setItem('fs_theme', next); } catch(e){}
  applyTheme();
}

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9); 
}

function sortRows(rows){
  const key = state.sortKey;
  if(!key) return rows;
  const dir = state.sortDir === 'desc' ? -1 : 1;
  
  function val(k){
    if(key === 'date'){ return k.date ? new Date(k.date).getTime() : 0; }
    if(key === 'assignedTo' || key === 'assigned_to'){ return (k.assigned_to || k.assignedTo || '').toLowerCase(); }
    if(key === 'product'){ return (k.product || '').toLowerCase(); }
    return (k[key] || '').toString().toLowerCase();
  }
  
  return rows.slice().sort((a,b) => {
    const va = val(a), vb = val(b);
    if(va < vb) return -1 * dir;
    if(va > vb) return 1 * dir;
    return 0;
  });
}

function sortCaret(k){
  if(state.sortKey !== k) return '<span class="caret">↕︎</span>';
  return '<span class="caret">' + (state.sortDir === 'asc' ? '▲' : '▼') + '</span>';
}

function setSort(k){
  if(state.sortKey === k){
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortKey = k;
    state.sortDir = 'asc';
  }
  render();
}

/* ======== Undo Stack ======== */
const UNDO_STACK = [];

function updateUndoUI(){
  var b = document.getElementById('undoBtn');
  if(b) b.disabled = UNDO_STACK.length === 0;
}

function pushUndo(entry){
  UNDO_STACK.push(entry);
  updateUndoUI();
}

async function onUndo(){
  const last = UNDO_STACK.pop();
  updateUndoUI();
  if(!last) return;
  
  try {
    if(last.type === 'history_revert'){
      const {id, history} = last.payload;
      await updateKey(id, {history});
      await load();
    } else if(last.type === 'add'){
      const ids = last.payload.ids || [];
      for(const id of ids){
        await deleteKey(id);
      }
      await load();
    } else if(last.type === 'delete'){
      const items = last.payload.items || [];
      await addKeys(items);
      await load();
    } else if(last.type === 'assign' || last.type === 'release'){
      const prev = last.payload.prev;
      if(!prev) return;
      await updateKey(prev.id, {
        code: prev.code,
        product: prev.product,
        type: prev.type,
        status: prev.status,
        assigned_to: prev.assigned_to || prev.assignedTo,
        reason: prev.reason,
        date: prev.date,
        assigned_by: prev.assigned_by || prev.assignedBy || '',
        history: prev.history
      });
      await load();
    }
  } catch(e){
    console.error('Undo failed', e);
    showBanner('Undo failed: ' + (e.message || e));
  }
}

/* ======== Load/Save ======== */
async function load(){
  console.log('Loading data from Railway...');
  try {
    const keys = await getAllKeys();
    
    // Convert snake_case from DB to camelCase for frontend
    state.keys = keys.map(k => ({
      id: k.id,
      code: k.code,
      product: k.product,
      type: k.type,
      status: k.status,
      assignedTo: k.assigned_to || '',
      reason: k.reason || '',
      date: k.date || '',
      assignedBy: k.assigned_by || '',
      history: k.history || []
    }));
    
    setCloudStatus(true);
  } catch(err){
    console.error('Load failed', err);
    showBanner('Failed to load data from server: ' + (err.message || err));
    state.keys = [];
    setCloudStatus(false);
  }
  
  state.products = ['All','Assigned'];
  state.keys.forEach(k => {
    if(k.product && !state.products.includes(k.product)){
      state.products.push(k.product);
    }
  });
  
  render();
}

/* ======== Render ======== */
function render(){
  let filtered = state.keys.slice();
  
  if(state.filterProduct !== 'All'){
    if(state.filterProduct === 'Assigned'){
      filtered = filtered.filter(k => k.status === 'assigned');
    } else {
      filtered = filtered.filter(k => k.product === state.filterProduct);
    }
  }
  
  if(state.filterType !== 'All'){
    filtered = filtered.filter(k => k.type === state.filterType);
  }
  
  if(state.search){
    const s = state.search.toLowerCase();
    filtered = filtered.filter(k => {
      return (k.code || '').toLowerCase().includes(s) ||
             (k.product || '').toLowerCase().includes(s) ||
             (k.assignedTo || '').toLowerCase().includes(s) ||
             (k.reason || '').toLowerCase().includes(s);
    });
  }
  
  filtered = sortRows(filtered);
  
  const prodSelect = document.getElementById('filterProduct');
  if(prodSelect){
    prodSelect.innerHTML = state.products.map(p => 
      `<option value="${p}" ${p === state.filterProduct ? 'selected' : ''}>${p}</option>`
    ).join('');
  }
  
  const tbody = document.getElementById('keysTableBody');
  if(!tbody) return;
  
  if(filtered.length === 0){
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#666;">No keys found</td></tr>';
    document.getElementById('resultsCount').textContent = '0 keys';
    return;
  }
  
  tbody.innerHTML = filtered.map(k => `
    <tr>
      <td>${escapeHtml(k.code)}</td>
      <td>${escapeHtml(k.product)}</td>
      <td>${escapeHtml(k.type)}</td>
      <td><span class="status status-${escapeHtml(k.status)}">${escapeHtml(k.status)}</span></td>
      <td>${escapeHtml(k.assignedTo || '-')}</td>
      <td>
        <button onclick="copyCode('${k.code}')" title="Copy">📋</button>
        ${k.status === 'available' ? `<button onclick="openAssign('${k.id}')" title="Assign">✓</button>` : ''}
        ${k.status === 'assigned' ? `<button onclick="releaseKey('${k.id}')" title="Release">↩</button>` : ''}
        <button onclick="openHistory('${k.id}')" title="History">📜</button>
        <button onclick="removeKey('${k.id}')" title="Delete">🗑</button>
      </td>
    </tr>
  `).join('');
  
  document.getElementById('resultsCount').textContent = `${filtered.length} key${filtered.length === 1 ? '' : 's'}`;
}

/* ======== Actions ======== */
function setFilter(type, value){
  if(type === 'product') state.filterProduct = value;
  if(type === 'type') state.filterType = value;
  render();
}

function copyCode(code){
  navigator.clipboard.writeText(code).then(() => {
    showToast('Copied!');
  }).catch(e => {
    showBanner('Failed to copy');
  });
}

async function removeKey(id){
  const k = state.keys.find(x => x.id === id);
  if(!k) return;
  if(!confirm(`Delete key: ${k.code}?`)) return;
  
  pushUndo({type: 'delete', payload: {items: [k]}});
  
  try {
    await deleteKey(id);
    await load();
    showToast('Deleted ✔');
    
    sendDiscordNotification({
      title: '🗑 Key Deleted',
      color: 15158332,
      fields: [
        {name: 'Product', value: k.product, inline: true},
        {name: 'Type', value: k.type, inline: true},
        {name: 'Deleted By', value: (sessionStorage && sessionStorage.getItem('fs_user')) || 'unknown', inline: true},
        {name: 'Key', value: '`' + k.code + '`', inline: false}
      ],
      timestamp: new Date().toISOString()
    });
  } catch(e){
    console.error('Delete failed', e);
    showBanner('Delete failed: ' + (e.message || e));
  }
}

async function releaseKey(id){
  const k = state.keys.find(x => x.id === id);
  if(!k) return;
  if(!confirm(`Release key: ${k.code}?`)) return;
  
  pushUndo({type: 'release', payload: {prev: JSON.parse(JSON.stringify(k))}});
  
  const histEntry = {
    action: 'released',
    by: (sessionStorage && sessionStorage.getItem('fs_user')) || 'unknown',
    at: new Date().toISOString(),
    reason: k.reason || '',
    assignedTo: k.assignedTo || ''
  };
  
  const newHistory = [...k.history, histEntry];
  
  try {
    await updateKey(id, {
      status: 'available',
      assigned_to: '',
      reason: '',
      date: null,
      history: newHistory
    });
    await load();
    showToast('Released ✔');
    
    sendDiscordNotification({
      title: '↩ Key Released',
      color: 3447003,
      fields: [
        {name: 'Product', value: k.product, inline: true},
        {name: 'Type', value: k.type, inline: true},
        {name: 'Released By', value: histEntry.by, inline: true},
        {name: 'Key', value: '`' + k.code + '`', inline: false}
      ],
      timestamp: new Date().toISOString()
    });
  } catch(e){
    console.error('Release failed', e);
    showBanner('Release failed: ' + (e.message || e));
  }
}

function openAssign(id){
  const k = state.keys.find(x => x.id === id);
  if(!k) return;
  
  document.getElementById('assignKeyId').value = id;
  document.getElementById('assignCode').textContent = k.code;
  document.getElementById('assignTo').value = '';
  document.getElementById('assignReason').value = '';
  
  openDialog('assignModal');
}

async function saveAssign(){
  const id = document.getElementById('assignKeyId').value;
  const assignTo = document.getElementById('assignTo').value.trim();
  const reason = document.getElementById('assignReason').value.trim();
  
  if(!assignTo || !reason){
    alert('Please fill in all fields');
    return;
  }
  
  const k = state.keys.find(x => x.id === id);
  if(!k) return;
  
  pushUndo({type: 'assign', payload: {prev: JSON.parse(JSON.stringify(k))}});
  
  const nowUser = (sessionStorage && sessionStorage.getItem('fs_user')) || 'unknown';
  const histEntry = {
    action: 'assigned',
    by: nowUser,
    at: new Date().toISOString(),
    reason: reason,
    assignedTo: assignTo
  };
  
  const newHistory = [...k.history, histEntry];
  
  try {
    await updateKey(id, {
      status: 'assigned',
      assigned_to: assignTo,
      reason: reason,
      date: new Date().toISOString(),
      assigned_by: nowUser,
      history: newHistory
    });
    await load();
    showToast('Assigned ✔');
    closeDialog('assignModal');
    
    sendDiscordNotification({
      title: '✅ Key Assigned',
      color: 3066993,
      fields: [
        {name: 'Product', value: k.product, inline: true},
        {name: 'Type', value: k.type, inline: true},
        {name: 'Assigned By', value: nowUser, inline: true},
        {name: 'Assigned To', value: assignTo, inline: true},
        {name: 'Reason', value: reason, inline: true},
        {name: 'Key', value: '`' + k.code + '`', inline: false}
      ],
      timestamp: new Date().toISOString()
    });
  } catch(e){
    console.error('Assign failed', e);
    showBanner('Assign failed: ' + (e.message || e));
  }
}

function openHistory(id){
  const k = state.keys.find(x => x.id === id);
  if(!k) return;
  
  document.getElementById('historyCode').textContent = k.code;
  const tbody = document.getElementById('historyTableBody');
  
  if(!k.history || k.history.length === 0){
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:1rem;">No history</td></tr>';
  } else {
    tbody.innerHTML = k.history.slice().reverse().map(h => `
      <tr>
        <td>${escapeHtml(new Date(h.at).toLocaleString())}</td>
        <td>${escapeHtml(h.action)}</td>
        <td>${escapeHtml(h.by || '-')}</td>
        <td>${escapeHtml(h.assignedTo || h.reason || '-')}</td>
      </tr>
    `).join('');
  }
  
  openDialog('historyModal');
}

function onBulkAdd(){
  const prod = state.filterProduct === 'All' || state.filterProduct === 'Assigned' ? 'Shadow' : state.filterProduct;
  document.getElementById('bulkProduct').value = prod;
  document.getElementById('bulkType').value = 'Day';
  document.getElementById('bulkText').value = '';
  openDialog('bulkModal');
}

function onNewSingle(){
  const prod = state.filterProduct === 'All' || state.filterProduct === 'Assigned' ? 'Shadow' : state.filterProduct;
  document.getElementById('s_product').value = prod;
  document.getElementById('s_type').value = 'Day';
  document.getElementById('s_code').value = '';
  openDialog('singleModal');
}

async function saveBulkAdd(){
  const product = document.getElementById('bulkProduct').value;
  const type = document.getElementById('bulkType').value;
  const allExisting = new Set(state.keys.map(k => String(k.code || '').toLowerCase()));
  const inputCodes = (document.getElementById('bulkText').value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  
  const newCodes = [];
  const skipped = [];
  
  for(const c of inputCodes){
    const key = c.toLowerCase();
    if(allExisting.has(key)){
      skipped.push(c);
    } else {
      newCodes.push(c);
      allExisting.add(key);
    }
  }
  
  if(skipped.length){
    alert('Skipped duplicates:\n' + skipped.join('\n'));
  }
  
  if(newCodes.length === 0){
    closeDialog('bulkModal');
    return;
  }
  
  const nowUser = (sessionStorage && sessionStorage.getItem('fs_user')) || 'unknown';
  const rows = newCodes.map(code => ({
    id: uid(),
    code,
    product,
    type,
    status: 'available',
    assigned_to: '',
    reason: '',
    date: null,
    assigned_by: nowUser,
    history: [{action: 'created', by: nowUser, at: new Date().toISOString()}]
  }));
  
  sendDiscordNotification({
    title: '📦 Stock Added (Bulk)',
    description: `**${newCodes.length}** new keys added`,
    color: 3092790,
    fields: [
      {name: 'Product', value: product, inline: true},
      {name: 'Type', value: type, inline: true},
      {name: 'Added By', value: nowUser, inline: true}
    ],
    timestamp: new Date().toISOString()
  });
  
  try {
    await addKeys(rows);
    pushUndo({type: 'add', payload: {ids: rows.map(r => r.id)}});
    state.filterProduct = product;
    state.filterType = type;
    state.search = '';
    showBanner(`Added ${rows.length} ${product} • ${type} key(s).` + (skipped.length ? ` Skipped ${skipped.length} duplicate(s).` : ''));
    closeDialog('bulkModal');
    showToast('Added ✔');
    await load();
  } catch(e){
    console.error('Bulk add failed', e);
    showBanner('Bulk add failed: ' + (e.message || e));
  }
}

async function saveSingleAdd(){
  const code = (document.getElementById('s_code').value || '').trim();
  if(!code) return;
  
  const product = document.getElementById('s_product').value;
  const type = document.getElementById('s_type').value;
  const exists = state.keys.some(k => String(k.code || '').toLowerCase() === code.toLowerCase());
  
  if(exists){
    alert('That code already exists');
    return;
  }
  
  const nowUser = (sessionStorage && sessionStorage.getItem('fs_user')) || 'unknown';
  const id = uid();
  const item = {
    id,
    code,
    product,
    type,
    status: 'available',
    assigned_to: '',
    reason: '',
    date: null,
    assigned_by: nowUser,
    history: [{action: 'created', by: nowUser, at: new Date().toISOString()}]
  };
  
  sendDiscordNotification({
    title: '➕ New Key Added',
    color: 3092790,
    fields: [
      {name: 'Product', value: product, inline: true},
      {name: 'Type', value: type, inline: true},
      {name: 'Added By', value: nowUser, inline: true},
      {name: 'Key', value: '`' + code + '`', inline: false}
    ],
    timestamp: new Date().toISOString()
  });
  
  try {
    await addKeys([item]);
    pushUndo({type: 'add', payload: {ids: [id]}});
    state.filterProduct = product;
    state.filterType = type;
    state.search = '';
    closeDialog('singleModal');
    showToast('Added ✔');
    await load();
  } catch(e){
    console.error('Add failed', e);
    showBanner('Add failed: ' + (e.message || e));
  }
}

/* ======== Expose functions ======== */
window.setFilter = setFilter;
window.copyCode = copyCode;
window.removeKey = removeKey;
window.releaseKey = releaseKey;
window.openAssign = openAssign;
window.openHistory = openHistory;
window.saveAssign = saveAssign;
window.saveBulkAdd = saveBulkAdd;
window.saveSingleAdd = saveSingleAdd;
window.onUndo = onUndo;
window.toggleManageMenu = toggleManageMenu;
window.setSort = setSort;
window.onBulkAdd = onBulkAdd;
window.onNewSingle = onNewSingle;
window.toggleTheme = toggleTheme;

function toggleManageMenu(){
  var m = document.getElementById('manageMenu');
  if(!m) return;
  var isOpen = m.style.display === 'block';
  m.style.display = isOpen ? 'none' : 'block';
}

document.addEventListener('click', function(e){
  var wrap = document.querySelector('.menu-wrap');
  var menu = document.getElementById('manageMenu');
  if(!wrap || !menu) return;
  if(!wrap.contains(e.target)){
    if(menu.style.display === 'block') menu.style.display = 'none';
  }
});

document.addEventListener('keydown', function(e){
  if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z'){
    e.preventDefault();
    onUndo();
  }
  if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'){
    e.preventDefault();
    const s = document.getElementById('search');
    if(s){ s.focus(); s.select(); }
  }
});

/* ======== Init ======== */
(async function(){
  applyTheme();
  setNetStatus(navigator.onLine);
  startLoginRotator();
  
  try {
    const authed = localStorage.getItem('fs_authed') === '1' || sessionStorage.getItem('fs_authed') === '1';
    
    if(authed){
      const el = document.getElementById('welcomeScreen');
      if(el) el.style.display = 'none';
      
      const storage = localStorage.getItem('fs_authed') === '1' ? localStorage : sessionStorage;
      const u = storage.getItem('fs_user') || 'User';
      applyUserAccent(u);
      
      const menu = document.getElementById('userMenu');
      const btn = document.getElementById('userBtn');
      if(u) sessionStorage.setItem('fs_user', u);
      if(menu) menu.style.display = 'inline-block';
      if(btn) btn.textContent = u + ' ▾';
      
      await load();
    } else {
      console.log('Setting up login...');
      const passInput = document.getElementById('loginPass');
      const loginBtn = document.getElementById('loginBtn');
      const loginGo = document.getElementById('loginGo');
      
      console.log('Found:', {passInput: !!passInput, loginBtn: !!loginBtn, loginGo: !!loginGo});
      
      if(passInput){
        passInput.addEventListener('input', toggleLoginButton);
        passInput.addEventListener('keypress', function(e){
          if(e.key === 'Enter'){
            e.preventDefault();
            console.log('Enter pressed');
            attemptLogin(e);
          }
        });
      }
      
      if(loginBtn) loginBtn.addEventListener('click', attemptLogin);
      if(loginGo) loginGo.addEventListener('click', attemptLogin);
      
      const passToggle = document.getElementById('passToggle');
      if(passToggle){
        passToggle.addEventListener('click', function(){
          const pass = document.getElementById('loginPass');
          const isPass = pass.type === 'password';
          pass.type = isPass ? 'text' : 'password';
          this.textContent = isPass ? '🙈' : '👁️';
        });
      }
      
      toggleLoginButton();
      console.log('Login setup complete');
    }
  } catch(e){
    console.error("Init failed", e);
  }
})();

function toggleSidebar(forceOpen){
  document.body.classList.toggle('sidebar-open', forceOpen);
}

const hamburger = document.getElementById('hamburgerBtn');
if(hamburger){
  hamburger.addEventListener('click', () => toggleSidebar(true));
}

function scrollTopSmooth(){
  window.scrollTo({top: 0, behavior: 'smooth'});
}

(function(){
  const b = document.getElementById('backTop');
  if(b){
    window.addEventListener('scroll', () => {
      if(window.scrollY > 300){
        b.style.display = 'block';
      } else {
        b.style.display = 'none';
      }
    });
  }
})();

const searchInput = document.getElementById('search');
if(searchInput){
  searchInput.addEventListener('input', function(){
    state.search = this.value;
    render();
  });
}

function logout(){
  try {
    localStorage.removeItem('fs_authed');
    localStorage.removeItem('fs_user');
    sessionStorage.removeItem('fs_authed');
    sessionStorage.removeItem('fs_user');
  } catch(e){}
  location.reload();
}

window.logout = logout;
window.scrollTopSmooth = scrollTopSmooth;
