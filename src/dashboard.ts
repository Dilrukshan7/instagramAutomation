// Single-file admin dashboard served by the Worker at "/".
// Vanilla HTML/JS — no build step. Talks to the /api/* endpoints with the
// admin token (entered once, kept in localStorage).
export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IG Auto-Responder</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #0f1115; color: #e6e8ee; }
  header { padding: 16px 24px; background: #161a22; border-bottom: 1px solid #262c38; display: flex; align-items: center; gap: 16px; }
  header h1 { font-size: 18px; margin: 0; }
  header .pill { font-size: 12px; padding: 3px 10px; border-radius: 999px; background: #22314a; }
  main { max-width: 900px; margin: 0 auto; padding: 24px; }
  section { background: #161a22; border: 1px solid #262c38; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
  h2 { font-size: 15px; margin: 0 0 14px; color: #9fb4d8; text-transform: uppercase; letter-spacing: .08em; }
  label { display: block; font-size: 13px; color: #aab2c0; margin: 10px 0 4px; }
  input[type=text], input[type=password], textarea { width: 100%; background: #0d1016; color: #e6e8ee; border: 1px solid #2c3442; border-radius: 8px; padding: 9px 11px; font-size: 14px; font-family: inherit; }
  textarea { min-height: 64px; resize: vertical; }
  button { background: #2f6fed; color: #fff; border: 0; border-radius: 8px; padding: 9px 16px; font-size: 14px; cursor: pointer; }
  button:hover { background: #4580f2; }
  button.ghost { background: #232936; }
  button.danger { background: #46242a; color: #ff9b9b; }
  .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .toggle { display: flex; align-items: center; gap: 10px; padding: 10px 0; }
  .toggle input { width: 18px; height: 18px; }
  .rule { border: 1px solid #2c3442; border-radius: 10px; padding: 14px; margin-bottom: 14px; background: #121620; }
  .rule .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .hint { font-size: 12px; color: #6d7686; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #232936; vertical-align: top; }
  th { color: #9fb4d8; font-weight: 600; }
  .status-replied { color: #7fd88f; } .status-error { color: #ff9b9b; } .status-skipped { color: #d8c97f; }
  #toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #2f6fed; padding: 10px 22px; border-radius: 999px; opacity: 0; transition: opacity .3s; pointer-events: none; }
  #toast.show { opacity: 1; }
  #login { max-width: 420px; margin: 80px auto; }
  .muted { color: #6d7686; font-size: 13px; }
  .savebar { margin-top: 14px; }
  nav.tabs { max-width: 900px; margin: 18px auto 0; padding: 0 24px; display: flex; gap: 8px; }
  nav.tabs button { background: #1b2130; color: #aab2c0; }
  nav.tabs button.active { background: #2f6fed; color: #fff; }
  .post { display: flex; gap: 14px; border: 1px solid #2c3442; border-radius: 10px; padding: 12px; margin-bottom: 12px; background: #121620; align-items: flex-start; }
  .post img { width: 84px; height: 84px; object-fit: cover; border-radius: 8px; background: #0d1016; }
  .post .meta { flex: 1; min-width: 0; }
  .post .cap { font-size: 13px; color: #cfd5e1; margin: 2px 0 8px; overflow: hidden; text-overflow: ellipsis; }
  .post .opts { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; }
  .post .opts label { display: flex; align-items: center; gap: 6px; margin: 0; color: #aab2c0; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #22314a; margin-left: 8px; }
</style>
</head>
<body>
<header>
  <h1>IG Auto-Responder</h1>
  <span class="pill" id="botState">...</span>
  <span style="flex:1"></span>
  <button class="ghost" id="logoutBtn" style="display:none">Change token</button>
</header>

<main id="login">
  <section>
    <h2>Sign in</h2>
    <label>Admin token</label>
    <input type="password" id="tokenInput" placeholder="Paste your ADMIN_TOKEN">
    <div class="savebar"><button id="loginBtn">Open dashboard</button></div>
    <p class="hint">This is the ADMIN_TOKEN you set with wrangler. It is stored only in this browser.</p>
  </section>
</main>

<nav class="tabs" id="tabs" style="display:none">
  <button data-tab="settings" class="active">Settings</button>
  <button data-tab="posts">Posts</button>
  <button data-tab="providers">AI Providers</button>
  <button data-tab="funnel">Funnel</button>
</nav>

<main id="app" style="display:none">

  <div id="tab-posts" style="display:none">
    <section>
      <h2>Which posts get automation?</h2>
      <div class="row">
        <label style="margin:0"><input type="radio" name="postMode" value="all"> All posts (default — every post replies unless turned off below)</label>
      </div>
      <div class="row">
        <label style="margin:0"><input type="radio" name="postMode" value="selected"> Only selected posts (new posts stay OFF until enabled below)</label>
      </div>
    </section>
    <section>
      <h2>Recent posts &amp; reels <button class="ghost" id="refreshMediaBtn" style="float:right">Refresh</button></h2>
      <div id="postsList"><p class="muted">Loading posts...</p></div>
    </section>
  </div>

  <div id="tab-funnel" style="display:none">
    <section>
      <h2>Follow-gate funnel <button class="ghost" id="refreshPendingBtn" style="float:right">Refresh</button></h2>
      <p class="hint">People who commented on a follow-gated post. They get the nudge DM, then the resource is delivered once they reply and their follow is confirmed. Waiting rows expire after 7 days.</p>
      <table>
        <thead><tr><th>User ID</th><th>Status</th><th>Nudges</th><th>Created</th><th>Delivered</th><th>Resource</th></tr></thead>
        <tbody id="pendingBody"></tbody>
      </table>
    </section>
  </div>

  <div id="tab-providers" style="display:none">
    <section>
      <h2>Add AI provider</h2>
      <div class="row">
        <div style="flex:1;min-width:140px">
          <label>Provider</label>
          <select id="pKind" style="width:100%;background:#0d1016;color:#e6e8ee;border:1px solid #2c3442;border-radius:8px;padding:9px">
            <option value="gemini">Google Gemini</option>
            <option value="grok">xAI Grok</option>
            <option value="groq">Groq</option>
            <option value="openrouter">OpenRouter</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic Claude</option>
            <option value="custom">Custom / Local LLM (OpenAI-compatible)</option>
          </select>
        </div>
        <div style="flex:1;min-width:140px">
          <label>Label</label>
          <input type="text" id="pLabel" placeholder="e.g. My Gemini">
        </div>
      </div>
      <label>API key</label>
      <input type="password" id="pKey" placeholder="paste key (leave empty for local models)">
      <div class="row">
        <div style="flex:1;min-width:160px">
          <label>Model</label>
          <input type="text" id="pModel" placeholder="auto-filled from preset">
        </div>
        <div style="flex:2;min-width:200px" id="pBaseWrap">
          <label>Base URL (custom/local only)</label>
          <input type="text" id="pBase" placeholder="https://your-tunnel.example.com/v1">
        </div>
      </div>
      <p class="hint">Local models (Ollama / LM Studio) run on your PC — the bot in the cloud can only reach them through a public tunnel URL (e.g. cloudflared). Paste that tunnel URL as the Base URL.</p>
      <div class="savebar"><button id="pAddBtn">Add provider</button></div>
    </section>
    <section>
      <h2>Configured providers</h2>
      <div id="providersList"><p class="muted">Loading...</p></div>
    </section>
    <section>
      <h2>AI usage (30 days)</h2>
      <table>
        <thead><tr><th>Provider</th><th>Calls</th><th>Tokens in</th><th>Tokens out</th></tr></thead>
        <tbody id="usageBody"></tbody>
      </table>
    </section>
  </div>

  <div id="tab-settings">

  <section>
    <h2>Bot settings</h2>
    <div class="toggle"><input type="checkbox" id="enabledToggle"><span>Bot enabled (replies to new comments)</span></div>
    <div class="toggle"><input type="checkbox" id="aiToggle"><span>AI replies enabled (for comments that match no keyword)</span></div>
    <label>Anthropic API key <span class="muted" id="aiKeyStatus"></span></label>
    <div class="row">
      <input type="password" id="aiKeyInput" placeholder="sk-ant-..." style="flex:1">
      <button id="saveKeyBtn">Save key</button>
      <button class="danger" id="clearKeyBtn">Remove key</button>
    </div>
    <p class="hint">Without a key (or with AI off), non-keyword comments get the fallback reply below.</p>
    <div class="savebar"><button id="saveSettingsBtn">Save settings</button></div>
    <p class="hint" id="tokenMeta"></p>
  </section>

  <section>
    <h2>Keyword rules</h2>
    <p class="hint">When a comment contains one of the keywords, one public reply and one DM are picked at random from the lists. One entry per line.</p>
    <div id="rulesList"></div>
    <div class="row savebar">
      <button class="ghost" id="addRuleBtn">+ Add rule</button>
      <button id="saveRulesBtn">Save rules</button>
    </div>
  </section>

  <section>
    <h2>Fallback reply (no keyword match, AI off/unavailable)</h2>
    <label>Public replies (one per line, picked randomly)</label>
    <textarea id="fbPublic"></textarea>
    <label>DM messages (one per line, picked randomly)</label>
    <textarea id="fbDm"></textarea>
    <div class="savebar"><button id="saveFbBtn">Save fallback</button></div>
  </section>

  <section>
    <h2>Blocklist</h2>
    <label>If a comment contains any of these phrases, the bot stays silent (one per line)</label>
    <textarea id="blocklist"></textarea>
    <div class="savebar"><button id="saveBlockBtn">Save blocklist</button></div>
  </section>

  <section>
    <h2>Activity log <button class="ghost" id="refreshLogBtn" style="float:right">Refresh</button></h2>
    <table>
      <thead><tr><th>Time</th><th>From</th><th>Comment</th><th>Reply</th><th>Status</th></tr></thead>
      <tbody id="logBody"></tbody>
    </table>
  </section>

  </div>

</main>

<div id="toast"></div>

<script>
(function () {
  var TOKEN = localStorage.getItem('admToken') || '';

  function el(id) { return document.getElementById(id); }
  function toast(msg) {
    var t = el('toast'); t.textContent = msg; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function lines(text) {
    return text.split('\\n').map(function (s) { return s.trim(); }).filter(function (s) { return s !== ''; });
  }
  function api(path, method, body) {
    return fetch('/api' + path, {
      method: method || 'GET',
      headers: { 'x-admin-token': TOKEN, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 403) { showLogin(); throw new Error('Invalid admin token'); }
      if (!r.ok) { throw new Error('Request failed: ' + r.status); }
      return r.json();
    });
  }

  function showLogin() {
    el('login').style.display = ''; el('app').style.display = 'none';
    el('logoutBtn').style.display = 'none'; el('tabs').style.display = 'none';
  }
  function showApp() {
    el('login').style.display = 'none'; el('app').style.display = '';
    el('logoutBtn').style.display = ''; el('tabs').style.display = '';
  }

  // ---------- Settings ----------
  function loadSettings() {
    return api('/settings').then(function (s) {
      el('enabledToggle').checked = s.enabled;
      el('aiToggle').checked = s.aiEnabled;
      el('botState').textContent = s.enabled ? 'ACTIVE' : 'PAUSED';
      el('botState').style.background = s.enabled ? '#1d3b28' : '#46242a';
      var src = s.aiKeySource;
      el('aiKeyStatus').textContent = src === 'dashboard' ? '(key saved from dashboard)'
        : src === 'secret' ? '(using key from wrangler secret)' : '(no key set)';
      el('tokenMeta').textContent = s.tokenMeta
        ? 'Instagram token last refreshed: ' + s.tokenMeta.refreshedAt
        : 'Instagram token: using initial secret (auto-refreshes weekly).';
    });
  }
  el('saveSettingsBtn').onclick = function () {
    api('/settings', 'PUT', {
      enabled: el('enabledToggle').checked,
      aiEnabled: el('aiToggle').checked
    }).then(function () { toast('Settings saved'); return loadSettings(); });
  };
  el('saveKeyBtn').onclick = function () {
    var key = el('aiKeyInput').value.trim();
    if (!key) { toast('Paste a key first'); return; }
    api('/settings', 'PUT', { anthropicKey: key }).then(function () {
      el('aiKeyInput').value = ''; toast('API key saved'); return loadSettings();
    });
  };
  el('clearKeyBtn').onclick = function () {
    api('/settings', 'PUT', { anthropicKey: '' }).then(function () {
      toast('API key removed'); return loadSettings();
    });
  };

  // ---------- Rules ----------
  function ruleCard(rule, index) {
    var div = document.createElement('div');
    div.className = 'rule';
    var head = document.createElement('div');
    head.className = 'head';
    var title = document.createElement('strong');
    title.textContent = 'Rule ' + (index + 1);
    var del = document.createElement('button');
    del.className = 'danger'; del.textContent = 'Delete';
    del.onclick = function () { div.remove(); renumber(); };
    head.appendChild(title); head.appendChild(del);
    div.appendChild(head);

    div.appendChild(field('Keywords (comma separated)', 'input', rule.keywords.join(', '), 'kw'));
    div.appendChild(field('Public replies (one per line)', 'textarea', rule.publicReplies.join('\\n'), 'pub'));
    div.appendChild(field('DM messages (one per line)', 'textarea', rule.dmMessages.join('\\n'), 'dm'));
    return div;
  }
  function field(labelText, kind, value, cls) {
    var wrap = document.createElement('div');
    var label = document.createElement('label');
    label.textContent = labelText;
    var input = document.createElement(kind === 'input' ? 'input' : 'textarea');
    if (kind === 'input') { input.type = 'text'; }
    input.value = value;
    input.className = cls;
    wrap.appendChild(label); wrap.appendChild(input);
    return wrap;
  }
  function renumber() {
    var cards = el('rulesList').children;
    for (var i = 0; i < cards.length; i++) {
      cards[i].querySelector('strong').textContent = 'Rule ' + (i + 1);
    }
  }
  function loadRules() {
    return api('/rules').then(function (rules) {
      var list = el('rulesList');
      list.innerHTML = '';
      rules.forEach(function (r, i) { list.appendChild(ruleCard(r, i)); });
    });
  }
  el('addRuleBtn').onclick = function () {
    var list = el('rulesList');
    list.appendChild(ruleCard({ keywords: [], publicReplies: [], dmMessages: [] }, list.children.length));
  };
  el('saveRulesBtn').onclick = function () {
    var rules = [];
    var cards = el('rulesList').children;
    for (var i = 0; i < cards.length; i++) {
      var kw = cards[i].querySelector('.kw').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var pub = lines(cards[i].querySelector('.pub').value);
      var dm = lines(cards[i].querySelector('.dm').value);
      if (kw.length === 0 && pub.length === 0 && dm.length === 0) { continue; }
      if (kw.length === 0 || pub.length === 0 || dm.length === 0) {
        toast('Rule ' + (i + 1) + ' needs keywords, at least one public reply and one DM'); return;
      }
      rules.push({ keywords: kw, publicReplies: pub, dmMessages: dm });
    }
    api('/rules', 'PUT', rules).then(function () { toast('Rules saved'); return loadRules(); });
  };

  // ---------- Fallback ----------
  function loadFallback() {
    return api('/fallback').then(function (fb) {
      el('fbPublic').value = fb.publicReplies.join('\\n');
      el('fbDm').value = fb.dmMessages.join('\\n');
    });
  }
  el('saveFbBtn').onclick = function () {
    var pub = lines(el('fbPublic').value);
    var dm = lines(el('fbDm').value);
    if (pub.length === 0 || dm.length === 0) { toast('Need at least one public reply and one DM'); return; }
    api('/fallback', 'PUT', { publicReplies: pub, dmMessages: dm })
      .then(function () { toast('Fallback saved'); });
  };

  // ---------- Blocklist ----------
  function loadBlocklist() {
    return api('/blocklist').then(function (b) { el('blocklist').value = b.join('\\n'); });
  }
  el('saveBlockBtn').onclick = function () {
    api('/blocklist', 'PUT', lines(el('blocklist').value))
      .then(function () { toast('Blocklist saved'); });
  };

  // ---------- Log ----------
  function loadLog() {
    return api('/logs').then(function (entries) {
      var body = el('logBody');
      body.innerHTML = '';
      entries.forEach(function (e) {
        var tr = document.createElement('tr');
        [
          (e.ts || '').replace('T', ' ').slice(0, 19),
          e.from || '',
          e.commentText || '',
          e.publicReply || (e.detail || ''),
          e.status || ''
        ].forEach(function (v, i) {
          var td = document.createElement('td');
          td.textContent = v;
          if (i === 4) { td.className = 'status-' + v; }
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      if (entries.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="muted">No activity yet.</td></tr>';
      }
    });
  }
  el('refreshLogBtn').onclick = loadLog;

  // ---------- Tabs ----------
  var tabsEl = el('tabs');
  var mediaLoaded = false;
  var providersLoaded = false;
  var providersCache = [];
  var defaultProviderId = null;
  tabsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button'); if (!btn) { return; }
    var tab = btn.getAttribute('data-tab');
    var btns = tabsEl.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) { btns[i].classList.remove('active'); }
    btn.classList.add('active');
    el('tab-settings').style.display = tab === 'settings' ? '' : 'none';
    el('tab-posts').style.display = tab === 'posts' ? '' : 'none';
    el('tab-providers').style.display = tab === 'providers' ? '' : 'none';
    el('tab-funnel').style.display = tab === 'funnel' ? '' : 'none';
    if (tab === 'posts' && !mediaLoaded) { loadProviders().then(loadMedia); }
    if (tab === 'providers' && !providersLoaded) { loadProviders(); }
    if (tab === 'funnel') { loadPending(); }
  });

  // ---------- Funnel (pending deliveries) ----------
  function loadPending() {
    return api('/pending').then(function (rows) {
      var body = el('pendingBody');
      body.innerHTML = '';
      (rows || []).forEach(function (r) {
        var tr = document.createElement('tr');
        [
          r.igUserId,
          r.status,
          r.nudges,
          (r.createdAt || '').slice(0, 16),
          (r.deliveredAt || '').slice(0, 16),
          r.resourcePreview
        ].forEach(function (v, i) {
          var td = document.createElement('td');
          td.textContent = v == null ? '' : v;
          if (i === 1) {
            td.className = v === 'delivered' ? 'status-replied' : v === 'expired' ? 'status-error' : 'status-skipped';
          }
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      if (!rows || rows.length === 0) {
        body.innerHTML = '<tr><td colspan="6" class="muted">No funnel activity yet.</td></tr>';
      }
    });
  }
  el('refreshPendingBtn').onclick = function () { loadPending(); };

  // ---------- Providers ----------
  var PRESETS = null;
  function loadProviders() {
    return api('/providers').then(function (res) {
      providersLoaded = true;
      PRESETS = res.presets;
      providersCache = res.providers;
      defaultProviderId = res.defaultId;
      renderProviders();
      return api('/usage');
    }).then(function (usage) {
      var body = el('usageBody');
      body.innerHTML = '';
      (usage || []).forEach(function (u) {
        var tr = document.createElement('tr');
        [u.provider, u.calls, u.tokens_in, u.tokens_out].forEach(function (v) {
          var td = document.createElement('td'); td.textContent = v == null ? '' : v; tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      if (!usage || usage.length === 0) {
        body.innerHTML = '<tr><td colspan="4" class="muted">No AI calls yet.</td></tr>';
      }
    });
  }
  function renderProviders() {
    var list = el('providersList');
    list.innerHTML = '';
    if (providersCache.length === 0) {
      list.innerHTML = '<p class="muted">No providers yet. The bot falls back to the legacy Anthropic key (Settings tab) or template replies.</p>';
      return;
    }
    providersCache.forEach(function (p) {
      var div = document.createElement('div');
      div.className = 'rule';
      var head = document.createElement('div');
      head.className = 'head';
      var title = document.createElement('strong');
      title.textContent = p.label + ' (' + p.kind + ' / ' + (p.default_model || '?') + ')';
      if (p.id === defaultProviderId) {
        var star = document.createElement('span'); star.className = 'badge'; star.textContent = 'DEFAULT';
        title.appendChild(star);
      }
      head.appendChild(title);
      var btns = document.createElement('div');
      btns.className = 'row';
      btns.appendChild(actionBtn('Test', '', function (btn) {
        btn.textContent = 'Testing...';
        api('/providers/' + p.id + '/test', 'POST').then(function (r) {
          toast(r.ok ? 'OK: ' + r.detail : 'FAILED: ' + r.detail);
          loadProviders();
        });
      }));
      btns.appendChild(actionBtn(p.enabled ? 'Disable' : 'Enable', 'ghost', function () {
        api('/providers/' + p.id, 'PUT', { enabled: !p.enabled }).then(loadProviders);
      }));
      if (p.id !== defaultProviderId) {
        btns.appendChild(actionBtn('Make default', 'ghost', function () {
          api('/providers/' + p.id, 'PUT', { makeDefault: true }).then(loadProviders);
        }));
      }
      btns.appendChild(actionBtn('Delete', 'danger', function () {
        if (confirm('Delete provider "' + p.label + '"?')) {
          api('/providers/' + p.id, 'DELETE').then(loadProviders);
        }
      }));
      head.appendChild(btns);
      div.appendChild(head);
      var status = document.createElement('p');
      status.className = 'hint';
      status.textContent = (p.enabled ? 'Enabled' : 'Disabled')
        + ' | key: ' + (p.has_key ? 'set' : 'none')
        + (p.base_url ? ' | ' + p.base_url : '')
        + (p.last_test_at ? ' | last test: ' + (p.last_test_ok ? 'OK' : 'failed') + ' at ' + p.last_test_at : ' | never tested');
      div.appendChild(status);
      list.appendChild(div);
    });
  }
  function actionBtn(text, cls, onclick) {
    var b = document.createElement('button');
    b.textContent = text; if (cls) { b.className = cls; }
    b.onclick = function () { onclick(b); };
    return b;
  }
  el('pKind').onchange = function () {
    var preset = PRESETS && PRESETS[el('pKind').value];
    if (preset) { el('pModel').value = preset.model; el('pBase').value = preset.baseUrl || ''; }
    el('pBaseWrap').style.display = el('pKind').value === 'custom' ? '' : 'none';
  };
  el('pAddBtn').onclick = function () {
    var kind = el('pKind').value;
    var label = el('pLabel').value.trim() || kind;
    api('/providers', 'POST', {
      kind: kind, label: label,
      apiKey: el('pKey').value.trim(),
      model: el('pModel').value.trim(),
      baseUrl: el('pBase').value.trim()
    }).then(function () {
      el('pKey').value = ''; el('pLabel').value = '';
      toast('Provider added - click Test to verify it');
      loadProviders();
    });
  };

  // ---------- Posts ----------
  function postCard(m) {
    var a = m.automation;
    var div = document.createElement('div');
    div.className = 'post';
    var img = document.createElement('img');
    img.src = m.thumbnail_url || m.media_url || '';
    img.loading = 'lazy';
    div.appendChild(img);
    var meta = document.createElement('div');
    meta.className = 'meta';
    var head = document.createElement('div');
    var strong = document.createElement('strong');
    strong.textContent = (m.media_product_type || m.media_type || 'POST');
    head.appendChild(strong);
    var badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = (m.timestamp || '').slice(0, 10);
    head.appendChild(badge);
    if (m.permalink) {
      var link = document.createElement('a');
      link.href = m.permalink; link.target = '_blank'; link.textContent = 'open';
      link.style.marginLeft = '8px'; link.style.color = '#7fa7f5'; link.style.fontSize = '12px';
      head.appendChild(link);
    }
    meta.appendChild(head);
    var cap = document.createElement('div');
    cap.className = 'cap';
    cap.textContent = m.caption || '(no caption)';
    meta.appendChild(cap);
    var opts = document.createElement('div');
    opts.className = 'opts';
    opts.appendChild(check('Automation', a ? a.enabled : null, 'enabled'));
    opts.appendChild(check('Public reply', a ? a.autoReply : true, 'autoReply'));
    opts.appendChild(check('DM', a ? a.autoDm : true, 'autoDm'));
    opts.appendChild(check('Once per user', a ? a.oncePerUser : false, 'oncePerUser'));
    if (providersCache.length > 0) {
      var provLabel = document.createElement('label');
      provLabel.appendChild(document.createTextNode('AI:'));
      var sel = document.createElement('select');
      sel.style.cssText = 'background:#0d1016;color:#e6e8ee;border:1px solid #2c3442;border-radius:6px;padding:4px';
      var optDefault = document.createElement('option');
      optDefault.value = ''; optDefault.textContent = 'default';
      sel.appendChild(optDefault);
      providersCache.forEach(function (p) {
        var o = document.createElement('option');
        o.value = String(p.id); o.textContent = p.label;
        if (a && a.providerId === p.id) { o.selected = true; }
        sel.appendChild(o);
      });
      sel.onchange = function () {
        api('/automations', 'PUT', {
          mediaId: m.id,
          providerId: sel.value === '' ? null : parseInt(sel.value, 10)
        }).then(function () { toast('AI provider saved'); });
      };
      provLabel.appendChild(sel);
      opts.appendChild(provLabel);
    }
    meta.appendChild(opts);
    var hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = a === null
      ? 'No custom settings yet - follows the global mode above. Toggle anything to customize.'
      : '';
    meta.appendChild(hint);
    meta.appendChild(followGateSection(m.id, a));
    meta.appendChild(seqSection(m.id));
    div.appendChild(meta);

    function check(labelText, value, field) {
      var label = document.createElement('label');
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = value === null ? postModeIsAll() : !!value;
      input.onchange = function () {
        var body = { mediaId: m.id };
        body[field] = input.checked;
        if (field !== 'enabled' && a === null) { body.enabled = true; }
        api('/automations', 'PUT', body).then(function () {
          toast('Saved'); mediaLoaded = false; loadMedia();
        });
      };
      label.appendChild(input);
      label.appendChild(document.createTextNode(labelText));
      return label;
    }
    return div;
  }
  function postModeIsAll() {
    var r = document.querySelector('input[name=postMode]:checked');
    return !r || r.value === 'all';
  }
  function followGateSection(mediaId, a) {
    var wrap = document.createElement('div');
    wrap.style.marginTop = '8px';
    var toggle = document.createElement('button');
    toggle.className = 'ghost';
    toggle.textContent = 'Follow-gate' + (a && a.requireFollow ? ' (ON)' : '');
    var panel = document.createElement('div');
    panel.style.display = 'none';
    panel.style.marginTop = '8px';
    toggle.onclick = function () {
      panel.style.display = panel.style.display === 'none' ? '' : 'none';
    };
    var chkLabel = document.createElement('label');
    chkLabel.style.cssText = 'display:flex;align-items:center;gap:8px;margin:0 0 8px';
    var chk = document.createElement('input'); chk.type = 'checkbox';
    chk.checked = !!(a && a.requireFollow);
    chkLabel.appendChild(chk);
    chkLabel.appendChild(document.createTextNode('Require the user to follow before delivering the resource'));
    var l1 = document.createElement('label'); l1.textContent = 'Nudge DM (the one proactive message: thank-you + "follow & reply to get it")';
    var nudge = document.createElement('textarea');
    nudge.value = (a && a.nudgeMessage) || '';
    nudge.placeholder = 'Thanks {username}! Follow the page and reply here and I\\'ll send it over automatically';
    var l2 = document.createElement('label'); l2.textContent = 'Resource message (delivered after they reply + follow is confirmed)';
    var resource = document.createElement('textarea');
    resource.value = (a && a.resourceMessage) || '';
    resource.placeholder = 'Here is your free guide: https://...';
    var help = document.createElement('p'); help.className = 'hint';
    help.textContent = 'Instagram has no "user followed" event, so delivery is triggered when the commenter replies to the nudge DM (which opens a messaging window); their follow is then checked and the resource sent. A background check also delivers to anyone confirmed following. Uses {username} / {comment}.';
    var saveBtn = document.createElement('button'); saveBtn.textContent = 'Save follow-gate';
    saveBtn.style.marginTop = '10px';
    saveBtn.onclick = function () {
      if (chk.checked && resource.value.trim() === '') { toast('Add a resource message to gate on'); return; }
      api('/automations', 'PUT', {
        mediaId: mediaId,
        enabled: true,
        requireFollow: chk.checked,
        nudgeMessage: nudge.value,
        resourceMessage: resource.value
      }).then(function () {
        toast('Follow-gate saved'); mediaLoaded = false; loadMedia();
      });
    };
    panel.appendChild(chkLabel);
    panel.appendChild(l1); panel.appendChild(nudge);
    panel.appendChild(l2); panel.appendChild(resource);
    panel.appendChild(help); panel.appendChild(saveBtn);
    wrap.appendChild(toggle); wrap.appendChild(panel);
    return wrap;
  }
  function seqSection(mediaId) {
    var wrap = document.createElement('div');
    wrap.style.marginTop = '8px';
    var toggle = document.createElement('button');
    toggle.className = 'ghost';
    toggle.textContent = 'Message sequence';
    var panel = document.createElement('div');
    panel.style.display = 'none';
    panel.style.marginTop = '8px';
    var loaded = false;
    toggle.onclick = function () {
      var open = panel.style.display === 'none';
      panel.style.display = open ? '' : 'none';
      if (open && !loaded) { loaded = true; loadSteps(); }
    };
    var help = document.createElement('p');
    help.className = 'hint';
    help.textContent = 'A saved sequence replaces the simple auto-reply for this post. Steps run in order, spaced by their delay plus 2-8s. One variation is picked at random per commenter. Use {username} and {comment} as placeholders. The Public reply / DM toggles above still filter which steps run.';
    var stepsBox = document.createElement('div');
    var controls = document.createElement('div');
    controls.className = 'row'; controls.style.marginTop = '8px';
    controls.appendChild(mkBtn('+ Add step', 'ghost', function () {
      stepsBox.appendChild(stepRow({ type: 'dm', variations: [], delaySeconds: 0 }));
    }));
    controls.appendChild(mkBtn('Save sequence', '', function () { save(); }));
    controls.appendChild(mkBtn('Clear', 'danger', function () {
      if (confirm('Remove the whole sequence for this post?')) {
        api('/steps', 'PUT', { mediaId: mediaId, steps: [] }).then(function () {
          stepsBox.innerHTML = ''; toast('Sequence cleared');
        });
      }
    }));
    panel.appendChild(help); panel.appendChild(stepsBox); panel.appendChild(controls);
    wrap.appendChild(toggle); wrap.appendChild(panel);

    function mkBtn(t, cls, fn) {
      var b = document.createElement('button'); b.type = 'button';
      b.textContent = t; if (cls) { b.className = cls; } b.onclick = fn; return b;
    }
    function stepRow(step) {
      var row = document.createElement('div');
      row.className = 'rule';
      var head = document.createElement('div'); head.className = 'head';
      var left = document.createElement('div'); left.className = 'row';
      var typeSel = document.createElement('select');
      typeSel.className = 'stepType';
      typeSel.style.cssText = 'background:#0d1016;color:#e6e8ee;border:1px solid #2c3442;border-radius:6px;padding:5px';
      [['public_reply', 'Public reply'], ['dm', 'DM']].forEach(function (o) {
        var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1];
        if (step.type === o[0]) { op.selected = true; } typeSel.appendChild(op);
      });
      left.appendChild(typeSel);
      var delayWrap = document.createElement('label'); delayWrap.style.margin = '0';
      delayWrap.appendChild(document.createTextNode('delay(s):'));
      var delay = document.createElement('input'); delay.type = 'number'; delay.min = '0';
      delay.className = 'stepDelay'; delay.value = step.delaySeconds || 0;
      delay.style.cssText = 'width:70px;padding:5px';
      delayWrap.appendChild(delay); left.appendChild(delayWrap);
      head.appendChild(left);
      var btns = document.createElement('div'); btns.className = 'row';
      btns.appendChild(mkBtn('Up', 'ghost', function () { if (row.previousSibling) { stepsBox.insertBefore(row, row.previousSibling); } }));
      btns.appendChild(mkBtn('Down', 'ghost', function () { if (row.nextSibling) { stepsBox.insertBefore(row.nextSibling, row); } }));
      btns.appendChild(mkBtn('Remove', 'danger', function () { row.remove(); }));
      head.appendChild(btns);
      row.appendChild(head);
      var ta = document.createElement('textarea'); ta.className = 'stepVars';
      ta.placeholder = 'One message per line - a random one is chosen each time';
      ta.value = (step.variations || []).join('\\n');
      row.appendChild(ta);
      return row;
    }
    function loadSteps() {
      api('/steps?mediaId=' + encodeURIComponent(mediaId)).then(function (steps) {
        stepsBox.innerHTML = '';
        steps.forEach(function (s) { stepsBox.appendChild(stepRow(s)); });
        if (steps.length === 0) { stepsBox.appendChild(stepRow({ type: 'public_reply', variations: [], delaySeconds: 0 })); }
      });
    }
    function save() {
      var rows = stepsBox.children; var steps = [];
      for (var i = 0; i < rows.length; i++) {
        var type = rows[i].querySelector('.stepType').value;
        var vars = lines(rows[i].querySelector('.stepVars').value);
        var d = parseInt(rows[i].querySelector('.stepDelay').value, 10) || 0;
        if (vars.length === 0) { toast('Step ' + (i + 1) + ' needs at least one message'); return; }
        steps.push({ type: type, variations: vars, delaySeconds: d });
      }
      api('/steps', 'PUT', { mediaId: mediaId, steps: steps }).then(function () {
        toast('Sequence saved (' + steps.length + ' steps)');
      });
    }
    return wrap;
  }
  function loadMedia() {
    return api('/media').then(function (res) {
      mediaLoaded = true;
      var radios = document.querySelectorAll('input[name=postMode]');
      for (var i = 0; i < radios.length; i++) { radios[i].checked = radios[i].value === res.postMode; }
      var list = el('postsList');
      list.innerHTML = '';
      if (res.media.length === 0) {
        list.innerHTML = '<p class="muted">No posts found (or the Instagram token lacks media access).</p>';
        return;
      }
      res.media.forEach(function (m) { list.appendChild(postCard(m)); });
    }).catch(function () {
      el('postsList').innerHTML = '<p class="muted">Could not load posts - check the activity log / token.</p>';
    });
  }
  el('refreshMediaBtn').onclick = function () { loadMedia(); };
  document.addEventListener('change', function (e) {
    if (e.target.name === 'postMode') {
      api('/automations', 'PUT', { postMode: e.target.value }).then(function () { toast('Mode saved'); });
    }
  });

  // ---------- Boot ----------
  function boot() {
    Promise.all([loadSettings(), loadRules(), loadFallback(), loadBlocklist(), loadLog()])
      .then(showApp)
      .catch(function (err) { console.log(err); });
  }
  el('loginBtn').onclick = function () {
    TOKEN = el('tokenInput').value.trim();
    if (!TOKEN) { return; }
    localStorage.setItem('admToken', TOKEN);
    boot();
  };
  el('tokenInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { el('loginBtn').click(); } });
  el('logoutBtn').onclick = function () {
    localStorage.removeItem('admToken'); TOKEN = '';
    showLogin();
  };

  if (TOKEN) { boot(); } else { showLogin(); }
})();
</script>
</body>
</html>`;
