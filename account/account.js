(() => {
  'use strict';

  const SUPABASE_URL = 'https://rvffsavdvetdmhnwgivz.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_K4ir8_k1DY9EOhoC-wUT8A_8r01CJxu';
  const authClient = window.supabase;
  const client = authClient?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const byId = (id) => document.getElementById(id);
  const authPanel = byId('auth-panel');
  const dashboard = byId('dashboard');
  const authStatus = byId('auth-status');
  const dashboardStatus = byId('dashboard-status');
  const profilePhotoInput = byId('profile-photo-file');
  const profilePhotoUploadButton = byId('profile-photo-upload');
  const profilePhotoStatus = byId('profile-photo-status');
  const AVATAR_BUCKET = 'profile-images';
  const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
  const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const registerForm = byId('register-form');
  const loginForm = byId('login-form');
  let currentUser = null;
  let profile = null;
  let publishedArticles = null;
  let photoPreviewUrl = '';

  function setStatus(node, message, kind = '') {
    if (!node) return;
    node.textContent = message;
    node.dataset.error = String(kind === 'error');
    node.dataset.success = String(kind === 'success');
  }

  function formValues(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function normalizeBdPhone(value) {
    const original = String(value || '').trim();
    const bengaliDigits = '০১২৩৪৫৬৭৮৯';
    const normalizedInput = original.replace(/[০-৯]/g, (digit) => String(bengaliDigits.indexOf(digit)));
    const digits = normalizedInput.replace(/\D/g, '');
    if (digits.startsWith('01') && digits.length === 11) return `+88${digits}`;
    if (digits.startsWith('8801') && digits.length === 13) return `+${digits}`;
    if (digits.startsWith('008801') && digits.length === 15) return `+${digits.slice(2)}`;
    if (original.startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
    throw new Error('সঠিক মোবাইল নম্বর দিন (যেমন 01XXXXXXXXX)।');
  }

  function profileValues(values) {
    return {
      full_name: String(values.full_name || '').trim(),
      phone: String(values.phone || '').trim() ? normalizeBdPhone(values.phone) : null,
      division: String(values.division || '').trim() || null,
      district: String(values.district || '').trim() || null,
      upazila: String(values.upazila || '').trim() || null,
      address_line: String(values.address_line || '').trim() || null,
      newsletter_opt_in: values.newsletter_opt_in === 'on'
    };
  }

  function safeProfilePhotoUrl(value) {
    try {
      const url = new URL(value);
      if (url.origin !== SUPABASE_URL ||
          !url.pathname.startsWith(`/storage/v1/object/public/${AVATAR_BUCKET}/`)) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function setProfilePhoto(url, name) {
    const initial = name?.trim().slice(0, 1).toLocaleUpperCase() || 'প';
    const safeUrl = safeProfilePhotoUrl(url);
    const imageTargets = [
      [byId('user-avatar-image'), byId('user-initial')],
      [byId('profile-photo-preview'), byId('profile-photo-fallback')]
    ];
    imageTargets.forEach(([image, fallback]) => {
      fallback.textContent = initial;
      if (!safeUrl) {
        image.hidden = true;
        image.removeAttribute('src');
        fallback.hidden = false;
        return;
      }
      image.onerror = () => {
        image.hidden = true;
        fallback.hidden = false;
      };
      image.src = safeUrl;
      image.hidden = false;
      fallback.hidden = true;
    });
  }

  function validateProfilePhoto(file) {
    if (!AVATAR_TYPES.has(file.type)) {
      throw new Error('JPG, PNG বা WebP ছবি বেছে নিন।');
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new Error('প্রোফাইল ছবির আকার সর্বোচ্চ ২ MB হতে পারে।');
    }
  }

  function showAuthMode(mode) {
    const registering = mode === 'register';
    registerForm.hidden = !registering;
    loginForm.hidden = registering;
    byId('auth-heading').textContent = registering ? 'আপনার অ্যাকাউন্ট তৈরি করুন' : 'আপনার অ্যাকাউন্টে লগইন করুন';
    document.querySelectorAll('[data-auth-mode]').forEach((button) => {
      const active = button.dataset.authMode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    setStatus(authStatus, '');
  }

  function setActivePanel(name) {
    document.querySelectorAll('[data-view]').forEach((panel) => {
      panel.hidden = panel.dataset.view !== name;
    });
    document.querySelectorAll('.account-menu-item').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.panel === name);
    });

    if (name === 'saved') void loadSavedArticles();
    if (name === 'submissions') void loadSubmissions();
    if (name === 'staff') void loadStaffApplications();
  }

  function roleName(role) {
    return ({ reporter: 'প্রতিনিধি', editor: 'সম্পাদক', admin: 'প্রশাসক' })[role] || 'পাঠক';
  }

  function setProfileForm(data) {
    const form = byId('profile-form');
    ['full_name', 'phone', 'division', 'district', 'upazila', 'address_line'].forEach((name) => {
      form.elements.namedItem(name).value = data[name] || '';
    });
    form.elements.namedItem('newsletter_opt_in').checked = Boolean(data.newsletter_opt_in);
    byId('profile-email').value = currentUser.email || '';
  }

  async function loadProfile(user) {
    const { data, error } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('আপনার প্রোফাইল তৈরি হয়নি। কিছুক্ষণ পরে আবার লগইন করুন।');

    const metadata = user.user_metadata || {};
    const fromMetadata = {
      full_name: metadata.full_name,
      phone: metadata.phone,
      division: metadata.division,
      district: metadata.district,
      upazila: metadata.upazila,
      address_line: metadata.address_line,
      newsletter_opt_in: metadata.newsletter_opt_in
    };
    const missingProfile = ['phone', 'division', 'district', 'upazila', 'address_line']
      .some((key) => !data[key] && fromMetadata[key]) ||
      (!data.newsletter_opt_in && fromMetadata.newsletter_opt_in);
    if (missingProfile) {
      const patch = {};
      Object.entries(fromMetadata).forEach(([key, value]) => {
        if ((key === 'newsletter_opt_in' && data[key] === false) ||
            (key !== 'newsletter_opt_in' && !data[key] && value)) {
          patch[key] = value;
        }
      });
      if (Object.keys(patch).length) {
        const { data: updated, error: updateError } = await client
          .from('profiles').update(patch).eq('id', user.id).select('*').single();
        if (updateError) throw updateError;
        profile = updated;
      } else {
        profile = data;
      }
    } else {
      profile = data;
    }

    setProfileForm(profile);
    const name = profile.full_name || user.email || 'পাঠক';
    byId('user-name').textContent = name;
    byId('welcome-name').textContent = name.split(/\s+/)[0];
    byId('user-email').textContent = user.email || '';
    byId('user-phone').textContent = profile.phone || 'মোবাইল নম্বর যোগ করুন';
    setProfilePhoto(metadata.avatar_url, name);
    byId('user-role').textContent = roleName(profile.role);
    byId('email-verification-status').textContent = user.email_confirmed_at
      ? 'আপনার ইমেইল যাচাই করা হয়েছে।'
      : 'ইমেইল যাচাই সম্পন্ন হলে অ্যাকাউন্ট আরও সুরক্ষিত থাকবে।';
    const staffForm = byId('staff-form');
    staffForm.elements.namedItem('full_name').value = profile.full_name || '';
    staffForm.elements.namedItem('phone').value = profile.phone || '';
    staffForm.elements.namedItem('division').value = profile.division || '';
    staffForm.elements.namedItem('district').value = profile.district || '';
    staffForm.elements.namedItem('upazila').value = profile.upazila || '';
  }

  async function showDashboard(user) {
    currentUser = user;
    authPanel.hidden = true;
    dashboard.hidden = false;
    setStatus(dashboardStatus, 'আপনার অ্যাকাউন্ট লোড হচ্ছে…');
    try {
      await loadProfile(user);
      await loadStaffApplications();
      const requestedPanel = new URLSearchParams(window.location.search).get('panel');
      setActivePanel(['overview', 'staff'].includes(requestedPanel) ? requestedPanel : 'overview');
      setStatus(dashboardStatus, '');
    } catch (error) {
      console.error('Unable to load reader profile:', error);
      setStatus(dashboardStatus, error.message || 'অ্যাকাউন্টের তথ্য লোড করা যায়নি।', 'error');
    }
  }

  function showSignedOut(mode = 'login') {
    currentUser = null;
    profile = null;
    dashboard.hidden = true;
    authPanel.hidden = false;
    showAuthMode(mode);
  }

  function friendlyError(error) {
    const message = error?.message || '';
    if (/invalid login credentials/i.test(message)) return 'মোবাইল নম্বর / ইমেইল অথবা পাসওয়ার্ড সঠিক নয়.';
    if (/unsupported phone provider|phone provider is disabled/i.test(message)) return 'মোবাইল লগইন চালু করতে Supabase Auth-এ Phone provider সক্রিয় করতে হবে।';
    if (/email not confirmed/i.test(message)) return 'ইমেইল যাচাই করে তারপর লগইন করুন।';
    if (/already registered/i.test(message)) return 'এই ইমেইলে অ্যাকাউন্ট আছে। লগইন করুন।';
    return message || 'অনুরোধটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।';
  }

  async function withButton(button, busyText, task, statusNode) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
    try {
      await task();
    } catch (error) {
      console.error('Account request failed:', error);
      setStatus(statusNode || (authPanel.hidden ? dashboardStatus : authStatus), friendlyError(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function loadPublishedArticles() {
    if (publishedArticles) return publishedArticles;
    const { data, error } = await client.from('news_articles')
      .select('id,title,summary,category,image_url,created_at,status')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    publishedArticles = (data || []).map((item) => ({
      ...item,
      id: String(item.id),
      path: `/post/${item.id}`
    }));
    return publishedArticles;
  }

  function emptyState(message) {
    const node = document.createElement('p');
    node.className = 'empty-state';
    node.textContent = message;
    return node;
  }

  function makeArticleRow(article, saved) {
    const row = document.createElement('article');
    row.className = 'article-row';
    const info = document.createElement('div');
    const title = document.createElement('h3');
    const link = document.createElement('a');
    link.href = article.path;
    link.textContent = article.title;
    title.append(link);
    const summary = document.createElement('p');
    summary.textContent = article.summary || 'প্রতিবেদনটি পড়ুন';
    info.append(title, summary);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'small-action';
    button.textContent = saved ? 'তালিকা থেকে সরান' : 'সংরক্ষণ করুন';
    button.addEventListener('click', async () => {
      button.disabled = true;
      const request = saved
        ? client.from('saved_articles').delete().eq('user_id', currentUser.id).eq('article_id', article.id)
        : client.from('saved_articles').insert({ user_id: currentUser.id, article_id: article.id });
      const { error } = await request;
      if (error) {
        console.error('Unable to update saved article:', error);
        setStatus(dashboardStatus, 'খবরটি সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।', 'error');
      } else {
        setStatus(dashboardStatus, saved ? 'সংরক্ষিত খবরের তালিকা থেকে সরানো হয়েছে।' : 'খবরটি সংরক্ষিত হয়েছে।', 'success');
        await loadSavedArticles();
      }
      button.disabled = false;
    });
    row.append(info, button);
    return row;
  }

  async function loadSavedArticles() {
    const list = byId('saved-article-list');
    const moreList = byId('more-article-list');
    list.replaceChildren(emptyState('সংরক্ষিত খবর লোড হচ্ছে…'));
    moreList.replaceChildren(emptyState('সর্বশেষ খবর লোড হচ্ছে…'));
    try {
      const [articles, savedResult] = await Promise.all([
        loadPublishedArticles(),
        client.from('saved_articles').select('article_id').eq('user_id', currentUser.id)
      ]);
      if (savedResult.error) throw savedResult.error;
      const savedIds = new Set((savedResult.data || []).map((item) => String(item.article_id)));
      const saved = articles.filter((article) => savedIds.has(String(article.id)));
      const more = articles.filter((article) => !savedIds.has(String(article.id)));
      list.replaceChildren();
      moreList.replaceChildren();
      if (!saved.length) list.append(emptyState('এখনো কোনো খবর সংরক্ষণ করেননি। নিচের তালিকা থেকে খবর সংরক্ষণ করতে পারবেন।'));
      else saved.forEach((article) => list.append(makeArticleRow(article, true)));
      if (!more.length) moreList.append(emptyState('এই মুহূর্তে নতুন কোনো খবর নেই।'));
      else more.forEach((article) => moreList.append(makeArticleRow(article, false)));
    } catch (error) {
      console.error('Unable to load saved articles:', error);
      list.replaceChildren(emptyState('সংরক্ষিত খবর লোড করা যায়নি। আবার চেষ্টা করুন।'));
      moreList.replaceChildren(emptyState('খবরের তালিকা লোড করা যায়নি। আবার চেষ্টা করুন।'));
    }
  }


  function escapeCardText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function openRepresentativeCard(item) {
    const code = item.representative_code || (item.representative_id ? `TB-${String(item.representative_id).padStart(5, '0')}` : '');
    if (!code) { setStatus(dashboardStatus, 'আইডি নম্বর তৈরি হয়নি। অ্যাডমিন অনুমোদনের পর আবার চেষ্টা করুন।', 'error'); return; }
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setStatus(dashboardStatus, 'আইডি কার্ড খুলতে ব্রাউজারের পপ-আপ অনুমতি দিন।', 'error'); return; }
    const name = escapeCardText(item.full_name || profile?.full_name || 'প্রতিনিধি');
    const designation = escapeCardText(item.designation || item.desired_role || 'প্রতিনিধি');
    const district = escapeCardText(item.district || profile?.district || 'বাংলাদেশ');
    const issued = item.created_at ? new Date(item.created_at).toLocaleDateString('bn-BD') : '';
    printWindow.document.write(`<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${code} | Tribune Bangla ID Card</title><style>
    @page{size:90mm 58mm;margin:0}*{box-sizing:border-box}body{margin:0;padding:12mm 8mm;background:#eef2f6;font-family:"Noto Sans Bengali","Hind Siliguri",Arial,sans-serif;color:#172b3a}.card{position:relative;width:85.6mm;height:54mm;overflow:hidden;padding:5mm 6mm;border-radius:3mm;background:linear-gradient(120deg,#103c52,#087f83);color:#fff;box-shadow:0 5mm 12mm #17384b33}.top{display:flex;align-items:center;gap:3mm;border-bottom:1px solid #ffffff55;padding-bottom:2.5mm}.top img{width:12mm;height:12mm;object-fit:contain;background:#fff;border-radius:2mm;padding:1mm}.brand{font-size:13pt;font-weight:900;line-height:1.2}.brand small{display:block;font-size:6.5pt;font-weight:500;opacity:.85}.label{margin-top:3mm;font-size:6pt;letter-spacing:1.2px;color:#b8f1e7;font-weight:800}.name{font-size:15pt;font-weight:900;margin-top:1mm;line-height:1.25}.role{font-size:9pt;font-weight:700;margin-top:1mm}.bottom{display:flex;justify-content:space-between;align-items:end;margin-top:4mm;padding-top:2mm;border-top:1px solid #ffffff55}.code{font:800 10pt monospace;letter-spacing:.7px}.meta{font-size:6pt;line-height:1.5;text-align:right}.watermark{position:absolute;right:-8mm;bottom:-18mm;width:55mm;height:55mm;border:1px solid #ffffff24;border-radius:50%}.toolbar{display:flex;align-items:center;gap:12px;margin:0 auto 12px;width:85.6mm;font:12px Arial,sans-serif;color:#344054}.toolbar button{border:0;border-radius:8px;padding:9px 13px;background:#125f6c;color:#fff;font-weight:800;cursor:pointer}.toolbar span{font-size:10px}@media print{body{padding:0;background:#fff}.toolbar{display:none}.card{box-shadow:none;print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body><div class="toolbar"><button type="button" onclick="window.print()">PDF ডাউনলোড / প্রিন্ট</button><span>প্রিন্ট উইন্ডোতে ‘Save as PDF’ নির্বাচন করুন</span></div><article class="card"><div class="watermark"></div><div class="top"><img src="${location.origin}/assets/tribune-mark.svg" alt=""><div class="brand">ট্রিবিউন বাংলা<small>অফিশিয়াল প্রতিনিধি পরিচয়পত্র</small></div></div><div class="label">AUTHORIZED PRESS REPRESENTATIVE</div><div class="name">${name}</div><div class="role">${designation}</div><div class="bottom"><div class="code">${escapeCardText(code)}</div><div class="meta">${district}<br>ইস্যু: ${escapeCardText(issued)}<br>tribunebangla.com</div></div></article></body></html>`);
    printWindow.document.close();
  }

  function statusLabel(status) {
    return ({ pending: 'পর্যালোচনাধীন', approved: 'অনুমোদিত', inactive: 'নিষ্ক্রিয়', rejected: 'গৃহীত হয়নি' })[status] || 'অজানা';
  }

  function reviewRow(item) {
    const row = document.createElement('article');
    row.className = 'review-row';
    const info = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = item.designation || item.title || item.desired_role || 'আবেদন';
    const note = document.createElement('p');
    const date = item.created_at ? new Date(item.created_at).toLocaleDateString('bn-BD') : '';
    const repId = item.representative_code ? `প্রতিনিধি আইডি: ${item.representative_code}` : (Number.isInteger(Number(item.representative_id)) && item.representative_id !== null
      ? `প্রতিনিধি আইডি: TB-${String(item.representative_id).padStart(5, '0')}` : '');
    const area = [item.division, item.district, item.upazila].filter(Boolean).join(' · ');
    note.textContent = [date, area, repId, item.review_note].filter(Boolean).join(' · ');
    info.append(title, note);
    const status = document.createElement('span');
    status.className = 'status-pill';
    status.dataset.status = item.status;
    status.textContent = statusLabel(item.status);
    row.append(info, status);
    if (item.status === 'approved' && (item.representative_code || item.representative_id)) {
      const cardButton = document.createElement('button');
      cardButton.type = 'button';
      cardButton.className = 'small-action representative-card-button';
      cardButton.textContent = 'আইডি কার্ড দেখুন / ডাউনলোড';
      cardButton.addEventListener('click', () => openRepresentativeCard(item));
      row.append(cardButton);
    }
    return row;
  }

  async function loadSubmissions() {
    const list = byId('submission-list');
    list.replaceChildren(emptyState('আপনার প্রতিবেদনগুলো লোড হচ্ছে…'));
    const { data, error } = await client.from('article_submissions')
      .select('id,title,status,review_note,created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Unable to load article submissions:', error);
      list.replaceChildren(emptyState('প্রতিবেদনের তালিকা লোড করা যায়নি।'));
      return;
    }
    list.replaceChildren();
    if (!data.length) list.append(emptyState('এখনো কোনো প্রতিবেদন পাঠাননি।'));
    else data.forEach((item) => list.append(reviewRow(item)));
  }

  async function loadStaffApplications() {
    const list = byId('staff-application-list');
    list.replaceChildren(emptyState('আপনার আবেদনগুলো লোড হচ্ছে…'));
    const { data, error } = await client.from('staff_applications')
      .select('id,full_name,phone,division,district,upazila,designation,desired_role,status,review_note,representative_id,representative_code,created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Unable to load staff applications:', error);
      list.replaceChildren(emptyState('আবেদনের তালিকা লোড করা যায়নি।'));
      return;
    }
    list.replaceChildren();
    if (!data.length) list.append(emptyState('এখনো কোনো আবেদন পাঠাননি।'));
    else data.forEach((item) => list.append(reviewRow(item)));

    const approved = (data || []).find((item) => item.status === 'approved');
    const summary = byId('representative-summary');
    if (summary) {
      summary.hidden = !approved;
      if (approved) {
        byId('rep-summary-title').textContent = approved.designation || 'সংবাদ প্রতিনিধি';
        byId('rep-summary-area').textContent = ['কর্মএলাকা:', approved.division, approved.district, approved.upazila].filter(Boolean).join(' · ');
        byId('rep-summary-id').textContent = approved.representative_code || (approved.representative_id ? `TB-${String(approved.representative_id).padStart(5, '0')}` : 'আইডি নম্বর বরাদ্দ হয়নি');
        byId('user-role').textContent = 'প্রতিনিধি';
      }
    }
  }

  document.querySelectorAll('[data-auth-mode]').forEach((button) => {
    button.addEventListener('click', () => showAuthMode(button.dataset.authMode));
  });

  registerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = formValues(registerForm);
    if (values.password !== values.password_confirm) {
      setStatus(authStatus, 'দুইবার লেখা পাসওয়ার্ড এক নয়।', 'error');
      return;
    }
    const button = registerForm.querySelector('[type="submit"]');
    void withButton(button, 'অ্যাকাউন্ট তৈরি হচ্ছে…', async () => {
      const profile = profileValues(values);
      const { data, error } = await client.auth.signUp({
        email: String(values.email).trim(),
        password: values.password,
        options: {
          data: profile,
          emailRedirectTo: `${window.location.origin}/account/`
        }
      });
      if (error) throw error;
      if (data.session && data.user) {
        const { error: profileError } = await client.from('profiles').update(profile).eq('id', data.user.id);
        if (profileError) throw profileError;
        setStatus(authStatus, 'নিবন্ধন সফল হয়েছে। আপনার অ্যাকাউন্ট খুলছে…', 'success');
        await showDashboard(data.user);
      } else {
        registerForm.reset();
        setStatus(authStatus, 'নিবন্ধন হয়েছে। আপনার ইমেইলে পাঠানো যাচাই-লিংকে ক্লিক করে অ্যাকাউন্ট চালু করুন।', 'success');
      }
    });
  });

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = formValues(loginForm);
    const button = loginForm.querySelector('[type="submit"]');
    void withButton(button, 'লগইন হচ্ছে…', async () => {
      const identifier = String(values.identifier || '').trim();
      const credentials = identifier.includes('@')
        ? { email: identifier, password: values.password }
        : { phone: normalizeBdPhone(identifier), password: values.password };
      const { data, error } = await client.auth.signInWithPassword(credentials);
      if (error) throw error;
      await showDashboard(data.user);
    });
  });

  byId('reset-password-button').addEventListener('click', async () => {
    const email = loginForm.elements.namedItem('identifier').value.trim();
    if (!email || !email.includes('@')) {
      setStatus(authStatus, 'পাসওয়ার্ড রিসেটের লিংক পেতে নিবন্ধিত ইমেইল ঠিকানা লিখুন।', 'error');
      return;
    }
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/account/`
    });
    if (error) {
      console.error('Password reset request failed:', error);
      setStatus(authStatus, friendlyError(error), 'error');
      return;
    }
    setStatus(authStatus, 'পাসওয়ার্ড পরিবর্তনের লিংক আপনার ইমেইলে পাঠানো হয়েছে।', 'success');
  });

  document.querySelectorAll('.account-menu-item, [data-open-panel]').forEach((button) => {
    button.addEventListener('click', () => setActivePanel(button.dataset.panel || button.dataset.openPanel));
  });

  byId('profile-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    void withButton(button, 'সংরক্ষণ হচ্ছে…', async () => {
      const values = profileValues(formValues(form));
      const { data, error } = await client.from('profiles').update(values)
        .eq('id', currentUser.id).select('*').single();
      if (error) throw error;
      profile = data;
      const { error: metadataError } = await client.auth.updateUser({ data: values });
      if (metadataError) throw metadataError;
      await loadProfile(currentUser);
      setStatus(dashboardStatus, 'আপনার তথ্য সংরক্ষণ হয়েছে।', 'success');
    });
  });

  profilePhotoInput.addEventListener('change', () => {
    const file = profilePhotoInput.files?.[0];
    profilePhotoUploadButton.disabled = !file;
    setStatus(profilePhotoStatus, '');
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    photoPreviewUrl = '';
    if (!file) {
      setProfilePhoto(currentUser?.user_metadata?.avatar_url, profile?.full_name);
      return;
    }
    try {
      validateProfilePhoto(file);
      photoPreviewUrl = URL.createObjectURL(file);
      const preview = byId('profile-photo-preview');
      preview.src = photoPreviewUrl;
      preview.hidden = false;
      byId('profile-photo-fallback').hidden = true;
    } catch (error) {
      profilePhotoInput.value = '';
      profilePhotoUploadButton.disabled = true;
      setProfilePhoto(currentUser?.user_metadata?.avatar_url, profile?.full_name);
      setStatus(profilePhotoStatus, error.message, 'error');
    }
  });

  profilePhotoUploadButton.addEventListener('click', () => {
    const file = profilePhotoInput.files?.[0];
    void withButton(profilePhotoUploadButton, 'ছবি সংরক্ষণ হচ্ছে…', async () => {
      if (!file) throw new Error('আগে একটি প্রোফাইল ছবি বেছে নিন।');
      validateProfilePhoto(file);
      const objectPath = `${currentUser.id}/avatar`;
      const { error: uploadError } = await client.storage.from(AVATAR_BUCKET).upload(objectPath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: true
      });
      if (uploadError) throw uploadError;
      const { data: publicData } = client.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);
      const photoUrl = `${publicData.publicUrl}?v=${Date.now()}`;
      const { data, error: metadataError } = await client.auth.updateUser({
        data: { avatar_url: photoUrl }
      });
      if (metadataError) throw metadataError;
      currentUser = data.user;
      setProfilePhoto(photoUrl, profile?.full_name);
      profilePhotoInput.value = '';
      profilePhotoUploadButton.disabled = true;
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      photoPreviewUrl = '';
      setStatus(profilePhotoStatus, 'প্রোফাইল ছবি সংরক্ষণ হয়েছে।', 'success');
    }, profilePhotoStatus).finally(() => {
      profilePhotoUploadButton.disabled = !profilePhotoInput.files?.[0];
    });
  });

  byId('security-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = formValues(form);
    if (values.new_password !== values.confirm_password) {
      setStatus(dashboardStatus, 'নতুন পাসওয়ার্ড দুই ঘরে একইভাবে লিখুন।', 'error');
      return;
    }
    if (values.new_password.length < 8) {
      setStatus(dashboardStatus, 'নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।', 'error');
      return;
    }
    const button = event.currentTarget.querySelector('[type="submit"]');
    void withButton(button, 'পাসওয়ার্ড বদলানো হচ্ছে…', async () => {
      const { error: verifyError } = await client.auth.signInWithPassword({
        email: currentUser.email,
        password: values.current_password
      });
      if (verifyError) throw new Error('বর্তমান পাসওয়ার্ড সঠিক নয়।');
      const { error } = await client.auth.updateUser({ password: values.new_password });
      if (error) throw error;
      form.reset();
      setStatus(dashboardStatus, 'পাসওয়ার্ড নিরাপদে পরিবর্তন হয়েছে।', 'success');
    });
  });

  byId('submission-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = formValues(form);
    const button = form.querySelector('[type="submit"]');
    const imageInput = byId('submission-image-file');
    void withButton(button, 'প্রতিবেদন পাঠানো হচ্ছে…', async () => {
      const rawImageUrl = String(values.image_url || '').trim();
      if (rawImageUrl && !rawImageUrl.startsWith('https://')) throw new Error('ছবির লিংকটি https:// দিয়ে শুরু হতে হবে।');
      const file = imageInput?.files?.[0];
      if (file && (file.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) throw new Error('JPG, PNG অথবা WebP ছবি ৮ MB-এর মধ্যে বেছে নিন।');
      if (file && rawImageUrl) throw new Error('ছবি আপলোড অথবা ছবির লিংক—একটি পদ্ধতি বেছে নিন।');
      let imageUrl = rawImageUrl || null;
      if (file) {
        const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[file.type];
        const requestedName = String(values.image_filename || '').trim();
        const originalName = file.name.replace(/\.[^.]+$/, '');
        const baseName = (requestedName || originalName).normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'reader-news-photo';
        const path = `${currentUser.id}/${Date.now()}-${baseName}.${extension}`;
        const { error: uploadError } = await client.storage.from('news-images').upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        imageUrl = client.storage.from('news-images').getPublicUrl(path).data.publicUrl;
      }
      const { error } = await client.from('article_submissions').insert({
        user_id: currentUser.id, title: String(values.title).trim(),
        summary: String(values.summary || '').trim(), body: String(values.body).trim(),
        reporter: String(values.reporter || '').trim(),
        body_alignment: String(values.body_alignment || 'justify'),
        image_caption: String(values.image_caption || '').trim(),
        category: values.category, image_url: imageUrl,
        source_note: String(values.source_note || '').trim()
      });
      if (error) throw error;
      form.reset();
      const imageStatus = byId('submission-image-status');
      if (imageStatus) imageStatus.textContent = '';
      setStatus(dashboardStatus, 'প্রতিবেদনটি পর্যালোচনার জন্য জমা হয়েছে।', 'success');
      await loadSubmissions();
    });
  });
  const staffDesignationChoice = byId('staff-designation-choice');
  const customDesignationWrap = byId('staff-custom-designation-wrap');
  const customDesignationInput = byId('staff-custom-designation');
  staffDesignationChoice?.addEventListener('change', () => {
    const custom = staffDesignationChoice.value === 'custom';
    customDesignationWrap.hidden = !custom;
    customDesignationInput.required = custom;
    if (custom) customDesignationInput.focus();
  });

  byId('staff-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = formValues(form);
    const button = form.querySelector('[type="submit"]');
    void withButton(button, 'আবেদন পাঠানো হচ্ছে…', async () => {
      const portfolioUrl = String(values.portfolio_url || '').trim();
      if (portfolioUrl && !portfolioUrl.startsWith('https://')) {
        throw new Error('পোর্টফোলিওর লিংকটি https:// দিয়ে শুরু হতে হবে।');
      }
      const applicationPhone = normalizeBdPhone(values.phone);
      const area = {
        division: String(values.division || '').trim() || null,
        district: String(values.district || '').trim() || null,
        upazila: String(values.upazila || '').trim() || null
      };
      const { error: profileUpdateError } = await client.from('profiles')
        .update({ phone: applicationPhone, ...area }).eq('id', currentUser.id);
      if (profileUpdateError) throw profileUpdateError;
      const { error } = await client.from('staff_applications').insert({
        user_id: currentUser.id,
        full_name: String(values.full_name).trim(),
        phone: applicationPhone,
        ...area,
        desired_role: values.desired_role === 'custom' ? 'reporter' : values.desired_role,
        designation: values.desired_role === 'custom' ? String(values.custom_designation || '').trim() : staffDesignationChoice.selectedOptions[0].textContent.trim(),
        experience: String(values.experience || '').trim(),
        portfolio_url: portfolioUrl || null,
        statement: String(values.statement).trim()
      });
      if (error) throw error;
      form.reset();
      customDesignationWrap.hidden = true;
      customDesignationInput.required = false;
      setStatus(dashboardStatus, 'আপনার আবেদনটি সম্পাদকীয় দলের কাছে পাঠানো হয়েছে।', 'success');
      await loadStaffApplications();
    });
  });

  byId('logout-button').addEventListener('click', async () => {
    const { error } = await client.auth.signOut();
    if (error) {
      console.error('Unable to sign out:', error);
      setStatus(dashboardStatus, friendlyError(error), 'error');
      return;
    }
    showSignedOut('login');
  });

  if (!client) {
    setStatus(authStatus, 'অ্যাকাউন্ট সেবা এখন লোড করা যাচ্ছে না। পরে আবার চেষ্টা করুন।', 'error');
    return;
  }

  client.auth.onAuthStateChange((_event, session) => {
    if (session?.user) void showDashboard(session.user);
    else if (!dashboard.hidden) showSignedOut('login');
  });

  client.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    if (data.session?.user) void showDashboard(data.session.user);
    else showSignedOut(
      new URLSearchParams(window.location.search).get('view') === 'login' ||
      /^\/login\/?$/.test(window.location.pathname) ? 'login' : 'register'
    );
  }).catch((error) => {
    console.error('Unable to restore account session:', error);
    showSignedOut('register');
    setStatus(authStatus, friendlyError(error), 'error');
  });
})();
