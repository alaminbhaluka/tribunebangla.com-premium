(() => {
  'use strict';

  const repository = 'alaminbhaluka/tribunebangla.com';
  const SUPABASE_URL = 'https://rvffsavdvetdmhnwgivz.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_K4ir8_k1DY9EOhoC-wUT8A_8r01CJxu';
  const tokenKey = 'tribuneCmsSession';
  const loginPanel = document.getElementById('login-panel');
  const editorPanel = document.getElementById('editor-panel');
  const loginButton = document.getElementById('login-button');
  const loginStatus = document.getElementById('login-status');
  const instructions = document.getElementById('device-instructions');
  const deviceCode = document.getElementById('device-code');
  const deviceLink = document.getElementById('device-link');
  const deviceStatus = document.getElementById('device-status');
  const articleList = document.getElementById('article-list');
  const articleStats = document.getElementById('article-stats');
  const articleFilter = document.getElementById('article-filter');
  const form = document.getElementById('article-form');
  const saveButton = document.getElementById('save-button');
  const saveStatus = document.getElementById('save-status');
  const brandLogoInput = document.getElementById('brand-logo-input');
  const brandLogoPreview = document.getElementById('brand-logo-preview');
  const brandLogoPlaceholder = document.getElementById('brand-logo-placeholder');
  const brandLogoSave = document.getElementById('brand-logo-save');
  const brandLogoStatus = document.getElementById('brand-logo-status');
  let selectedBrandLogo = null;
  let articles = [];
  let fileSha = '';
  let selectedId = '';
  let creating = false;

  function setStatus(node, message, kind = '') {
    node.textContent = message;
    node.dataset.error = kind === 'error' ? 'true' : 'false';
    node.dataset.success = kind === 'success' ? 'true' : 'false';
  }

  function getSession() {
    try {
      return JSON.parse(sessionStorage.getItem(tokenKey) || 'null');
    } catch (error) {
      sessionStorage.removeItem(tokenKey);
      return null;
    }
  }

  function saveSession(session) {
    sessionStorage.setItem(tokenKey, JSON.stringify(session));
  }

  function clearSession() {
    sessionStorage.removeItem(tokenKey);
  }

  async function authRequest(payload) {
    const response = await fetch('/api/github-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'GitHub authorization failed');
    return result;
  }

  function storeTokens(result) {
    if (!result.access_token) throw new Error(result.error_description || result.error || 'GitHub token was not returned');
    const expiresIn = Number(result.expires_in);
    const session = {
      accessToken: result.access_token,
      expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : 0
    };
    saveSession(session);
    return session;
  }

  async function activeSession() {
    const session = getSession();
    if (!session?.accessToken) throw new Error('প্রথমে GitHub দিয়ে প্রবেশ করুন।');
    if (session.expiresAt && session.expiresAt < Date.now() + 60000) {
      clearSession();
      throw new Error('GitHub প্রবেশের সময় শেষ হয়েছে। আবার প্রবেশ করুন।');
    }
    return session;
  }

  async function githubRequest(path, options = {}) {
    const session = await activeSession();
    return fetch(`https://api.github.com/repos/${repository}/${path}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${session.accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.headers || {})
      },
      cache: 'no-store'
    });
  }

  async function startLogin() {
    loginButton.disabled = true;
    setStatus(loginStatus, 'GitHub অনুমোদনের অনুরোধ তৈরি হচ্ছে…');
    instructions.hidden = true;
    try {
      const device = await authRequest({ action: 'device' });
      if (!device.device_code || !device.user_code || !device.verification_uri) {
        throw new Error(device.error_description || device.error || 'অনুমোদন কোড পাওয়া যায়নি।');
      }

      instructions.hidden = false;
      deviceCode.textContent = device.user_code;
      deviceLink.href = device.verification_uri_complete || device.verification_uri;
      setStatus(deviceStatus, 'GitHub-এ কোডটি অনুমোদন করলে এই পাতা নিজে থেকেই খুলবে।');
      setStatus(loginStatus, '');

      const deadline = Date.now() + Number(device.expires_in || 900) * 1000;
      let interval = Number(device.interval || 5);
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, interval * 1000));
        const result = await authRequest({ action: 'poll', device_code: device.device_code });
        if (result.access_token) {
          storeTokens(result);
          await showEditor();
          return;
        }
        if (result.error === 'authorization_pending') continue;
        if (result.error === 'slow_down') {
          interval += 5;
          continue;
        }
        if (result.error === 'expired_token') throw new Error('কোডটির সময় শেষ হয়েছে। আবার চেষ্টা করুন।');
        if (result.error === 'access_denied') throw new Error('GitHub অনুমোদন দেওয়া হয়নি।');
        throw new Error(result.error_description || result.error || 'GitHub অনুমোদন সম্পন্ন হয়নি।');
      }
      throw new Error('অনুমোদনের সময় শেষ হয়েছে। আবার চেষ্টা করুন।');
    } catch (error) {
      console.error('CMS sign-in failed:', error);
      setStatus(loginStatus, error.message, 'error');
    } finally {
      loginButton.disabled = false;
    }
  }

  async function loadArticles() {
    const response = await githubRequest('contents/articles.json');
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'খবরের ডেটা GitHub থেকে পড়া যায়নি।');
    if (typeof result.content !== 'string' || !result.sha) {
      throw new Error('GitHub থেকে খবরের ফাইলের সঠিক সংস্করণ পাওয়া যায়নি।');
    }

    let data = { version: 1, articles: [] };
    if (result.content.trim()) {
      const bytes = Uint8Array.from(atob(result.content.replace(/\s/g, '')), (character) => character.charCodeAt(0));
      data = JSON.parse(new TextDecoder().decode(bytes));
    }
    if (!Array.isArray(data.articles) || data.articles.some((item) =>
      !item || typeof item.id !== 'string' || typeof item.path !== 'string' ||
      typeof item.title !== 'string' || typeof item.summary !== 'string'
    )) {
      throw new Error('খবরের ডেটার গঠন সঠিক নয়।');
    }
    fileSha = result.sha;
    const staticArticles = data.articles;

    // Collect the automatic/news cards already present on the homepage.
    const homepageArticles = new Map();
    try {
      const homepageResponse = await fetch('/', { cache: 'no-store' });
      if (homepageResponse.ok) {
        const homepageHtml = await homepageResponse.text();
        const homepageDocument = new DOMParser().parseFromString(homepageHtml, 'text/html');
        homepageDocument.querySelectorAll('a[href*="/post/"]').forEach((link) => {
          let url;
          try { url = new URL(link.getAttribute('href'), window.location.origin); }
          catch (_) { return; }
          const match = url.pathname.match(/\/post\/(\d+)\/?$/);
          if (!match) return;
          const card = link.closest('.sixColNewsBox, .threeColNewsBox, .fourColNewsBox, .trd_news_item, .mainLeadNews, .leadSidebarNews, .midLeadNews') || link;
          const image = card.querySelector('img') || link.querySelector('img');
          const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
          const title = clean(card.querySelector('h2, h3, h4')?.textContent) || clean(image?.alt) || clean(link.textContent);
          if (!title) return;
          const id = match[1];
          const candidate = {
            id,
            path: `/post/${id}/`,
            title,
            summary: clean(card.querySelector('p')?.textContent),
            body: '',
            image: image?.dataset.src || image?.getAttribute('src') || '',
            status: 'published',
            contentStatus: 'excerpt_only',
            source: 'homepage-auto',
            publishedAt: card.querySelector('time')?.getAttribute('datetime') || ''
          };
          const previous = homepageArticles.get(id);
          if (!previous || candidate.summary.length > previous.summary.length) homepageArticles.set(id, candidate);
        });
      }
    } catch (error) {
      console.warn('Homepage news could not be loaded into CMS:', error);
    }

    const databaseResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/news_articles?select=id,title,summary,body,image_url,category,status,reporter,body_alignment,image_caption,created_at,updated_at&status=eq.published&order=created_at.desc`,
      {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
        },
        cache: 'no-store'
      }
    );
    if (!databaseResponse.ok) throw new Error('ডাটাবেজের প্রকাশিত খবর আনা যায়নি। আবার চেষ্টা করুন।');
    const databaseRows = await databaseResponse.json();
    if (!Array.isArray(databaseRows)) throw new Error('ডাটাবেজের খবরের তথ্য সঠিক নয়।');

    const combined = new Map(homepageArticles);
    databaseRows.forEach((row) => {
      const id = String(row.id);
      combined.set(id, {
        id,
        path: `/post/${id}/`,
        title: row.title || '',
        summary: row.summary || '',
        body: row.body || '',
        image: row.image_url || '',
        category: row.category || 'জাতীয়',
        status: row.status || 'published',
        source: 'supabase',
        reporter: row.reporter || '',
        bodyAlignment: row.body_alignment || 'justify',
        imageCaption: row.image_caption || '',
        publishedAt: row.created_at || '',
        updatedAt: row.updated_at || ''
      });
    });
    staticArticles.forEach((article) => combined.set(String(article.id), article));
    articles = [...combined.values()].sort((a, b) =>
      new Date(b.publishedAt || b.updatedAt || 0) - new Date(a.publishedAt || a.updatedAt || 0)
    );
    renderList();
  }
  function renderList() {
    const query = articleFilter.value.trim().toLocaleLowerCase();
    articleList.replaceChildren();
    const publishedCount = articles.filter((article) => article.status !== 'draft').length;
    const draftCount = articles.length - publishedCount;
    const databaseCount = articles.filter((article) => article.source === 'supabase').length;
    const autoCount = articles.filter((article) => /auto|automatic|autonews/i.test(String(article.source || ''))).length;
    if (articleStats) {
      articleStats.replaceChildren();
      [
        ['মোট সংবাদ', articles.length],
        ['প্রকাশিত', publishedCount],
        ['খসড়া', draftCount],
        ['অটো নিউজ', autoCount],
        ['ডাটাবেজ নিউজ', databaseCount]
      ].forEach(([label, value]) => {
        const item = document.createElement('div');
        item.className = 'article-stat';
        const number = document.createElement('strong');
        number.textContent = String(value);
        const caption = document.createElement('span');
        caption.textContent = label;
        item.append(number, caption);
        articleStats.append(item);
      });
    }
    articles
      .filter((article) => !query || `${article.title} ${article.summary || ''} ${article.body || ''}`.toLocaleLowerCase().includes(query))
      .forEach((article) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'article-choice';
        button.setAttribute('aria-current', String(article.id === selectedId));
        button.addEventListener('click', () => showArticle(article.id));
        const title = document.createElement('span');
        title.textContent = article.title || 'শিরোনামহীন খবর';
        const state = document.createElement('small');
        const statusLabel = article.status === 'draft' ? 'খসড়া' :
          article.contentStatus === 'excerpt_only' ? 'শুধু সংক্ষিপ্ত তথ্য' : 'প্রকাশিত';
        const sourceLabel = article.source === 'supabase' ? 'ডাটাবেজ নিউজ' :
          /auto|automatic|autonews/i.test(String(article.source || '')) ? 'অটো নিউজ' : 'সাইট নিউজ';
        state.textContent = `${statusLabel} • ${sourceLabel}`;
        const edit = document.createElement('small');
        edit.className = 'article-edit-hint';
        edit.textContent = 'সম্পাদনা করতে এখানে চাপুন';
        button.append(title, state, edit);
        articleList.append(button);
      });
  }
  function showArticle(id) {
    const article = articles.find((item) => item.id === id);
    if (!article) return;
    creating = false;
    selectedId = article.id;
    document.getElementById('article-title').value = article.title || '';
    document.getElementById('article-summary').value = article.summary || '';
    document.getElementById('article-body').value = article.body || '';
    document.getElementById('article-image').value = article.image || '';
    document.getElementById('article-category').value = article.category || 'জাতীয়';
    document.getElementById('article-status').value = article.status === 'draft' ? 'draft' : 'published';
    saveButton.textContent = 'পরিবর্তন সংরক্ষণ করুন';
    setStatus(saveStatus, article.contentStatus === 'excerpt_only'
      ? 'এই পুরোনো খবরটির পূর্ণ লেখা উদ্ধার হয়নি; চাইলে এখানে যোগ করে সংরক্ষণ করুন।'
      : '');
    renderList();
  }

  function createArticle() {
    const numericIds = articles.map((item) => Number(item.id)).filter(Number.isSafeInteger);
    const id = String(Math.max(10000, ...numericIds) + 1);
    creating = true;
    selectedId = id;
    document.getElementById('article-title').value = '';
    document.getElementById('article-summary').value = '';
    document.getElementById('article-body').value = '';
    document.getElementById('article-image').value = '';
    document.getElementById('article-category').value = 'জাতীয়';
    document.getElementById('article-status').value = 'draft';
    saveButton.textContent = 'খবর সংরক্ষণ করুন';
    setStatus(saveStatus, 'প্রকাশের আগে পূর্ণ প্রতিবেদন লিখুন; প্রথমে খসড়া হিসেবেও রাখতে পারেন।');
    renderList();
    document.getElementById('article-title').focus();
  }

  function encodeUtf8Base64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }


  async function loadBrandSettings() {
    try {
      const response = await fetch('/brand.json?v=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) return;
      const settings = await response.json();
      if (settings.logo) { brandLogoPreview.src = settings.logo; brandLogoPreview.hidden = false; brandLogoPlaceholder.hidden = true; }
    } catch (error) { console.warn('Brand settings could not be loaded:', error); }
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('লোগো ফাইলটি পড়া যায়নি।'));
      reader.readAsDataURL(file);
    });
  }

  async function saveBrandLogo() {
    if (!selectedBrandLogo) { setStatus(brandLogoStatus, 'আগে একটি লোগো ছবি বেছে নিন।', 'error'); return; }
    brandLogoSave.disabled = true;
    setStatus(brandLogoStatus, 'লোগো আপলোড ও সংরক্ষণ হচ্ছে…');
    try {
      const file = selectedBrandLogo;
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const imagePath = 'assets/tribune-logo-' + Date.now() + '.' + ext;
      const imageResponse = await githubRequest('contents/' + imagePath, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Update Tribune Bangla site logo', content: await readFileAsBase64(file) })
      });
      const imageResult = await imageResponse.json();
      if (!imageResponse.ok) throw new Error(imageResult.message || 'লোগো ছবি আপলোড করা যায়নি।');

      const settings = { logo: '/' + imagePath, updatedAt: new Date().toISOString() };
      const oldResponse = await githubRequest('contents/brand.json');
      let oldSha = '';
      if (oldResponse.ok) oldSha = (await oldResponse.json()).sha || '';
      else if (oldResponse.status !== 404) throw new Error('লোগো সেটিংস পড়া যায়নি।');
      const payload = { message: 'Save Tribune Bangla branding settings', content: encodeUtf8Base64(JSON.stringify(settings, null, 2)) };
      if (oldSha) payload.sha = oldSha;
      const settingsResponse = await githubRequest('contents/brand.json', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const settingsResult = await settingsResponse.json();
      if (!settingsResponse.ok) throw new Error(settingsResult.message || 'লোগো সেটিংস সংরক্ষণ করা যায়নি।');
      brandLogoPreview.src = settings.logo + '?v=' + Date.now();
      brandLogoPreview.hidden = false; brandLogoPlaceholder.hidden = true;
      selectedBrandLogo = null; brandLogoInput.value = '';
      setStatus(brandLogoStatus, 'নতুন লোগো সংরক্ষিত হয়েছে। মূল সাইট রিফ্রেশ করলে দেখা যাবে।', 'success');
    } catch (error) {
      console.error('Logo update failed:', error);
      setStatus(brandLogoStatus, error.message || 'লোগো পরিবর্তন করা যায়নি।', 'error');
    } finally { brandLogoSave.disabled = !selectedBrandLogo; }
  }

  async function saveArticle(event) {
    event.preventDefault();
    saveButton.disabled = true;
    setStatus(saveStatus, 'GitHub-এ সংরক্ষণ হচ্ছে…');
    try {
      const current = articles.find((item) => item.id === selectedId);
      const title = document.getElementById('article-title').value.trim();
      const summary = document.getElementById('article-summary').value.trim();
      const body = document.getElementById('article-body').value.trim();
      const status = document.getElementById('article-status').value;
      if (!title) throw new Error('শিরোনাম লিখুন।');
      if (status === 'published' && !body && (creating || current?.contentStatus !== 'excerpt_only')) {
        throw new Error('পূর্ণ প্রতিবেদন না লিখে নতুন খবর প্রকাশ করা যাবে না। খসড়া হিসেবে সংরক্ষণ করুন।');
      }

      const article = {
        ...(current || {}),
        id: selectedId,
        path: `/post/${selectedId}/`,
        title,
        summary,
        body,
        image: document.getElementById('article-image').value.trim(),
        category: document.getElementById('article-category').value,
        status,
        contentStatus: body ? 'full' : 'excerpt_only',
        source: current?.source || 'cms'
      };
      if (status === 'published' && !article.publishedAt) article.publishedAt = new Date().toISOString();

      const nextArticles = articles.slice();
      const index = nextArticles.findIndex((item) => item.id === selectedId);
      if (index >= 0) nextArticles[index] = article;
      else nextArticles.unshift(article);

      const response = await githubRequest('contents/articles.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `${status === 'draft' ? 'Save draft' : 'Publish'}: ${title}`,
          sha: fileSha,
          content: encodeUtf8Base64(JSON.stringify({ version: 1, articles: nextArticles }, null, 2))
        })
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409 || response.status === 422) {
          throw new Error('ডেটা অন্য কেউ পরিবর্তন করেছেন। পাতা রিফ্রেশ করে আবার চেষ্টা করুন।');
        }
        throw new Error(result.message || 'GitHub-এ খবরটি সংরক্ষণ করা যায়নি।');
      }

      articles = nextArticles;
      fileSha = result.content.sha;
      creating = false;
      showArticle(selectedId);
      setStatus(saveStatus, 'খবরটি GitHub-এ সংরক্ষিত হয়েছে। সাইটে দেখা যেতে কিছুক্ষণ অপেক্ষা করুন।', 'success');
    } catch (error) {
      console.error('CMS save failed:', error);
      setStatus(saveStatus, error.message, 'error');
    } finally {
      saveButton.disabled = false;
    }
  }

  async function showEditor() {
    loginPanel.hidden = true;
    editorPanel.hidden = false;
    await Promise.all([loadArticles(), loadBrandSettings()]);
    const requestedArticleId = new URLSearchParams(window.location.search).get('article');
    const requestedArticle = requestedArticleId && articles.find((item) => String(item.id) === requestedArticleId);
    if (requestedArticle) showArticle(requestedArticle.id);
    else if (articles.length) showArticle(articles[0].id);
    else createArticle();
  }

  function logout() {
    clearSession();
    articles = [];
    fileSha = '';
    selectedId = '';
    editorPanel.hidden = true;
    loginPanel.hidden = false;
    instructions.hidden = true;
    setStatus(loginStatus, 'এই ব্রাউজার সেশনে CMS থেকে বের হয়েছেন।');
  }

  loginButton.addEventListener('click', startLogin);
  document.getElementById('logout-button').addEventListener('click', logout);
  document.getElementById('new-article-button').addEventListener('click', createArticle);
  articleFilter.addEventListener('input', renderList);
  form.addEventListener('submit', saveArticle);
  brandLogoInput.addEventListener('change', () => {
    const file = brandLogoInput.files?.[0] || null;
    selectedBrandLogo = file;
    if (!file) { brandLogoSave.disabled = true; return; }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      selectedBrandLogo = null; brandLogoInput.value = ''; brandLogoSave.disabled = true;
      setStatus(brandLogoStatus, 'PNG, JPG বা WebP ছবি দিন; ফাইল ২ MB-এর মধ্যে হতে হবে।', 'error'); return;
    }
    brandLogoPreview.src = URL.createObjectURL(file);
    brandLogoPreview.hidden = false; brandLogoPlaceholder.hidden = true;
    brandLogoSave.disabled = false;
    setStatus(brandLogoStatus, 'প্রিভিউ ঠিক থাকলে “লোগো সংরক্ষণ করুন” চাপুন।');
  });
  brandLogoSave.addEventListener('click', saveBrandLogo);

  if (getSession()?.accessToken) {
    showEditor().catch((error) => {
      console.error('Unable to restore CMS session:', error);
      logout();
      setStatus(loginStatus, error.message, 'error');
    });
  }
})();
