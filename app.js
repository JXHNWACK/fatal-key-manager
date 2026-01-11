/* ---------- tiny helpers ---------- */
function $(q, el){ return (el||document).querySelector(q); }
function openDialog(id){ try{ document.getElementById(id).showModal(); }catch{ document.getElementById(id).setAttribute('open',''); } }
function closeDialog(id){ try{ document.getElementById(id).close(); }catch{ document.getElementById(id).removeAttribute('open'); } }

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
const GOOGLE_CLIENT_ID = '649659526814-c1spd627if8i26m0nm15trn1reqm1652.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyDQlaageknL2NQ3v-k5iPOVEafkFV3a-iU';
const SPREADSHEET_ID = '1HUOyM03mxN4VCZTHcGjqtXAsDlfsMCr3vx-gSPwTVL4';
const SHEET_NAME = 'Keys';
const SHEET_RANGE = `${SHEET_NAME}!A:J`;
const CLOUD_ENABLED = true;
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1438300840174817290/sc_5gEywaTEi2bauBLIdldEtGArrNJxuhW5otzImyvtNVaME-AMWk0RZBeqZW4bZbnPW';
const EXPECTED_COLS = ['id','code','product','type','status','assignedTo','reason','date','assignedBy','history'];

/* ======== Google API Setup ======== */
let gapiInited = false;
let gisInited = false;
let tokenClient;
let gapiReadyPromise = null;

window.gisLoaded = function() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    callback: '',
  });
  gisInited = true;
  gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
  try {
    await gapi.client.init({
      apiKey: GOOGLE_API_KEY,
      discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
    });
    gapiInited = true;
    checkGapiReady();
  } catch(e) {
    console.error("GAPI Init Error", e);
    showBanner("Google API Init Failed: " + (e.message || e));
  }
}

function checkGapiReady() {
  if (gapiInited && gisInited && gapiReadyPromise && gapiReadyPromise.resolve) {
    console.log("Google API ready");
    gapiReadyPromise.resolve();
  }
}

function whenGapiReady() {
  if (!gapiReadyPromise || !gapiReadyPromise.promise) {
    let resolver;
    const promise = new Promise(resolve => { resolver = resolve; });
    gapiReadyPromise = { promise, resolve: resolver };
  }
  return gapiReadyPromise.promise;
}

async function ensureAuth() {
  await whenGapiReady();
  if (gapi.client.getToken() === null) {
    return new Promise((resolve) => {
      tokenClient.callback = (resp) => {
        if (resp.error !== undefined) {
          console.error('Google Auth Error:', resp.error);
          showBanner(`Google Auth Error: ${resp.error}`);
          resolve(false);
        } else {
          console.log('Google sign-in successful');
          resolve(true);
        }
      };
      tokenClient.requestAccessToken({});
    });
  }
  return true;
}

async function backoff(fn, maxRetries = 5, delay = 1000) {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch(e) {
      lastErr = e;
      if (i < maxRetries - 1) {
        await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
      }
    }
  }
  throw lastErr;
}

async function callSheetApi(fn){
  if (!await ensureAuth()) throw new Error("Authentication failed");
  try { 
    return await backoff(fn); 
  } catch(e){
    if(e?.result?.error?.code === 401){
      console.warn("Token expired, refreshing");
      gapi.client.setToken(null);
      if(!await ensureAuth()) throw new Error("Re-auth failed");
      return await backoff(fn);
    }
    throw e;
  }
}

function coerceRow(r){
  let history = [];
  try {
    if (r.history && typeof r.history === 'string') history = JSON.parse(r.history);
    else if (Array.isArray(r.history)) history = r.history;
  } catch(e) {}
  return {
    id: r.id || uid(),
    code: r.code || '',
    product: r.product || '',
    type: r.type || 'Day',
    status: r.status || 'available',
    assignedTo: r.assignedTo || '',
    reason: r.reason || '',
    date: r.date || '',
    assignedBy: r.assignedBy || '',
    history: history
  };
}

async function cloudGetAll(){
  const exec = () => gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_RANGE,
  });
  const response = await callSheetApi(exec);
  const values = response.result.values || [];
  if (values.length < 1) return [];
  const header = values[0];
  const rows = values.slice(1);
  return rows.map(row => {
    const obj = {};
    header.forEach((col, i) => { obj[col] = row[i] || ''; });
    return coerceRow(obj);
  });
}

async function cloudAppend(rows){
  if(!rows || !rows.length) return;
  const values = rows.map(row => EXPECTED_COLS.map(col => {
    const val = row[col];
    if (col === 'history' && Array.isArray(val)) return JSON.stringify(val);
    return val !== undefined && val !== null ? val : '';
  }));
  const exec = () => gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_RANGE,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: { values },
  });
  await callSheetApi(exec);
  setCloudStatus(true);
}

async function cloudPatchById(id, patch){
  const execGetId = () => gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:A`
  });
  const idCol = await callSheetApi(execGetId);
  const rowNum = (idCol.result.values || []).findIndex(row => row[0] === id) + 1;
  if (rowNum < 1) throw new Error(`Row not found`);
  
  const execGet = () => gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!${rowNum}:${rowNum}`
  });
  const current = (await callSheetApi(execGet)).result.values[0];
  
  const newVals = [...current];
  for (const key in patch) {
    const idx = EXPECTED_COLS.indexOf(key);
    if (idx !== -1) {
      const val = patch[key];
      newVals[idx] = (key === 'history' && Array.isArray(val)) ? JSON.stringify(val) : (val !== undefined && val !== null ? val : '');
    }
  }
  
  const execUpdate = () => gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!${rowNum}:${rowNum}`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [newVals] },
  });
  await callSheetApi(execUpdate);
  setCloudStatus(true);
}

async function cloudDeleteById(id){
  const execGetId = () => gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:A`
  });
  const idCol = await callSheetApi(execGetId);
  const rowNum = (idCol.result.values || []).findIndex(row => row[0] === id) + 1;
  if (rowNum < 1) throw new Error(`Row not found`);
  
  const exec = () => gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    resource: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: 0,
            dimension: 'ROWS',
            startIndex: rowNum - 1,
            endIndex: rowNum
          }
        }
      }]
    }
  });
  await callSheetApi(exec);
  setCloudStatus(true);
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
        await whenGapiReady();
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
const STORAGE_KEY = 'fs-key-manager-v1';
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
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function sortRows(rows){
  const key = state.sortKey;
  if(!key) return rows;
  const dir = state.sortDir === 'desc' ? -1 : 1;
  
  function val(k){
    if(key === 'date'){ return k.date ? new Date(k.date).getTime() : 0; }
    if(key === 'assignedTo'){ return (k.assignedTo || '').toLowerCase(); }
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
      if(CLOUD_ENABLED){
        await cloudPatchById(id, {history});
        await load();
      } else {
        const k = state.keys.find(x => x.id === id);
        if(k) k.history = history;
        save();
      }
    } else if(last.type === 'add'){
      const ids = last.payload.ids || [];
      if(CLOUD_ENABLED){
        for(const id of ids){ await cloudDeleteById(id); }
        await load();
      } else {
        state.keys = state.keys.filter(k => !ids.includes(k.id));
        save();
      }
    } else if(last.type === 'delete'){
      const items = last.payload.items || [];
      if(CLOUD_ENABLED){
        await cloudAppend(items);
        await load();
      } else {
        state.keys.unshift(...items);
        save();
      }
    } else if(last.type === 'assign' || last.type === 'release'){
      const prev = last.payload.prev;
      if(!prev) return;
      if(CLOUD_ENABLED){
        await cloudPatchById(prev.id, {
          code: prev.code,
          product: prev.product,
          type: prev.type,
          status: prev.status,
          assignedTo: prev.assignedTo,
          reason: prev.reason,
          date: prev.date,
          assignedBy: prev.assignedBy || '',
          history: prev.history
        });
        await load();
      } else {
        const k = state.keys.find(x => x.id === prev.id);
        if(k){
          Object.assign(k, prev);
        }
        save();
      }
    }
  } catch(e){
    console.error('Undo failed', e);
    showBanner('Undo failed: ' + (e.message || e));
  }
}

/* ======== Load/Save ======== */
async function load(){
  console.log('Loading data...');
  if(CLOUD_ENABLED){
    try {
      state.keys = await cloudGetAll();
      setCloudStatus(true);
    } catch(err){
      console.error('Cloud load failed', err);
      const errMsg = err.message || String(err);
      let msg = 'Failed to load data from Google Sheets: ' + errMsg;
      if(errMsg.includes('403') || errMsg.includes('404')){
        msg += ' (Check SPREADSHEET_ID and permissions)';
      }
      showBanner(msg);
      state.keys = [];
      setCloudStatus(false);
    }
  } else {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if(stored){
        const data = JSON.parse(stored);
        state.keys = data.keys || [];
      }
    } catch(e){
      console.error('Local load failed', e);
    }
  }
  
  state.products = ['All','Assigned'];
  state.keys.forEach(k => {
    if(k.product && !state.products.includes(k.product)){
      state.products.push(k.product);
    }
  });
  
  render();
}

function save(){
  if(CLOUD_ENABLED) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({keys: state.keys}));
  } catch(e){
    console.error('Save failed', e);
  }
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
      <td>${k.code}</td>
      <td>${k.product}</td>
      <td>${k.type}</td>
      <td><span class="status status-${k.status}">${k.status}</span></td>
      <td>${k.assignedTo || '-'}</td>
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
  
  if(CLOUD_ENABLED){
    try {
      await cloudDeleteById(id);
      await load();
      showToast('Deleted ✔');
    } catch(e){
      console.error('Delete failed', e);
      showBanner('Delete failed: ' + (e.message || e));
    }
  } else {
    state.keys = state.keys.filter(x => x.id !== id);
    save();
    render();
    showToast('Deleted ✔');
  }
  
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
  
  if(CLOUD_ENABLED){
    try {
      await cloudPatchById(id, {
        status: 'available',
        assignedTo: '',
        reason: '',
        date: '',
        history: newHistory
      });
      await load();
      showToast('Released ✔');
    } catch(e){
      console.error('Release failed', e);
      showBanner('Release failed: ' + (e.message || e));
    }
  } else {
    k.status = 'available';
    k.assignedTo = '';
    k.reason = '';
    k.date = '';
    k.history = newHistory;
    save();
    render();
    showToast('Released ✔');
  }
  
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
  
  if(CLOUD_ENABLED){
    try {
      await cloudPatchById(id, {
        status: 'assigned',
        assignedTo: assignTo,
        reason: reason,
        date: new Date().toISOString(),
        assignedBy: nowUser,
        history: newHistory
      });
      await load();
      showToast('Assigned ✔');
    } catch(e){
      console.error('Assign failed', e);
      showBanner('Assign failed: ' + (e.message || e));
    }
  } else {
    k.status = 'assigned';
    k.assignedTo = assignTo;
    k.reason = reason;
    k.date = new Date().toISOString();
    k.assignedBy = nowUser;
    k.history = newHistory;
    save();
    render();
    showToast('Assigned ✔');
  }
  
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
        <td>${new Date(h.at).toLocaleString()}</td>
        <td>${h.action}</td>
        <td>${h.by || '-'}</td>
        <td>${h.assignedTo || h.reason || '-'}</td>
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
  const rows = newCodes.map(code => {
    const history = [{action: 'created', by: nowUser, at: new Date().toISOString()}];
    return {
      id: uid(),
      code,
      product,
      type,
      status: 'available',
      assignedTo: '',
      reason: '',
      date: '',
      assignedBy: nowUser,
      history
    };
  });
  
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
  
  if(CLOUD_ENABLED){
    try {
      await cloudAppend(rows);
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
  } else {
    state.keys.unshift(...rows);
    pushUndo({type: 'add', payload: {ids: rows.map(r => r.id)}});
    state.filterProduct = product;
    state.filterType = type;
    state.search = '';
    showBanner(`Added ${rows.length} ${product} • ${type} key(s).` + (skipped.length ? ` Skipped ${skipped.length} duplicate(s).` : ''));
    closeDialog('bulkModal');
    showToast('Added ✔');
    save();
    render();
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
  const history = [{action: 'created', by: nowUser, at: new Date().toISOString()}];
  const item = {id, code, product, type, status: 'available', assignedTo: '', reason: '', date: '', assignedBy: nowUser, history};
  
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
  
  if(CLOUD_ENABLED){
    try {
      await cloudAppend([item]);
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
  } else {
    state.keys.unshift(item);
    pushUndo({type: 'add', payload: {ids: [id]}});
    state.filterProduct = product;
    state.filterType = type;
    state.search = '';
    closeDialog('singleModal');
    showToast('Added ✔');
    save();
    render();
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
      
      await whenGapiReady();
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

if(window.gisLoadedPending) window.gisLoaded();
