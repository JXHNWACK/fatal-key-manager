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
      'Administrator':  ['#F47174','#D94447'], // red
    };
    function applyUserAccent(user){
      var pair=USER_ACCENTS[user];
      if(!pair) return;
      document.documentElement.style.setProperty('--accent',pair[0]);
      document.documentElement.style.setProperty('--accent-2',pair[1]);
    }

    // Expose GAPI loader functions to the global scope immediately to prevent race conditions.
    window.gapiLoaded = gapiLoaded;
    window.gisLoaded = gisLoaded;

    /* ======== Google Sheets API Integration ======== */
    // IMPORTANT: You must get these values from your Google Cloud project.
    // 1. Create a project at https://console.cloud.google.com/
    // 2. Enable the "Google Sheets API".
    // 3. Create an "OAuth 2.0 Client ID" for a Web Application. Add your app's URL to the authorized origins.
    // 4. Create an "API Key". Restrict it to the Google Sheets API.
    const GOOGLE_CLIENT_ID = '649659526814-br5qr47c9cjavreljb142e01nsheoc0s.apps.googleusercontent.com'; // <— PASTE YOUR OAUTH CLIENT ID
    const GOOGLE_API_KEY = 'AIzaSyALs4xk8k6dYGHDOAz8MnCrT1SqHFEmgHM';                                // <— PASTE YOUR API KEY
    const SPREADSHEET_ID = '1HUOyM03mxN4VCZTHcGjqtXAsDlfsMCr3vx-gSPwTVL4';                         // <— PASTE YOUR SPREADSHEET ID
    const SHEET_NAME = 'Keys';                                            // <— CHANGE THIS to match your sheet tab name
    const SHEET_RANGE = `${SHEET_NAME}!A:J`;

    const CLOUD_ENABLED = true;
    const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1438300840174817290/sc_5gEywaTEi2bauBLIdldEtGArrNJxuhW5otzImyvtNVaME-AMWk0RZBeqZW4bZbnPW'; // <— PASTE YOUR DISCORD WEBHOOK URL HERE
    const EXPECTED_COLS = ['id','code','product','type','status','assignedTo','reason','date','assignedBy','history'];

    // --- Google API State ---
    let gapiInited = false;
    let gisInited = false;
    let tokenClient;
    let gapiReadyPromise = null;

    /**
     * Callback after the GAPI script is loaded from index.html.
     */
    function gapiLoaded() {
      gapi.load('client', initializeGapiClient);
    }

    /**
     * Initializes the GAPI client with the Sheets API.
     */
    async function initializeGapiClient() {
      await gapi.client.init({
        apiKey: GOOGLE_API_KEY,
        discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
      });
      gapiInited = true;
      checkGapiReady();
    }

    /**
     * Callback after the GIS script is loaded from index.html.
     */
    function gisLoaded() {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        callback: '', // Callback is handled by the Promise from requestAccessToken
      });
      gisInited = true;
      checkGapiReady();
    }

    function checkGapiReady() {
      if (gapiInited && gisInited && gapiReadyPromise) {
        console.log("Google API client is ready.");
        gapiReadyPromise.resolve();
      }
    }

    function whenGapiReady() {
      if (!gapiReadyPromise) {
        let resolver;
        const promise = new Promise(resolve => { resolver = resolve; });
        gapiReadyPromise = { promise, resolve: resolver };
        checkGapiReady(); // In case it's already ready
      }
      return gapiReadyPromise.promise;
    }

    /**
     * Ensures the user is authenticated. Prompts for login if necessary.
     * Returns true if authenticated, false otherwise.
     */
    async function ensureAuth() {
      await whenGapiReady();
      if (gapi.client.getToken() === null) {
        // The user is not signed in. Prompt them.
        return new Promise((resolve, reject) => {
          try {
            tokenClient.callback = (resp) => {
              if (resp.error !== undefined) {
                reject(resp);
                resolve(false);
              }
              console.log('Google sign-in successful.');
              resolve(true);
            };
            tokenClient.requestAccessToken({ prompt: 'consent' });
          } catch (err) {
            console.error(err);
            reject(err);
            resolve(false);
          }
        });
      }
      return true; // Already authenticated
    }

    function validateColumns(rows){
      try{
        // With Google Sheets API, rows are arrays, not objects. We check the header row.
        const have = rows[0];
        const missing = EXPECTED_COLS.filter(k => !have.includes(k));
        if(missing.length){
          const msg = 'Your Google Sheet tab "'+SHEET_NAME+'" is missing header(s): '+missing.join(', ')+'. This may be due to a recent update. Please add the missing headers to fix.\n' +
                      'Add these EXACT headers in row 1: '+EXPECTED_COLS.join(', ')+' — then try again.';
          console.warn('[RC Key Manager] Missing headers:', missing);
          showBanner(msg);
          return false;
        }
        return true;
      }catch(e){ console.error("Column validation failed", e); return true; }
    }

    async function backoff(fn, tries=3){
      let attempt=0, lastErr;
      while(attempt<tries){
        try{ return await fn(); }
        catch(e){ lastErr=e; console.warn(`Attempt ${attempt+1} failed. Retrying...`, e); await new Promise(r=>setTimeout(r, 400*Math.pow(2,attempt))); attempt++; }
      }
      throw lastErr;
    }

    function coerceRow(r){
      let history = [];
      try {
        if (r.history && typeof r.history === 'string') history = JSON.parse(r.history);
        else if (Array.isArray(r.history)) history = r.history;
      } catch(e) { /* ignore malformed history */ }
      // When reading from Google Sheets, `r` will be an object with keys from EXPECTED_COLS
      return {
        id:         r.id         || uid(),
        code:       r.code       || '', product:    r.product    || '',
        type:       r.type       || 'Day', status:     r.status     || 'available',
        assignedTo: r.assignedTo || '', reason:     r.reason     || '',
        date:       r.date       || '', assignedBy: r.assignedBy || '',
        history:    history
      };
    }

    async function cloudGetAll(){
      if (!await ensureAuth()) throw new Error("Authentication failed.");
      const exec = () => gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: SHEET_RANGE,
      });
      const response = await backoff(exec);

      const values = response.result.values || [];
      if (values.length < 1) return []; // Empty sheet

      const headers = values[0];
      if (!validateColumns(values)) {
        throw new Error("Sheet is missing required columns. See banner for details.");
      }
      // Convert array-based rows to object-based rows
      const objectRows = values.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, i) => { obj[header] = row[i]; });
        return obj;
      });
      setCloudStatus(true);
      return objectRows;
    }

    async function cloudAppend(rows){
      if(!rows || !rows.length) return;
      if (!await ensureAuth()) throw new Error("Authentication failed.");

      // Convert object rows to array rows in the correct order
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
      await backoff(exec);
      setCloudStatus(true);
    }

    async function cloudPatchById(id, patch){
      if (!await ensureAuth()) throw new Error("Authentication failed.");

      // Find the row number for the given ID
      const execGetId = () => gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!A:A`
      });
      const idColumnValues = await backoff(execGetId);
      const rowNum = (idColumnValues.result.values || []).findIndex(row => row[0] === id) + 1;
      if (rowNum < 1) throw new Error(`Could not find row with ID ${id} to update.`);

      // Prepare the update data
      const execGetCurrent = () => gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!${rowNum}:${rowNum}`
      });
      const currentValues = (await backoff(execGetCurrent)).result.values[0];

      const newValues = [...currentValues];
      for (const key in patch) {
        const colIndex = EXPECTED_COLS.indexOf(key);
        if (colIndex > -1) {
          let val = patch[key];
          if (key === 'history' && Array.isArray(val)) val = JSON.stringify(val);
          newValues[colIndex] = val;
        }
      }

      const execUpdate = () => gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A${rowNum}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [newValues] },
      });
      await backoff(execUpdate);
      setCloudStatus(true);
    }

    async function cloudDeleteById(id){
      // The Sheets API v4 does not support deleting rows by a condition like an ID.
      // This is a complex operation (find row, get sheetId, send deleteDimension request).
      // For simplicity, we will clear the row instead, which is visually similar to a delete.
      console.warn("cloudDeleteById is clearing the row instead of deleting it due to API limitations.");
      await cloudPatchById(id, { code: '', product: '', type: '', status: 'deleted', assignedTo: '', reason: '', date: '', assignedBy: '', history: '' });
      setCloudStatus(true);
    }

    async function sendDiscordNotification(embed){
      if (!DISCORD_WEBHOOK_URL) return;
      const response = await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'RC Key Manager',
          avatar_url: 'https://raw.githubusercontent.com/JXHNWACK/Rogue-Community-Key-Manager/main/fs_logo_emoji.png',
          embeds: [embed]
        })
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Discord notification failed: ${response.status} ${errorText}`);
      }
    }

    /* ---------- Cloud/Net status UI ---------- */
    let LAST_SYNC_AT = null;
    let SYNC_TOASTED = false;

    function setCloudStatus(ok, msg){
      var chip = document.getElementById('cloudChip'); if(!chip) return;
      var dot   = chip.querySelector('.dot');
      var label = document.getElementById('cloudLabel');

      if(dot){ dot.classList.remove('ok','danger'); dot.classList.add(ok ? 'ok' : 'danger'); }

      if(ok){
        LAST_SYNC_AT = new Date();
        if(label){ label.textContent = 'Cloud • ' + LAST_SYNC_AT.toLocaleTimeString(); }
        chip.title = 'Cloud: OK — Last sync at ' + LAST_SYNC_AT.toLocaleString();
        if(!SYNC_TOASTED){ showToast('Sync successful ✔'); SYNC_TOASTED = true; }
        setNetStatus(true);
      }else{
        if(label) label.textContent = 'Cloud Error';
        chip.title = 'Cloud: Error — ' + (msg || 'Unknown');
        SYNC_TOASTED = false;
      }
    }

    function setNetStatus(on){
      var chip = document.getElementById('netChip'); if(!chip) return;
      var dot = chip.querySelector('.dot');
      if(dot){ dot.classList.remove('ok','danger'); dot.classList.add(on ? 'ok' : 'danger'); }
      var t = document.getElementById('netText'); if(t) t.textContent = on ? 'Online' : 'Offline';
    }
    window.addEventListener('online',  function(){ setNetStatus(true);  });
    window.addEventListener('offline', function(){ setNetStatus(false); });

    /* ---------- Login (robust) ---------- */
    const USERS = { 'Administrator':'1212' };

    function pickPresetUser(name){
      if(!name) return;
      var pEl = document.getElementById('loginPass'); if(pEl) pEl.focus();
      toggleLoginButton();
    }

    var __rotTimer = null;
    var __rotMsgs = [ 'Welcome to Rogue Community','Securely manage your keys','Staff access only' ];
    var __rotIdx = 0;
    function startLoginRotator(){
      var el = document.getElementById('loginRotator'); if(!el) return;
      el.textContent = __rotMsgs[__rotIdx % __rotMsgs.length];
      clearInterval(__rotTimer);
      __rotTimer = setInterval(function(){
        __rotIdx++; el.textContent = __rotMsgs[__rotIdx % __rotMsgs.length];
        el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      }, 3000);
    }
    function stopLoginRotator(){ if(__rotTimer){ clearInterval(__rotTimer); __rotTimer = null; } }

    function attemptLogin(ev){
      if(ev) ev.preventDefault();
      const uPick = (document.getElementById('loginPick')?.value || '').trim();
      const p = (document.getElementById('loginPass')?.value || '');

      // dev bypass: ?dev=1&as=JXHNWACK
      const qs = new URLSearchParams(location.search);
      const dev = qs.get('dev') === '1';
      const as  = (qs.get('as') || '').trim();
      const u = (dev && as) ? as : uPick;
      
      const isDevBypass = dev && as;
      const isPasswordCorrect = USERS[u] && USERS[u] === p;

      if (isDevBypass || isPasswordCorrect) {
        stopLoginRotator();
        var greet = document.querySelector('#welcomeScreen .welcome-greeting');
        if(greet){ greet.textContent = 'WELCOME ' + u.toUpperCase(); greet.style.display = 'block'; setTimeout(function(){ greet.style.opacity = '1'; }, 50); }
        var el = document.getElementById('welcomeScreen');
        var logoImg = el ? el.querySelector('.welcome-card img') : null;
        var btn = document.getElementById('loginGo');
        var barWrap = document.getElementById('loginProgress');
        if(btn){ btn.disabled = true; btn.textContent = 'Signing in…'; }
        if(logoImg){ logoImg.classList.add('login-pulse'); }
        if(barWrap){
          barWrap.style.display = 'block';
          var bar = barWrap.querySelector('.bar');
          if(bar){ bar.style.animation = 'none'; bar.offsetHeight; bar.style.animation = 'progress-run 3.6s ease-in-out forwards'; }
        }
        setTimeout(function(){
          if(el) el.style.display = 'none';
          window.scrollTo(0,0); document.documentElement.scrollLeft = 0; document.body.scrollLeft = 0;
          const remember = document.getElementById('rememberMe')?.checked;
          const storage = remember ? localStorage : sessionStorage;
          try{ storage.setItem('fs_authed','1'); storage.setItem('fs_user', u || 'User'); }catch(e){}
          var menu=document.getElementById('userMenu'); var btnU=document.getElementById('userBtn');
          if(menu) menu.style.display='inline-block';
          if(btnU) btnU.textContent = (u || 'User') + ' ▾';
          applyUserAccent(u || 'User');
        }, 3600);
      }else{
        var err = document.getElementById('welcomeError'); if(err) err.style.display = 'block';
        var card = document.querySelector('#welcomeScreen .welcome-card');
        if(card){ card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
        return false;
      }
    }
    window.attemptLogin = attemptLogin; // Expose to inline handler

    function toggleLoginButton(){
      var pass = document.getElementById('loginPass');
      var btn  = document.getElementById('loginGo');
      if(!btn) return;
      // The user picker is hidden, so we only need to check for a password.
      // The username is hardcoded to 'Administrator'.
      var hasPass = !!(pass && pass.value && pass.value.length>0);
      btn.disabled = !hasPass;
    }

    /* ---------- local state ---------- */
    const STORAGE_KEY='fs-key-manager-v1';
    const state={
      keys:[],
      products:[],
      filterProduct:'All',
      filterType:'All',
      search: '', sortKey: '', sortDir: 'asc'
    };

    function applyTheme(){
      try{
        const pref = localStorage.getItem('fs_theme') || 'dark';
        if(pref === 'light'){ document.documentElement.classList.add('light'); }
        else{ document.documentElement.classList.remove('light'); }
      }catch(e){ document.documentElement.classList.remove('light'); }
    }
    function toggleTheme(){
      const isLight = document.documentElement.classList.contains('light');
      const next = isLight ? 'dark' : 'light';
      try{ localStorage.setItem('fs_theme', next); }catch(e){}
      applyTheme();
    }

    function sortRows(rows){
      const key = state.sortKey; if(!key) return rows;
      const dir = state.sortDir === 'desc' ? -1 : 1;
      function val(k){
        if(key==='date'){ return (k.date ? new Date(k.date).getTime() : 0); }
        if(key==='assignedTo'){ return (k.assignedTo || '').toLowerCase(); }
        if(key==='product'){ return (k.product || '').toLowerCase(); }
        return (k[key] || '').toString().toLowerCase();
      }
      return rows.slice().sort((a,b)=>{ const va = val(a), vb = val(b); if(va<vb) return -1*dir; if(va>vb) return 1*dir; return 0; });
    }
    function sortCaret(k){ if(state.sortKey!==k) return '<span class="caret">↕︎</span>'; return '<span class="caret">'+(state.sortDir==='asc'?'▲':'▼')+'</span>'; }
    function setSort(k){ if(state.sortKey===k){ state.sortDir = (state.sortDir==='asc' ? 'desc' : 'asc'); }else{ state.sortKey = k; state.sortDir = 'asc'; } render(); }

    /* ---------- Undo stack ---------- */
    const UNDO_STACK = [];
    function updateUndoUI(){ var b=document.getElementById('undoBtn'); if(b) b.disabled = UNDO_STACK.length===0; }
    function pushUndo(entry){ UNDO_STACK.push(entry); updateUndoUI(); }
    async function onUndo(){
      const last = UNDO_STACK.pop(); updateUndoUI(); if(!last) return;
      try{
        if (last.type === 'history_revert') {
          const { id, history } = last.payload;
          if (CLOUD_ENABLED) { await cloudPatchById(id, { history }); await load(); }
          else { const k = state.keys.find(x => x.id === id); if (k) k.history = history; await save(); }
        }
        else if(last.type==='add'){
          const ids = last.payload.ids || [];
          if(CLOUD_ENABLED){ for(const id of ids){ await cloudDeleteById(id); } await load(); }
          else { state.keys = state.keys.filter(k=>!ids.includes(k.id)); await save(); }
        }else if(last.type==='delete'){
          const items = last.payload.items || [];
          if(CLOUD_ENABLED){ await cloudAppend(items); await load(); }
          else { state.keys.unshift(...items); await save(); }
        }else if(last.type==='assign' || last.type==='release'){
          const prev = last.payload.prev; if(!prev) return;
          if(CLOUD_ENABLED){
            await cloudPatchById(prev.id, { code: prev.code, product: prev.product, type: prev.type, status: prev.status, assignedTo: prev.assignedTo, reason: prev.reason, date: prev.date, assignedBy: prev.assignedBy || '', history: prev.history });
            await load();
          }else{
            const idx = state.keys.findIndex(x=>x.id===prev.id); if(idx>-1){ state.keys[idx]=Object.assign({}, prev); } await save();
          }
        }
      }catch(e){ console.error('Undo failed', e); alert('Undo failed: '+ (e && e.message ? e.message : e)); }
    }

    function uid(){ return Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(2); }
    async function save(renderAfter=true){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){} if(renderAfter) render(); }

    async function load(){
      // Always try to load products from local storage first.
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const localState = JSON.parse(raw);
          if (localState.products) state.products = localState.products;
        }
      } catch(e) {}
      initializeProducts();

      if (CLOUD_ENABLED) {
        try {
          const rows = await cloudGetAll();
          state.keys = rows.map(coerceRow);
          setCloudStatus(true);
        } catch (err) {
          const errMsg = err?.result?.error?.message || err?.message || 'Unknown error';
          setCloudStatus(false, errMsg);
          console.error('Cloud load failed.', err);
          showBanner('Failed to load data from Google Sheets. Check console for details. Error: ' + errMsg);
          // Render the shell but with empty keys, so the user sees the error.
          state.keys = [];
        }
      } else {
        // Fallback to local storage only if cloud is disabled.
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) { Object.assign(state, JSON.parse(raw)); }
        } catch(e) {}
      }
      render();
    }

    function initializeProducts(){
      if (!state.products || state.products.length === 0) {
        state.products = [
          { name: 'Shadow', color: '#F47174' },
          { name: 'Black', color: '#E7F6F7' },
          { name: 'Nebula', color: '#A99CFF' },
          { name: 'Fatality', color: '#EF476F' },
          { name: 'Temp Spoofer', color: '#06D6A0' }
        ];
      }
    }

    /* ---------- Tabs & filtering ---------- */
    function renderSidebarNav(){
      const available = state.keys.filter(k=>k.status==='available');
      const byProd = available.reduce((a,k)=>{ a[k.product]=(a[k.product]||0)+1; return a; },{});
      const allCount = available.length;
      const assignedCount = state.keys.filter(k=>k.status==='assigned' || k.status==='expired').length;
      
      const sidebar = $('#sidebar');
      if (!sidebar) return;

      const header = `<div class="sidebar-header"><div class="logo"></div><h2>Products</h2></div>`;
      const nav = document.createElement('div');
      nav.className = 'sidebar-nav';

      const productTabs = state.products.map(p => p.name);
      const navItems = ['All', ...productTabs, 'Assigned'].map(p=>{
        let c=0, dot='ok';
        if(p==='All') c = allCount;
        else if(p==='Assigned'){ c = assignedCount; dot='warn'; }
        else c = (byProd[p]||0);
        if (p === 'Assigned' && nav.innerHTML) return '<div class="nav-divider"></div>' + createNavItem(p, c, dot);
        return createNavItem(p, c, dot);
      }).join('');
      nav.innerHTML = navItems;
      sidebar.innerHTML = header;
      sidebar.appendChild(nav);

      const productOptions = state.products.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('');
      const bulkSelect = document.getElementById('bulkProduct');
      const singleSelect = document.getElementById('s_product');
      if (bulkSelect) bulkSelect.innerHTML = productOptions;
      if (singleSelect) singleSelect.innerHTML = productOptions;
    }
    function createNavItem(p, count, dotClass){
      return `<div class="nav-item ${state.filterProduct === p ? 'active' : ''}" onclick="setFilter('${escapeHtml(p)}')">
                <span>${escapeHtml(p)}</span>
                <span class="chip"><span class="dot ${dotClass}"></span>${count}</span>
              </div>`;
    }
    function setFilter(p){
      state.filterProduct=p;
      render();
      if (window.innerWidth <= 768) toggleSidebar(false);
    }

    function visibleRows(){
      const inAssigned = state.filterProduct==='Assigned';
      const q=(state.search||'').toLowerCase();
      const typeWanted = state.filterType || 'All';
      return state.keys.filter(k=>{
        const assignedish=(k.status==='assigned'||k.status==='expired');
        const statusOk = inAssigned ? assignedish : (k.status==='available');
        const productOk = state.filterProduct==='All' || state.filterProduct==='Assigned' || k.product===state.filterProduct;
        const typeOk = (typeWanted==='All') ? true : (k.type===typeWanted);
        const hay=[k.code,k.product,k.type,k.status,k.assignedTo||'',k.reason||'',k.date||''].join(' ').toLowerCase();
        return statusOk && productOk && typeOk && (!q || hay.indexOf(q)!==-1);
      });
    }

    /* ---------- Actions ---------- */
    function copyCode(id){
      const k=state.keys.find(x=>x.id===id);
      if(k && navigator.clipboard){ navigator.clipboard.writeText(k.code).then(function(){ showToast('Copied ✔'); }); }
    }

    async function removeKey(id){
      if(!confirm('Delete this key from your list?')) return;
      const k=state.keys.find(x=>x.id===id); if(!k) return;
      pushUndo({ type:'delete', payload:{ items:[ Object.assign({}, k) ] } });
      if(CLOUD_ENABLED){ await cloudDeleteById(k.id); await load(); return; }
      state.keys=state.keys.filter(x=>x.id!==id); save();
    }

    async function releaseKey(id){
      const k=state.keys.find(x=>x.id===id); if(!k) return;
      const prev = Object.assign({}, k); pushUndo({ type:'release', payload:{ prev } });
      const currentUser = (sessionStorage && sessionStorage.getItem('fs_user')) || 'unknown';
      const newHistory = [...(k.history || []), {
        action: 'released',
        by: currentUser,
        at: new Date().toISOString()
      }];

      const patch = { status:'available', assignedTo:'', reason:'', date:'', assignedBy:'', history: newHistory };
      sendDiscordNotification({
        title: '↩️ Key Released',
        description: `The key \`${prev.code}\` previously assigned to **${prev.assignedTo}** has been released and is now available.`,
        color: 45001, // #00B031 (a shade of ok)
        fields: [
          { name: 'Product', value: prev.product, inline: true },
          { name: 'Released By', value: currentUser, inline: true }
        ],
        timestamp: new Date().toISOString()
      });
      if(CLOUD_ENABLED){
        await cloudPatchById(k.id, patch);
        showToast('Released ✔');
        await load();
        return;
      }
      Object.assign(k, patch); showToast('Released ✔'); save();
    }

    let assignId=null;
    function openAssign(id){
      const k=state.keys.find(x=>x.id===id); if(!k) return;
      assignId=id;
      $('#m_code').value=k.code; $('#m_product').value=k.product;
      $('#m_user').value=k.assignedTo||''; $('#m_reason').value=k.reason||'';
      $('#m_date').value=k.date||new Date().toISOString().slice(0,10);
      openDialog('assignModal');
    }
    async function saveAssign(){
      const k=state.keys.find(x=>x.id===assignId); if(!k) return;
      const prev = Object.assign({}, k); pushUndo({ type:'assign', payload:{ prev } });
      const currentUser = (sessionStorage && sessionStorage.getItem('fs_user')) || 'unknown';
      const assignedTo = $('#m_user').value.trim();
      const reason = $('#m_reason').value.trim();
      const newHistory = [...(k.history || []), {
        action: 'assigned',
        to: assignedTo,
        reason: reason,
        by: currentUser,
        at: new Date().toISOString()
      }];
      const patch = {
        assignedTo: assignedTo,
        reason: reason,
        date: $('#m_date').value,
        status: 'assigned',
        assignedBy: currentUser,
        history: newHistory
      };
      sendDiscordNotification({
        title: '🔑 Key Assigned',
        color: 16763904, // #FFD166 (warn)
        fields: [
          { name: 'Product', value: k.product, inline: true },
          { name: 'Key', value: '`' + k.code + '`', inline: true },
          { name: 'Assigned To', value: patch.assignedTo, inline: false },
          { name: 'Reason', value: patch.reason || '_Not provided_', inline: false },
          { name: 'Assigned By', value: patch.assignedBy, inline: true }
        ],
        timestamp: new Date().toISOString()
      });
      if(CLOUD_ENABLED){
        await cloudPatchById(k.id, patch);
        closeDialog('assignModal');
        showToast('Saved ✔');
        await load();
        return;
      }
      Object.assign(k, patch);
      closeDialog('assignModal'); showToast('Saved ✔'); save();
    }

    function openHistory(id) {
      const k = state.keys.find(x => x.id === id); if (!k) return;
      const listEl = $('#historyList');
      const infoEl = $('#historyKeyInfo');
      if (!listEl || !infoEl) return;

      infoEl.innerHTML = `<strong>Key:</strong> ${escapeHtml(k.code)} &nbsp;&nbsp; <strong>Product:</strong> ${escapeHtml(k.product)}`;

      const history = k.history || [];
      if (history.length === 0) {
        listEl.innerHTML = '<div class="empty" style="padding:12px;">No history recorded for this key.</div>';
      } else {
        listEl.innerHTML = [...history].reverse().map(entry => {
          const d = new Date(entry.at);
          const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
          let content = '';
          switch(entry.action) {
            case 'created': content = `<strong>Created</strong> by <em>${escapeHtml(entry.by)}</em>`; break;
            case 'assigned': content = `<strong>Assigned</strong> to <em>${escapeHtml(entry.to)}</em> by <em>${escapeHtml(entry.by)}</em> for: ${escapeHtml(entry.reason||'N/A')}`; break;
            case 'released': content = `<strong>Released</strong> by <em>${escapeHtml(entry.by)}</em>`; break;
            default: content = `<strong>${escapeHtml(entry.action)}</strong> by <em>${escapeHtml(entry.by)}</em>`;
          }
          return `<div class="history-item">
                    <div class="history-content">${content}</div>
                    <div class="history-date">${dateStr}</div>
                  </div>`;
        }).join('');
      }

      openDialog('historyModal');
    }

    /* ---------- CSV / backup / restore ---------- */
    function csvEscape(v){ v=String(v); if(v.includes('"')) v=v.replace(/"/g,'""'); if(v.includes(',')||v.includes('\n')||v.includes('"')) v='"'+v+'"'; return v; }
    function toCSV(rows){
      const headers=['code','product','type','status','assignedTo','reason','date','assignedBy'];
      const out=[headers.join(',')];
      for(const k of rows){ out.push(headers.map(h=>csvEscape(k[h]||'')).join(',')); }
      return out.join('\n');
    }
    function onExportCSV(){
      const blob=new Blob([toCSV(state.keys)],{type:'text/csv;charset=utf-8;'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='fatal_keys_'+new Date().toISOString().slice(0,10)+'.csv'; a.click();
    }
    function onBackupJSON(){
      const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='fatal_keys_backup.json'; a.click();
    }
    function onRestoreJSON(file){
      if(!file) return;
      const r=new FileReader();
      r.onload=()=>{
        try{
          const incoming=JSON.parse(r.result);
          if(Array.isArray(incoming.keys)){
            state.keys=incoming.keys; state.filterProduct=incoming.filterProduct||'All'; state.search=''; save();
          }else{ alert('Invalid backup file.'); }
        }catch(e){ alert('Could not read JSON backup.'); }
      };
      r.readAsText(file);
    }

    async function onImportJSON(file){
      if(!file) return;
      const r = new FileReader();
      r.onload = async () => {
        try{
          const raw = JSON.parse(r.result);
          const rowsIn = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.keys) ? raw.keys : null);
          if(!rowsIn){ alert('Invalid JSON format. Expecting an array of rows or an object with a "keys" array.'); return; }

          await load();
          const existing = new Set((state.keys||[]).map(k => String(k.code||'').toLowerCase()));
          const currentUser = (sessionStorage && sessionStorage.getItem('fs_user')) || '';
          const toPost = []; const skipped = [];

          for(const r of rowsIn){
            const code = String(r.code||'').trim(); if(!code) continue;
            const key = code.toLowerCase();
            if(existing.has(key)){ skipped.push(code); continue; }

            const row = {
              id: r.id || uid(), code, product: r.product || 'Shadow', type: r.type || 'Day',
              status: r.status || 'available', assignedTo: r.assignedTo || '', reason: r.reason || '',
              date: r.date || '', assignedBy: r.assignedBy || currentUser,
              history: r.history || [{ action: 'created', by: currentUser, at: new Date().toISOString() }]
            };
            toPost.push(row); existing.add(key);
          }

          if(toPost.length===0){ alert(skipped.length ? 'All rows were duplicates—nothing imported.' : 'Nothing to import.'); return; }

          if(CLOUD_ENABLED){ await cloudAppend(toPost); await load(); }
          else { state.keys.unshift(...toPost); await save(); }

          let msg = 'Imported '+toPost.length+' row(s).';
          if(skipped.length){ msg += '\nSkipped duplicates: '+skipped.length; }
          alert(msg);
        }catch(e){ console.error('Import failed', e); alert('Import failed: '+(e && e.message ? e.message : e)); }
      };
      r.readAsText(file);
    }

    /* ---------- Render ---------- */
    function escapeHtml(s){ return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

    function renderTable(){
      const rows=visibleRows(); const sorted = sortRows(rows);
      if(!rows.length){ $('#tableWrap').innerHTML='<div class="empty">No keys yet. Use <strong>Bulk Add</strong> to paste your list, or <strong>New Single</strong> to add one.</div>'; return; }
      const query = (state.search || '').trim();
      function highlight(text){
        if(!query) return escapeHtml(String(text||''));
        const re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'ig');
        return escapeHtml(String(text||'')).replace(re, '<mark class="hl">$1</mark>');
      }
      const head = '<thead><tr>'
        + '<th>Key</th>'
        + '<th class="sortable" onclick="setSort(\'product\')">Product'+sortCaret('product')+'</th>'
        + '<th>Type</th>'
        + '<th>Status</th>'
        + '<th class="sortable" onclick="setSort(\'assignedTo\')">Discord User'+sortCaret('assignedTo')+'</th>'
        + '<th>Reason</th>'
        + '<th class="sortable" onclick="setSort(\'date\')">Date'+sortCaret('date')+'</th>'
        + '<th>Actions</th>'
        + '</tr></thead>';
      const body=sorted.map(k=>{
        const assignedish=(k.status==='assigned'||k.status==='expired');
        const chip=assignedish
          ? '<span class="chip" title="Assigned by '+escapeHtml(k.assignedBy||'unknown')+'"><span class="dot warn"></span>Assigned</span>'
          : '<span class="chip"><span class="dot ok"></span>Available</span>';
        return '<tr>'
          + '<td class="key-cell" onclick="copyCode(\''+k.id+'\')" title="Click to copy">'+highlight(k.code)+'</td>'
          + '<td><span class="pbadge" style="'+productBadgeStyle(k.product)+'">'+highlight(k.product)+'</span></td>'
          + '<td><span class="badge '+escapeHtml(k.type)+'">'+escapeHtml(k.type)+'</span></td>'
          + '<td>'+chip+'</td>'
          + '<td>'+highlight(k.assignedTo||'')+'</td>'
          + '<td>'+highlight(k.reason||'')+'</td>'
          + '<td>'+(k.date||'')+'</td>'
          + '<td class="actions">'
            + '<button type="button" onclick="copyCode(\''+k.id+'\')">Copy</button>'
            + (assignedish // if assigned
              ? '<button type="button" onclick="openAssign(\''+k.id+'\')">Edit</button><button type="button" onclick="releaseKey(\''+k.id+'\')">Release</button>'
              : '<button type="button" class="btn-primary" onclick="openAssign(\''+k.id+'\')">Assign</button>')
            + '<button type="button" onclick="openHistory(\''+k.id+'\')">History</button>'
            + '<button type="button" onclick="removeKey(\''+k.id+'\')" style="border-color: rgba(239,71,111,.5);">Delete</button>'
          + '</td></tr>';
      }).join('');
      $('#tableWrap').innerHTML='<table>'+head+'<tbody>'+body+'</tbody></table>';
    }

    function productBadgeStyle(productName){
      const p = state.products.find(prod => prod.name === productName);
      if (!p) return 'background:rgba(255,255,255,.06); color:#E7F6F7; border:1px solid rgba(255,255,255,.18);'; // Default style
      const hex = p.color;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `background:rgba(${r},${g},${b},.18); color:${hex}; border:1px solid rgba(${r},${g},${b},.35);`;
    }

    function renderStats(){
      const keys = state.keys || [];
      const total = keys.length;
      const assigned = keys.filter(k => k.status==='assigned' || k.status==='expired').length;
      const available = keys.filter(k => k.status==='available').length;

      const byProd = keys.reduce((a,k)=>{ const p=k.product||'Unknown'; a[p]=(a[p]||0)+1; return a; }, {});
      const top = Object.entries(byProd).sort((a,b)=>b[1]-a[1]).slice(0,2);

      const host = document.getElementById('statsBar'); if(!host) return;
      host.innerHTML = [
        '<div class="stat-card"><div class="stat-title">💾 Total Keys</div><div class="stat-value">'+total+'</div><div class="stat-sub">All products</div></div>',
        '<div class="stat-card"><div class="stat-title">✅ Available</div><div class="stat-value">'+available+'</div><div class="stat-sub">Ready to assign</div></div>',
        '<div class="stat-card"><div class="stat-title">📤 Assigned</div><div class="stat-value">'+assigned+'</div><div class="stat-sub">In use</div></div>',
        '<div class="stat-card"><div class="stat-title">🏆 Top Products</div><div class="stat-value">'+(top[0]? top[0][0]+': '+top[0][1] : '—')+'</div><div class="stat-sub">'+(top[1]? top[1][0]+': '+top[1][1] : '&nbsp;')+'</div></div>'
      ].join('');
    }

    function render(){
      renderSidebarNav(); renderTable(); renderStats();
      var inp = document.getElementById('search'); if(inp && inp.value !== state.search){ inp.value = state.search; }
      var tf = document.getElementById('typeFilter'); if(tf && tf.value !== state.filterType){ tf.value = state.filterType; }
    }

    function renderProductList(){
      const listEl = document.getElementById('productList');
      if (!listEl) return;
      listEl.innerHTML = state.products.map(p => `
        <div style="display:flex; align-items:center; gap:8px; background:var(--panel-2); padding:8px; border-radius:8px;">
          <span style="width:16px; height:16px; border-radius:4px; background-color:${escapeHtml(p.color)};"></span>
          <span style="flex:1;">${escapeHtml(p.name)}</span>
          <button type="button" onclick="openProductEditor('${escapeHtml(p.name)}')">Edit</button>
          <button type="button" onclick="onDeleteProduct('${escapeHtml(p.name)}')">Delete</button>
        </div>
      `).join('');
    }
    async function onAddProduct(){
      const name = ($('#newProductName').value || '').trim();
      const color = $('#newProductColor').value;
      if (!name) return alert('Product name cannot be empty.');
      if (state.products.some(p => p.name.toLowerCase() === name.toLowerCase())) return alert('A product with this name already exists.');
      state.products.push({ name, color });
      await save();
      renderProductList();
      $('#newProductName').value = '';
    }
    async function onDeleteProduct(name){
      if (!confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) return;
      state.products = state.products.filter(p => p.name !== name);
      await save();
      renderProductList();
    }
    function openProductEditor(name){
      const p = state.products.find(prod => prod.name === name);
      if (!p) return alert('Product not found.');
      $('#editProductOriginalName').value = p.name;
      $('#editProductName').value = p.name;
      $('#editProductColor').value = p.color;
      openDialog('editProductModal');
    }
    async function onSaveProductEdit(){
      const oldName = $('#editProductOriginalName').value;
      const newName = ($('#editProductName').value || '').trim();
      const newColor = $('#editProductColor').value;

      if (!newName) return alert('Product name cannot be empty.');
      if (newName.toLowerCase() !== oldName.toLowerCase() && state.products.some(p => p.name.toLowerCase() === newName.toLowerCase())) {
        return alert('A product with this name already exists.');
      }

      // Update the product in the products list
      const p = state.products.find(prod => prod.name === oldName);
      if (p) { p.name = newName; p.color = newColor; }

      if (CLOUD_ENABLED) {
        showToast('Syncing product name change...');
        const keysToUpdate = state.keys.filter(k => k.product === oldName);
        for (const key of keysToUpdate) {
          try {
            await cloudPatchById(key.id, { product: newName });
            key.product = newName; // Update local state after successful patch
          } catch (e) {
            console.error(`Failed to update product name for key ${key.code}`, e);
            alert(`Failed to update product name for key ${key.code}. Please refresh and try again.`);
          }
        }
        await save(); // Save the updated product list and any successful key changes
      } else {
        state.keys.forEach(k => { if (k.product === oldName) { k.product = newName; } });
        await save();
      }
      closeDialog('editProductModal');
    }

    async function onRefreshCloud(){
      const btn = document.querySelector('button[onclick="onRefreshCloud()"]');
      if (CLOUD_ENABLED){
        if (btn) btn.disabled = true;
        try {
          // Clear the keys before loading to ensure a fresh state is shown.
          state.keys = [];
          render(); // Show an empty table immediately for better UX.
          SYNC_TOASTED = false;
          await load();
        } catch(e) {
          // The `load` function now handles its own errors and banners.
          console.error("Refresh failed", e);
        } finally {
          if (btn) btn.disabled = false;
        }
      }else{ alert('Cloud sync is disabled. Set CLOUD_ENABLED = true to use Refresh.'); }
    }
    function onClearLocalCache(){ try{ localStorage.removeItem(STORAGE_KEY); alert('Local cache cleared. The page will reload.'); }catch(e){} location.reload(); }
    function onBulkAdd(){ $('#bulkProduct').value=(state.filterProduct==='All'||state.filterProduct==='Assigned')?'Shadow':state.filterProduct; $('#bulkType').value='Day'; $('#bulkText').value=''; openDialog('bulkModal'); }
    function onNewSingle(){ $('#s_product').value=(state.filterProduct==='All'||state.filterProduct==='Assigned')?'Shadow':state.filterProduct; $('#s_type').value='Day'; $('#s_code').value=''; openDialog('singleModal'); }

    async function saveBulkAdd(){
      const product=$('#bulkProduct').value;
      const type=$('#bulkType').value;
      const allExisting = new Set(state.keys.map(k=>String(k.code||'').toLowerCase()));
      const inputCodes = ($('#bulkText').value||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);

      const newCodes = []; const skipped = [];
      for(const c of inputCodes){
        const key = c.toLowerCase();
        if(allExisting.has(key)){ skipped.push(c); } else { newCodes.push(c); allExisting.add(key); }
      }
      const skippedCount = skipped.length;
      if(skipped.length){ alert('Skipped duplicates:\n' + skipped.join('\n')); }
      if(newCodes.length===0){ closeDialog('bulkModal'); return; }
      
      sendDiscordNotification({
        title: '📦 Stock Added (Bulk)',
        description: `**${newCodes.length}** new keys were added.`,
        color: 3092790, // A nice blue
        fields: [
          { name: 'Product', value: product, inline: true }, { name: 'Type', value: type, inline: true }, { name: 'Added By', value: (sessionStorage && sessionStorage.getItem('fs_user')) || 'unknown', inline: true }
        ],
        timestamp: new Date().toISOString()
      });

      if(CLOUD_ENABLED){
        const nowUser = (sessionStorage && sessionStorage.getItem('fs_user')) || '';
        const rows = newCodes.map(code => {
          const history = [{ action: 'created', by: nowUser, at: new Date().toISOString() }];
          return {
            id: uid(), code, product, type, status:'available', assignedTo:'', reason:'', date:'', assignedBy: nowUser, history
          };
        });
        await cloudAppend(rows);
        pushUndo({ type:'add', payload:{ ids: rows.map(r=>r.id) } });
        state.filterProduct = product;
        state.filterType = type;
        state.search = '';
        showBanner('Added '+rows.length+' '+product+' • '+type+' key(s).'+(skippedCount? ' Skipped '+skippedCount+' duplicate(s).':''));
        closeDialog('bulkModal'); showToast('Added ✔'); await load(); return;
      }

      const newItems=newCodes.map(code=>{
        const history = [{ action: 'created', by: (sessionStorage && sessionStorage.getItem('fs_user')) || 'unknown', at: new Date().toISOString() }];
        return {id:uid(), code, product, type, status:'available', assignedTo:'', reason:'', date:'', assignedBy:'', history};
      });
      state.keys.unshift(...newItems);
      pushUndo({ type:'add', payload:{ ids: newItems.map(r=>r.id) } });
      state.filterProduct = product;
      state.filterType = type;
      state.search = '';
      showBanner('Added '+newItems.length+' '+product+' • '+type+' key(s).'+(skippedCount? ' Skipped '+skippedCount+' duplicate(s).':''));
      closeDialog('bulkModal'); showToast('Added ✔'); save();
    }

    async function saveSingleAdd(){
      const code=($('#s_code').value||'').trim(); if(!code) return;
      const product=$('#s_product').value; const type=$('#s_type').value;
      const exists = state.keys.some(k => String(k.code||'').toLowerCase() === code.toLowerCase());
      if(exists){ alert('That code already exists and was not added.'); return; }
      
      sendDiscordNotification({
        title: '➕ New Key Added',
        color: 3092790, // A nice blue
        fields: [
          { name: 'Product', value: product, inline: true }, { name: 'Type', value: type, inline: true }, { name: 'Added By', value: (sessionStorage && sessionStorage.getItem('fs_user')) || 'unknown', inline: true }, { name: 'Key', value: '`' + code + '`', inline: false }
        ],
        timestamp: new Date().toISOString()
      });

      if(CLOUD_ENABLED){
        const nowUser = (sessionStorage && sessionStorage.getItem('fs_user')) || '';
        const id = uid();
        const history = [{ action: 'created', by: nowUser, at: new Date().toISOString() }];
        await cloudAppend([{ id, code, product, type, status:'available', assignedTo:'', reason:'', date:'', assignedBy: nowUser, history }]);
        pushUndo({ type:'add', payload:{ ids:[id] } });
        state.filterProduct = product;
        state.filterType = type;
        state.search = '';
        closeDialog('singleModal'); showToast('Added ✔'); await load(); return;
      }

      const history = [{ action: 'created', by: (sessionStorage && sessionStorage.getItem('fs_user')) || 'unknown', at: new Date().toISOString() }];
      const item={id:uid(), code, product, type, status:'available', assignedTo:'', reason:'', date:'', assignedBy:'', history};
      state.keys.unshift(item);
      pushUndo({ type:'add', payload:{ ids:[item.id] } });
      state.filterProduct = product;
      state.filterType = type;
      state.search = '';
      closeDialog('singleModal'); showToast('Added ✔'); save();
    }

    /* ---------- Expose to inline handlers ---------- */
    window.setFilter=setFilter; window.copyCode=copyCode; window.removeKey=removeKey; window.releaseKey=releaseKey; window.openAssign=openAssign; window.openHistory=openHistory;
    window.saveAssign=saveAssign; window.saveBulkAdd=saveBulkAdd; window.saveSingleAdd=saveSingleAdd;
    window.onUndo=onUndo; window.toggleManageMenu=toggleManageMenu; window.setSort=setSort;

    function toggleManageMenu(){
      var m = document.getElementById('manageMenu'); if(!m) return;
      var isOpen = m.style.display === 'block'; m.style.display = isOpen ? 'none' : 'block';
    }
    document.addEventListener('click', function(e){
      var wrap = document.querySelector('.menu-wrap'); var menu = document.getElementById('manageMenu');
      if(!wrap || !menu) return; if(!wrap.contains(e.target)){ if(menu.style.display==='block') menu.style.display='none'; }
    });

    document.addEventListener('keydown', function(e){
      if((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==='z'){ e.preventDefault(); onUndo(); }
      if((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); const s=document.getElementById('search'); if(s){ s.focus(); s.select(); } }
    });

    /* ---------- init ---------- */
    (async function(){
      applyTheme();

      // Initialize the GAPI ready promise immediately.
      whenGapiReady();

      startLoginRotator();
      setNetStatus(navigator.onLine);
      await load();
      if(!Array.isArray(state.keys)) state.keys=[];

      $('#passToggle')?.addEventListener('click', function(){
        const passInput = $('#loginPass');
        const isPass = passInput.type === 'password';
        passInput.type = isPass ? 'text' : 'password';
        this.textContent = isPass ? '🙈' : '👁️';
        this.setAttribute('aria-label', isPass ? 'Hide password' : 'Show password');
      });

      // Attach login form listeners only if the welcome screen is visible
      if (document.getElementById('welcomeScreen')?.style.display !== 'none') {
        document.getElementById('loginPass')?.addEventListener('input', toggleLoginButton);
        toggleLoginButton(); // Initial check
      }
      try{
        const authed = localStorage.getItem('fs_authed') === '1' || sessionStorage.getItem('fs_authed') === '1';
        if(authed){
          var el=document.getElementById('welcomeScreen'); if(el) el.style.display='none';
          const storage = localStorage.getItem('fs_authed') === '1' ? localStorage : sessionStorage;
          var u=storage.getItem('fs_user')||'User'; applyUserAccent(u);
          var menu=document.getElementById('userMenu'); var btn=document.getElementById('userBtn');
          if(u) sessionStorage.setItem('fs_user', u); // Ensure session has user for discord notifications
          if(menu) menu.style.display='inline-block'; if(btn) btn.textContent = u + ' ▾';
        }
      }catch(e){}
    })();

    function toggleSidebar(forceOpen){
      document.body.classList.toggle('sidebar-open', forceOpen);
    }
    $('#hamburgerBtn').addEventListener('click', () => toggleSidebar(true));

    function scrollTopSmooth(){ window.scrollTo({top:0,behavior:'smooth'}); }
    (function(){ const b=document.getElementById('backTop'); window.addEventListener('scroll',()=>{ if(window.scrollY>300){ b.style.display='block'; } else { b.style.display='none'; } }); })();