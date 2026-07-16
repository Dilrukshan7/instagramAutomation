// Single-file admin dashboard served by the Worker at "/".
// Vanilla HTML/JS — no build step. Talks to the /api/* endpoints with the
// admin token (entered once, kept in localStorage).
//
// NOTE: this whole string is a TS template literal, so the embedded CSS/JS must
// never use backticks or ${...}. Use string concatenation and \\n instead.
export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IG Auto-Responder</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0f1115; --panel: #161a22; --panel-2: #121620; --input: #0d1016;
    --line: #262c38; --line-2: #2c3442; --text: #e6e8ee; --muted: #8b93a3;
    --dim: #6d7686; --head: #9fb4d8; --accent: #2f6fed; --accent-hi: #4580f2;
    --s1: 6px; --s2: 10px; --s3: 14px; --s4: 20px; --s5: 28px;
    --radius: 12px; --radius-sm: 8px;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); font-size: 14px; }

  /* Top bar */
  .topbar { display: flex; align-items: center; gap: var(--s3); padding: 14px 24px; background: var(--panel); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 20; }
  .topbar h1 { font-size: 17px; margin: 0; letter-spacing: .01em; }
  .pill { font-size: 12px; padding: 3px 12px; border-radius: 999px; background: #22314a; white-space: nowrap; }

  /* Layout: sidebar + content */
  .layout { display: flex; align-items: stretch; min-height: calc(100vh - 57px); }
  .sidebar { width: 208px; flex: 0 0 208px; background: var(--panel); border-right: 1px solid var(--line); padding: var(--s3) var(--s2); overflow-y: auto; }
  .sidebar .navgroup { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: var(--dim); margin: var(--s3) var(--s2) var(--s1); }
  .sidebar .navgroup:first-child { margin-top: var(--s1); }
  .sidebar button { display: block; width: 100%; text-align: left; background: transparent; color: var(--muted); border: 0; border-radius: var(--radius-sm); padding: 9px 12px; font-size: 14px; cursor: pointer; margin-bottom: 2px; }
  .sidebar button:hover { background: #1b2130; color: var(--text); }
  .sidebar button.active { background: var(--accent); color: #fff; }

  main.content { flex: 1; min-width: 0; max-width: 940px; padding: var(--s4); }
  .panel { animation: fade .15s ease; }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }

  /* Cards */
  section { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: var(--s4); margin-bottom: var(--s4); }
  .section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s2); margin-bottom: var(--s3); }
  .section-head h2 { margin: 0; }
  h2 { font-size: 13px; margin: 0 0 var(--s3); color: var(--head); text-transform: uppercase; letter-spacing: .08em; }
  .panel-title { font-size: 20px; text-transform: none; letter-spacing: 0; color: var(--text); margin: 0 0 var(--s4); }

  /* Forms */
  label { display: block; font-size: 13px; color: var(--muted); margin: var(--s2) 0 var(--s1); }
  input[type=text], input[type=password], input[type=number], textarea, select.sel {
    width: 100%; background: var(--input); color: var(--text); border: 1px solid var(--line-2); border-radius: var(--radius-sm); padding: 9px 11px; font-size: 14px; font-family: inherit;
  }
  textarea { min-height: 64px; resize: vertical; }
  select.sel { cursor: pointer; }

  /* Buttons */
  button { background: var(--accent); color: #fff; border: 0; border-radius: var(--radius-sm); padding: 9px 16px; font-size: 14px; cursor: pointer; }
  button:hover { background: var(--accent-hi); }
  button.ghost { background: #232936; color: var(--text); }
  button.ghost:hover { background: #2b3341; }
  button.danger { background: #46242a; color: #ff9b9b; }
  button.danger:hover { background: #55282f; }
  button.sm { padding: 6px 12px; font-size: 13px; }

  .row { display: flex; gap: var(--s2); align-items: center; flex-wrap: wrap; }
  .savebar { margin-top: var(--s3); }
  .toggle { display: flex; align-items: center; gap: var(--s2); padding: 8px 0; }
  .toggle input { width: 18px; height: 18px; flex: 0 0 auto; }
  .hint { font-size: 12px; color: var(--dim); margin-top: 4px; line-height: 1.5; }
  .muted { color: var(--dim); font-size: 13px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #232936; vertical-align: top; }
  th { color: var(--head); font-weight: 600; }
  .status-replied { color: #7fd88f; } .status-error { color: #ff9b9b; } .status-skipped { color: #d8c97f; }

  /* Repeatable item cards (rules, providers, prompt versions, steps) */
  .rule { border: 1px solid var(--line-2); border-radius: 10px; padding: var(--s3); margin-bottom: var(--s3); background: var(--panel-2); }
  .rule .head { display: flex; justify-content: space-between; align-items: center; gap: var(--s2); margin-bottom: var(--s1); flex-wrap: wrap; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #22314a; margin-left: 8px; }

  /* Stat cards (overview) */
  .stats { display: flex; gap: var(--s3); flex-wrap: wrap; margin-bottom: var(--s4); }
  .stat { flex: 1; min-width: 120px; background: var(--panel-2); border: 1px solid var(--line-2); border-radius: 10px; padding: var(--s3); }
  .stat .num { font-size: 26px; font-weight: 700; color: var(--text); }
  .stat .lbl { font-size: 12px; color: var(--dim); margin-top: 2px; }

  /* Posts */
  .post { display: flex; gap: var(--s3); border: 1px solid var(--line-2); border-radius: 10px; padding: var(--s3); margin-bottom: var(--s3); background: var(--panel-2); align-items: flex-start; }
  .post img { width: 84px; height: 84px; object-fit: cover; border-radius: var(--radius-sm); background: var(--input); }
  .post .meta { flex: 1; min-width: 0; }
  .post .cap { font-size: 13px; color: #cfd5e1; margin: 2px 0 8px; overflow: hidden; text-overflow: ellipsis; }
  .post .opts { display: flex; gap: var(--s3); flex-wrap: wrap; font-size: 13px; }
  .post .opts label { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--muted); }

  /* Toast + login */
  #toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--accent); padding: 10px 22px; border-radius: 999px; opacity: 0; transition: opacity .3s; pointer-events: none; z-index: 50; }
  #toast.show { opacity: 1; }
  #login { max-width: 420px; margin: 80px auto; padding: 0 24px; }

  .soft { background: var(--panel-2); border: 1px solid var(--line-2); border-radius: 10px; padding: var(--s3); }

  /* Responsive: sidebar becomes a horizontal strip */
  @media (max-width: 720px) {
    .layout { flex-direction: column; min-height: 0; }
    .sidebar { width: auto; flex: none; border-right: 0; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 4px; overflow-x: auto; padding: var(--s2); }
    .sidebar .navgroup { display: none; }
    .sidebar button { width: auto; display: inline-block; }
    main.content { padding: var(--s3); max-width: none; }
  }
</style>
</head>
<body>

<div class="topbar">
  <h1>IG Auto-Responder</h1>
  <span class="pill" id="botState">...</span>
  <span style="flex:1"></span>
  <button class="ghost sm" id="logoutBtn" style="display:none">Change token</button>
</div>

<main id="login">
  <section>
    <h2>Sign in</h2>
    <label>Admin token</label>
    <input type="password" id="tokenInput" placeholder="Paste your ADMIN_TOKEN">
    <div class="savebar"><button id="loginBtn">Open dashboard</button></div>
    <p class="hint">This is the ADMIN_TOKEN you set with wrangler. It is stored only in this browser.</p>
  </section>
</main>

<div class="layout" id="appWrap" style="display:none">

  <nav class="sidebar" id="tabs">
    <div class="navgroup">Monitor</div>
    <button data-tab="overview" class="active">Overview</button>
    <button data-tab="activity">Activity</button>
    <div class="navgroup">Automation</div>
    <button data-tab="posts">Posts</button>
    <button data-tab="funnel">Funnel</button>
    <div class="navgroup">AI &amp; Content</div>
    <button data-tab="ai">AI</button>
    <button data-tab="knowledge">Knowledge</button>
    <button data-tab="content">Content</button>
    <div class="navgroup">System</div>
    <button data-tab="settings">Settings</button>
  </nav>

  <main class="content" id="app">

    <!-- OVERVIEW -->
    <div id="panel-overview" class="panel">
      <h2 class="panel-title">Overview</h2>
      <section>
        <div class="section-head">
          <h2>Activity summary</h2>
          <div class="row" style="gap:8px">
            <select id="anDays" class="sel" style="width:auto">
              <option value="1">Today</option>
              <option value="7" selected>7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
            <button class="ghost sm" id="refreshAnBtn">Refresh</button>
          </div>
        </div>
        <div id="funnelCards" class="stats"></div>
        <div class="row" style="align-items:flex-start;gap:24px">
          <div style="flex:1;min-width:220px">
            <h2>Comment intent</h2>
            <table><tbody id="intentBody"></tbody></table>
          </div>
          <div style="flex:1;min-width:220px">
            <h2>Sentiment</h2>
            <table><tbody id="sentimentBody"></tbody></table>
          </div>
        </div>
        <p class="hint" style="margin-top:14px">Intent &amp; sentiment appear once classification runs. AI replies classify automatically; enable "Classify comments" in the AI tab to classify keyword/fallback replies too.</p>
      </section>
      <section>
        <h2>Daily activity</h2>
        <table>
          <thead><tr><th>Day</th><th>Comments</th><th>Replies</th><th>DMs</th></tr></thead>
          <tbody id="dailyBody"></tbody>
        </table>
      </section>
    </div>

    <!-- ACTIVITY -->
    <div id="panel-activity" class="panel" style="display:none">
      <h2 class="panel-title">Activity</h2>
      <section>
        <div class="section-head">
          <h2>Recent bot activity</h2>
          <button class="ghost sm" id="refreshLogBtn">Refresh</button>
        </div>
        <table>
          <thead><tr><th>Time</th><th>From</th><th>Comment</th><th>Reply</th><th>Status</th></tr></thead>
          <tbody id="logBody"></tbody>
        </table>
      </section>
    </div>

    <!-- POSTS -->
    <div id="panel-posts" class="panel" style="display:none">
      <h2 class="panel-title">Posts &amp; reels</h2>
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
        <div class="section-head">
          <h2>Recent posts &amp; reels</h2>
          <button class="ghost sm" id="refreshMediaBtn">Refresh</button>
        </div>
        <div id="postsList"><p class="muted">Loading posts...</p></div>
      </section>
    </div>

    <!-- FUNNEL -->
    <div id="panel-funnel" class="panel" style="display:none">
      <h2 class="panel-title">Follow-gate funnel</h2>
      <section>
        <div class="section-head">
          <h2>Pending &amp; delivered</h2>
          <button class="ghost sm" id="refreshPendingBtn">Refresh</button>
        </div>
        <p class="hint">People who commented on a follow-gated post. They get the nudge DM, then the resource is delivered once they reply and their follow is confirmed. Waiting rows expire after 7 days.</p>
        <table>
          <thead><tr><th>User ID</th><th>Status</th><th>Nudges</th><th>Created</th><th>Delivered</th><th>Resource</th></tr></thead>
          <tbody id="pendingBody"></tbody>
        </table>
      </section>
    </div>

    <!-- AI -->
    <div id="panel-ai" class="panel" style="display:none">
      <h2 class="panel-title">AI</h2>

      <section>
        <h2>AI behavior</h2>
        <div class="toggle"><input type="checkbox" id="aiToggle"><span>AI replies enabled (for comments that match no keyword)</span></div>
        <div class="toggle"><input type="checkbox" id="classifyToggle"><span>Classify comments (intent + sentiment) &mdash; AI replies classify for free; this also classifies keyword/fallback replies (one small extra AI call each)</span></div>
        <div class="savebar"><button id="saveAiBtn">Save AI settings</button></div>
      </section>

      <section>
        <h2>Add AI provider</h2>
        <div class="row">
          <div style="flex:1;min-width:140px">
            <label>Provider</label>
            <select id="pKind" class="sel">
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
        <h2>System prompt</h2>
        <p class="hint">This is the tone/style guidance the AI follows when writing replies. The strict JSON output format is enforced separately, so editing this can never break replies. Saving creates a new version; you can roll back anytime.</p>
        <label>Prompt guidance</label>
        <textarea id="promptContent" style="min-height:150px"></textarea>
        <label>Version label (optional)</label>
        <input type="text" id="promptLabel" placeholder="e.g. friendlier tone">
        <div class="row savebar">
          <button id="savePromptBtn">Save as new version</button>
          <button class="ghost" id="loadDefaultBtn">Load built-in default</button>
        </div>
        <div style="margin-top:18px"><h2>Version history</h2><div id="promptVersions"><p class="muted">Loading...</p></div></div>
      </section>

      <section>
        <h2>AI usage (30 days)</h2>
        <table>
          <thead><tr><th>Provider</th><th>Calls</th><th>Tokens in</th><th>Tokens out</th></tr></thead>
          <tbody id="usageBody"></tbody>
        </table>
      </section>

      <section>
        <h2>Legacy Anthropic key <span class="muted" id="aiKeyStatus"></span></h2>
        <p class="hint">Optional fallback used only when no provider above is set as default. Prefer adding an Anthropic provider instead — this exists for backwards compatibility.</p>
        <div class="row">
          <input type="password" id="aiKeyInput" placeholder="sk-ant-..." style="flex:1;min-width:200px">
          <button id="saveKeyBtn">Save key</button>
          <button class="danger" id="clearKeyBtn">Remove key</button>
        </div>
      </section>
    </div>

    <!-- CONTENT -->
    <div id="panel-content" class="panel" style="display:none">
      <h2 class="panel-title">Reply content</h2>
      <section>
        <div class="section-head">
          <h2>Keyword rules</h2>
          <div class="row">
            <button class="ghost sm" id="addRuleBtn">+ Add rule</button>
            <button class="sm" id="saveRulesBtn">Save rules</button>
          </div>
        </div>
        <p class="hint">When a comment contains one of the keywords, one public reply and one DM are picked at random from the lists. One entry per line.</p>
        <div id="rulesList"></div>
      </section>

      <section>
        <div class="section-head">
          <h2>Fallback reply</h2>
          <button class="sm" id="saveFbBtn">Save fallback</button>
        </div>
        <p class="hint">Used when a comment matches no keyword and AI is off or unavailable.</p>
        <label>Public replies (one per line, picked randomly)</label>
        <textarea id="fbPublic"></textarea>
        <label>DM messages (one per line, picked randomly)</label>
        <textarea id="fbDm"></textarea>
      </section>

      <section>
        <div class="section-head">
          <h2>Blocklist</h2>
          <button class="sm" id="saveBlockBtn">Save blocklist</button>
        </div>
        <label>If a comment contains any of these phrases, the bot stays silent (one per line)</label>
        <textarea id="blocklist"></textarea>
      </section>
    </div>

    <!-- KNOWLEDGE (RAG) -->
    <div id="panel-knowledge" class="panel" style="display:none">
      <h2 class="panel-title">Knowledge base</h2>
      <section>
        <h2>Persona / style replies</h2>
        <p class="hint">Paste reference text (e.g. movie dialogs) into a collection. When enabled, the bot finds the lines most similar to each comment and replies in that style. Works with any language, including Tamil/Tanglish. Only affects AI replies (keyword rules are unchanged). Retrieval uses Cloudflare Workers AI embeddings (free).</p>
        <div class="toggle"><input type="checkbox" id="kbEnabledToggle"><span>Use the knowledge base for AI replies</span></div>
      </section>

      <section>
        <h2>Add a collection</h2>
        <label>Name</label>
        <input type="text" id="kbName" placeholder="e.g. Tamil movie dialogs">
        <label>Style note (optional persona hint)</label>
        <input type="text" id="kbStyle" placeholder="e.g. reply with dramatic, filmy energy">
        <div class="savebar"><button id="kbAddBtn">Create collection</button></div>
      </section>

      <section>
        <h2>Collections</h2>
        <div id="kbList"><p class="muted">Loading...</p></div>
      </section>

      <section>
        <h2>Test retrieval</h2>
        <p class="hint">Type a sample comment to see which reference lines would be pulled in.</p>
        <input type="text" id="kbTestInput" placeholder="e.g. nice video bro">
        <div class="savebar"><button class="ghost" id="kbTestBtn">Find matches</button></div>
        <div id="kbTestResult"></div>
      </section>
    </div>

    <!-- SETTINGS -->
    <div id="panel-settings" class="panel" style="display:none">
      <h2 class="panel-title">Settings</h2>
      <section>
        <h2>Bot status</h2>
        <div class="toggle"><input type="checkbox" id="enabledToggle"><span>Bot enabled (replies to new comments)</span></div>
        <div class="savebar"><button id="saveSettingsBtn">Save</button></div>
      </section>
      <section>
        <h2>Instagram token</h2>
        <p class="hint" id="tokenMeta"></p>
      </section>
    </div>

  </main>
</div>

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
    el('login').style.display = ''; el('appWrap').style.display = 'none';
    el('logoutBtn').style.display = 'none';
  }
  function showApp() {
    el('login').style.display = 'none'; el('appWrap').style.display = '';
    el('logoutBtn').style.display = '';
  }

  // ---------- Settings ----------
  function loadSettings() {
    return api('/settings').then(function (s) {
      el('enabledToggle').checked = s.enabled;
      el('aiToggle').checked = s.aiEnabled;
      el('classifyToggle').checked = !!s.classifyEnabled;
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
    api('/settings', 'PUT', { enabled: el('enabledToggle').checked })
      .then(function () { toast('Settings saved'); return loadSettings(); });
  };
  el('saveAiBtn').onclick = function () {
    api('/settings', 'PUT', {
      aiEnabled: el('aiToggle').checked,
      classifyEnabled: el('classifyToggle').checked
    }).then(function () { toast('AI settings saved'); return loadSettings(); });
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
    del.className = 'danger sm'; del.textContent = 'Delete';
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

  // ---------- Navigation ----------
  var tabsEl = el('tabs');
  var PANELS = ['overview', 'activity', 'posts', 'funnel', 'ai', 'knowledge', 'content', 'settings'];
  var mediaLoaded = false;
  var providersLoaded = false;
  var aiLoaded = false;
  var contentLoaded = false;
  var activityLoaded = false;
  var kbLoaded = false;
  var providersCache = [];
  var defaultProviderId = null;
  function showTab(tab) {
    PANELS.forEach(function (p) { el('panel-' + p).style.display = p === tab ? '' : 'none'; });
    var btns = tabsEl.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-tab') === tab);
    }
    if (tab === 'overview') { loadAnalytics(); }
    if (tab === 'activity' && !activityLoaded) { activityLoaded = true; loadLog(); }
    if (tab === 'posts' && !mediaLoaded) { loadProviders().then(loadMedia); }
    if (tab === 'funnel') { loadPending(); }
    if (tab === 'ai' && !aiLoaded) { aiLoaded = true; loadProviders(); loadPrompts(); }
    if (tab === 'knowledge' && !kbLoaded) { kbLoaded = true; loadKb(); }
    if (tab === 'content' && !contentLoaded) { contentLoaded = true; loadRules(); loadFallback(); loadBlocklist(); }
  }
  tabsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button'); if (!btn) { return; }
    showTab(btn.getAttribute('data-tab'));
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

  // ---------- Analytics ----------
  function statCard(label, value) {
    var d = document.createElement('div');
    d.className = 'stat';
    var v = document.createElement('div');
    v.className = 'num'; v.textContent = value;
    var l = document.createElement('div');
    l.className = 'lbl'; l.textContent = label;
    d.appendChild(v); d.appendChild(l);
    return d;
  }
  function fillKv(bodyId, rows, keyName, emptyMsg) {
    var body = el(bodyId);
    body.innerHTML = '';
    if (!rows || rows.length === 0) {
      body.innerHTML = '<tr><td colspan="2" class="muted">' + emptyMsg + '</td></tr>';
      return;
    }
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      var td1 = document.createElement('td'); td1.textContent = r[keyName];
      var td2 = document.createElement('td'); td2.textContent = r.count; td2.style.textAlign = 'right';
      tr.appendChild(td1); tr.appendChild(td2);
      body.appendChild(tr);
    });
  }
  function loadAnalytics() {
    var days = el('anDays').value;
    return api('/analytics?days=' + days).then(function (a) {
      var f = a.funnel || {};
      var cards = el('funnelCards');
      cards.innerHTML = '';
      cards.appendChild(statCard('Comments', f.comment_received || 0));
      cards.appendChild(statCard('Public replies', f.reply_sent || 0));
      cards.appendChild(statCard('DMs sent', f.dm_sent || 0));
      cards.appendChild(statCard('Resources delivered', f.resource_delivered || 0));
      cards.appendChild(statCard('AI generations', f.ai_generation || 0));
      fillKv('intentBody', a.intents, 'intent', 'No classified comments yet.');
      fillKv('sentimentBody', a.sentiments, 'sentiment', 'No sentiment data yet.');
      var body = el('dailyBody');
      body.innerHTML = '';
      (a.daily || []).forEach(function (d) {
        var tr = document.createElement('tr');
        [d.day, d.comments, d.replies, d.dms].forEach(function (v) {
          var td = document.createElement('td'); td.textContent = v == null ? '' : v; tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      if (!a.daily || a.daily.length === 0) {
        body.innerHTML = '<tr><td colspan="4" class="muted">No activity in this window.</td></tr>';
      }
    });
  }
  el('refreshAnBtn').onclick = function () { loadAnalytics(); };
  el('anDays').onchange = function () { loadAnalytics(); };

  // ---------- Prompts ----------
  var promptDefault = '';
  function loadPrompts() {
    return api('/prompts').then(function (res) {
      promptDefault = res.defaultGuidance || '';
      var versions = res.versions || [];
      var active = versions.filter(function (v) { return v.isActive; })[0];
      if (el('promptContent').value.trim() === '') {
        el('promptContent').value = active ? active.content : promptDefault;
      }
      var list = el('promptVersions');
      list.innerHTML = '';
      if (versions.length === 0) {
        list.innerHTML = '<p class="muted">No saved versions yet — the built-in default is in use.</p>';
        return;
      }
      versions.forEach(function (v) {
        var div = document.createElement('div');
        div.className = 'rule';
        var head = document.createElement('div'); head.className = 'head';
        var title = document.createElement('strong');
        title.textContent = 'v' + v.version + (v.label ? ' — ' + v.label : '');
        if (v.isActive) {
          var b = document.createElement('span'); b.className = 'badge'; b.textContent = 'ACTIVE';
          title.appendChild(b);
        }
        head.appendChild(title);
        var btns = document.createElement('div'); btns.className = 'row';
        btns.appendChild(actionBtn('Edit', 'ghost sm', function () {
          el('promptContent').value = v.content;
          el('promptLabel').value = v.label || '';
          toast('Loaded v' + v.version + ' into editor');
        }));
        if (!v.isActive) {
          btns.appendChild(actionBtn('Activate', 'sm', function () {
            api('/prompts/' + v.id + '/activate', 'POST').then(function () {
              toast('v' + v.version + ' is now active'); loadPrompts();
            });
          }));
        }
        head.appendChild(btns);
        div.appendChild(head);
        var pre = document.createElement('p');
        pre.className = 'hint';
        pre.style.whiteSpace = 'pre-wrap';
        pre.textContent = v.content.slice(0, 240) + (v.content.length > 240 ? '…' : '');
        div.appendChild(pre);
        var meta = document.createElement('p'); meta.className = 'muted'; meta.style.fontSize = '12px';
        meta.textContent = 'saved ' + (v.createdAt || '').replace('T', ' ').slice(0, 16);
        div.appendChild(meta);
        list.appendChild(div);
      });
    });
  }
  el('savePromptBtn').onclick = function () {
    var content = el('promptContent').value.trim();
    if (!content) { toast('Prompt cannot be empty'); return; }
    api('/prompts', 'POST', { content: content, label: el('promptLabel').value.trim() })
      .then(function () { el('promptLabel').value = ''; toast('New prompt version saved & active'); loadPrompts(); });
  };
  el('loadDefaultBtn').onclick = function () {
    el('promptContent').value = promptDefault;
    toast('Loaded built-in default (not saved yet)');
  };

  // ---------- Knowledge base (RAG) ----------
  function kbCard(col) {
    var div = document.createElement('div');
    div.className = 'rule';
    var head = document.createElement('div'); head.className = 'head';
    var title = document.createElement('strong');
    title.textContent = col.name;
    var badge = document.createElement('span'); badge.className = 'badge';
    badge.textContent = col.chunkCount + ' lines';
    title.appendChild(badge);
    if (!col.enabled) {
      var off = document.createElement('span'); off.className = 'badge'; off.textContent = 'OFF';
      title.appendChild(off);
    }
    head.appendChild(title);
    var btns = document.createElement('div'); btns.className = 'row';
    btns.appendChild(actionBtn(col.enabled ? 'Disable' : 'Enable', 'ghost sm', function () {
      api('/kb/' + col.id, 'PUT', { enabled: !col.enabled }).then(function () { loadKb(); });
    }));
    btns.appendChild(actionBtn('Delete', 'danger sm', function () {
      if (confirm('Delete collection "' + col.name + '"?')) { api('/kb/' + col.id, 'DELETE').then(loadKb); }
    }));
    head.appendChild(btns);
    div.appendChild(head);

    var l1 = document.createElement('label'); l1.textContent = 'Style note (optional persona hint)';
    var styleIn = document.createElement('input'); styleIn.type = 'text'; styleIn.value = col.styleNote || '';
    div.appendChild(l1); div.appendChild(styleIn);

    var l2 = document.createElement('label');
    l2.textContent = 'Reference text — one line per entry. Saving REPLACES the current ' + col.chunkCount + ' line(s).';
    var ta = document.createElement('textarea');
    ta.placeholder = 'Paste your dialogs / lines here, one per line...';
    div.appendChild(l2); div.appendChild(ta);

    var hint = document.createElement('p'); hint.className = 'hint';
    hint.textContent = 'Text is embedded into searchable lines; the raw text is not shown back here. Leave the box empty to keep existing lines and only update the style note.';
    div.appendChild(hint);

    var save = document.createElement('button'); save.textContent = 'Save collection'; save.style.marginTop = '8px';
    save.onclick = function () {
      var body = { styleNote: styleIn.value };
      if (ta.value.trim() !== '') { body.text = ta.value; }
      save.textContent = 'Saving...'; save.disabled = true;
      api('/kb/' + col.id, 'PUT', body).then(function (r) {
        toast(body.text !== undefined ? ('Saved — ' + (r.chunks == null ? 0 : r.chunks) + ' lines embedded') : 'Saved');
        loadKb();
      }).catch(function () { save.textContent = 'Save collection'; save.disabled = false; toast('Save failed'); });
    };
    div.appendChild(save);
    return div;
  }
  function loadKb() {
    return api('/kb').then(function (res) {
      kbLoaded = true;
      el('kbEnabledToggle').checked = !!res.kbEnabled;
      var list = el('kbList'); list.innerHTML = '';
      if (!res.collections || res.collections.length === 0) {
        list.innerHTML = '<p class="muted">No collections yet. Create one above and paste your reference text.</p>';
        return;
      }
      res.collections.forEach(function (col) { list.appendChild(kbCard(col)); });
    });
  }
  el('kbEnabledToggle').onchange = function () {
    api('/kb-settings', 'PUT', { enabled: el('kbEnabledToggle').checked }).then(function () { toast('Saved'); });
  };
  el('kbAddBtn').onclick = function () {
    var name = el('kbName').value.trim();
    if (!name) { toast('Name required'); return; }
    api('/kb', 'POST', { name: name, styleNote: el('kbStyle').value.trim() }).then(function () {
      el('kbName').value = ''; el('kbStyle').value = ''; toast('Collection created'); loadKb();
    });
  };
  el('kbTestBtn').onclick = function () {
    var text = el('kbTestInput').value.trim();
    if (!text) { toast('Type a sample comment'); return; }
    api('/kb/test', 'POST', { text: text }).then(function (r) {
      var box = el('kbTestResult'); box.innerHTML = '';
      if (!r.lines || r.lines.length === 0) {
        box.innerHTML = '<p class="muted">No matches (KB empty/disabled, or nothing similar enough).</p>'; return;
      }
      var ul = document.createElement('ul'); ul.style.margin = '10px 0 0';
      r.lines.forEach(function (l) { var li = document.createElement('li'); li.textContent = l; ul.appendChild(li); });
      box.appendChild(ul);
      if (r.styleNotes && r.styleNotes.length) {
        var p = document.createElement('p'); p.className = 'hint';
        p.textContent = 'Persona notes: ' + r.styleNotes.join(' '); box.appendChild(p);
      }
    });
  };

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
      list.innerHTML = '<p class="muted">No providers yet. The bot falls back to the legacy Anthropic key (below) or template replies.</p>';
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
      btns.appendChild(actionBtn('Test', 'sm', function (btn) {
        btn.textContent = 'Testing...';
        api('/providers/' + p.id + '/test', 'POST').then(function (r) {
          toast(r.ok ? 'OK: ' + r.detail : 'FAILED: ' + r.detail);
          loadProviders();
        });
      }));
      btns.appendChild(actionBtn(p.enabled ? 'Disable' : 'Enable', 'ghost sm', function () {
        api('/providers/' + p.id, 'PUT', { enabled: !p.enabled }).then(loadProviders);
      }));
      if (p.id !== defaultProviderId) {
        btns.appendChild(actionBtn('Make default', 'ghost sm', function () {
          api('/providers/' + p.id, 'PUT', { makeDefault: true }).then(loadProviders);
        }));
      }
      btns.appendChild(actionBtn('Delete', 'danger sm', function () {
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
    toggle.className = 'ghost sm';
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
    toggle.className = 'ghost sm';
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
    controls.appendChild(mkBtn('+ Add step', 'ghost sm', function () {
      stepsBox.appendChild(stepRow({ type: 'dm', variations: [], delaySeconds: 0 }));
    }));
    controls.appendChild(mkBtn('Save sequence', 'sm', function () { save(); }));
    controls.appendChild(mkBtn('Clear', 'danger sm', function () {
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
      btns.appendChild(mkBtn('Up', 'ghost sm', function () { if (row.previousSibling) { stepsBox.insertBefore(row, row.previousSibling); } }));
      btns.appendChild(mkBtn('Down', 'ghost sm', function () { if (row.nextSibling) { stepsBox.insertBefore(row.nextSibling, row); } }));
      btns.appendChild(mkBtn('Remove', 'danger sm', function () { row.remove(); }));
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
    loadSettings()
      .then(function () { showApp(); showTab('overview'); })
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
