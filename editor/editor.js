(() => {
  'use strict';

  const SUPABASE_URL = 'https://rvffsavdvetdmhnwgivz.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_K4ir8_k1DY9EOhoC-wUT8A_8r01CJxu';
  const authCallbackType = new URLSearchParams(window.location.hash.slice(1)).get('type');
  const client = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const byId = (id) => document.getElementById(id);
  const loginPanel = byId('login-panel');
  const editorPanel = byId('editor-panel');
  const loginForm = byId('login-form');
  const loginStatus = byId('login-status');
  const editorStatus = byId('editor-status');
  const dashboardPanel = byId('dashboard-panel');
  const submissionsList = byId('submissions-list');
  const applicationsList = byId('applications-list');
  const applicationRows = byId('application-rows');
  const accountsPanel = byId('accounts-panel');
  const accountRows = byId('account-rows');
  const accountForm = byId('account-form');
  let accountRecords = [];
  let accountSearch = '';
  let selectedAccount = null;
  let applicationRecords = [];
  let applicationProfiles = new Map();
  let applicationFilter = 'all';
  let applicationSearch = '';
  const articlesList = byId('articles-list');
  const settingsPanel = byId('settings-panel');
  const managedArticles = byId('managed-articles');
  const articleForm = byId('article-form');
  const profileSettingsForm = byId('profile-settings-form');
  const articleImageInput = byId('article-image-file');
  const articleImagePreview = byId('article-image-preview');
  const articleImageStatus = byId('article-image-status');
  const passwordForm = byId('password-form');
  let activeUserId = '';
  const requestedEditorTab = new URLSearchParams(window.location.search).get('tab');
  let activeTab = ['overview', 'submissions', 'applications', 'articles', 'settings'].includes(requestedEditorTab) ? requestedEditorTab : 'overview';
  let activeEditorRole = '';
  let articleSearch = '';

  function setStatus(node, message, kind = '') {
    node.textContent = message;
    node.dataset.error = String(kind === 'error');
    node.dataset.success = String(kind === 'success');
  }

  function friendlyError(error) {
    const message = error?.message || '';
    if (/invalid login credentials/i.test(message)) return 'ইমেইল বা পাসওয়ার্ড সঠিক নয়।';
    if (/email not confirmed/i.test(message)) return 'ইমেইল আমন্ত্রণ গ্রহণ করে যাচাই সম্পন্ন করুন।';
    if (/bucket not found/i.test(message)) return 'ছবি সংরক্ষণের স্টোরেজ এখনো সেটআপ হয়নি। আপাতত ছবির HTTPS লিংক ব্যবহার করুন।';
    if (/row-level security|not authorized|unauthorized/i.test(message)) return 'ছবি আপলোডের অনুমতি নেই। স্টোরেজের সম্পাদকীয় নীতি যাচাই করুন।';
    return message || 'অনুরোধটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।';
  }

  function emptyState(message) {
    const node = document.createElement('p');
    node.className = 'empty-state';
    node.textContent = message;
    return node;
  }

  function textNode(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value || '';
    return node;
  }

  function safeHttpsUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function statusText(value) {
    return ({ pending: 'অপেক্ষমান', approved: 'অনুমোদিত', inactive: 'নিষ্ক্রিয়', rejected: 'বাতিল', draft: 'খসড়া', published: 'প্রকাশিত' })[value] || 'অজানা';
  }

  function makeReviewActions(table, record) {
    const actions = document.createElement('form');
    actions.className = 'record-actions';

    const statusLabel = document.createElement('label');
    statusLabel.append(document.createTextNode('সিদ্ধান্ত'));
    const select = document.createElement('select');
    select.name = 'status';
    (table === 'staff_applications'
      ? [['pending', 'অপেক্ষমান'], ['approved', 'অনুমোদিত'], ['inactive', 'নিষ্ক্রিয়'], ['rejected', 'বাতিল']]
      : [['pending', 'পর্যালোচনাধীন'], ['approved', 'অনুমোদিত'], ['rejected', 'গৃহীত হয়নি']]
    ).forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = record.status === value;
      select.append(option);
    });
    statusLabel.append(select);

    const noteLabel = document.createElement('label');
    noteLabel.append(document.createTextNode('সম্পাদকের নোট'));
    const note = document.createElement('input');
    note.name = 'review_note';
    note.type = 'text';
    note.maxLength = 1000;
    note.value = record.review_note || '';
    note.placeholder = 'প্রয়োজনে কারণ বা নির্দেশনা লিখুন';
    noteLabel.append(note);

    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'primary-button';
    save.textContent = 'সিদ্ধান্ত সংরক্ষণ';
    actions.append(statusLabel, noteLabel, save);
    if (table === 'article_submissions') {
      const publish = document.createElement('button');
      publish.type = 'button';
      publish.className = 'publish-button';
      publish.textContent = 'সাইটে প্রকাশ করুন';
      publish.addEventListener('click', () => {
        void publishSubmission(record.id, note.value, publish);
      });
      actions.append(publish);
    }
    actions.addEventListener('submit', (event) => {
      event.preventDefault();
      void updateReview(table, record.id, select.value, note.value, save);
    });
    return actions;
  }

  async function publishSubmission(id, reviewNote, button) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'প্রকাশ হচ্ছে…';
    try {
      const { data, error } = await client.rpc('publish_submission', {
        p_submission_id: id,
        p_review_note: reviewNote.trim()
      });
      if (error) throw error;
      await loadCurrentTab();
      if (activeTab !== 'articles') await loadManagedArticles();
      setStatus(editorStatus, `নিউজটি সাইটে প্রকাশিত হয়েছে (সংবাদ নম্বর ${data})।`, 'success');
    } catch (error) {
      console.error('Unable to publish reader submission:', error);
      setStatus(editorStatus, friendlyError(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  async function updateReview(table, id, status, reviewNote, button) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'সংরক্ষণ হচ্ছে…';
    try {
      const { error } = await client.from(table)
        .update({ status, review_note: reviewNote.trim() })
        .eq('id', id);
      if (error) throw error;
      setStatus(editorStatus, 'পর্যালোচনার সিদ্ধান্ত সংরক্ষণ হয়েছে।', 'success');
      await loadCurrentTab();
    } catch (error) {
      console.error(`Unable to review ${table} record:`, error);
      setStatus(editorStatus, friendlyError(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  async function loadSubmitterProfiles(records) {
    const ids = [...new Set(records.map((record) => record.user_id).filter(Boolean))];
    if (!ids.length) return new Map();
    const { data, error } = await client.from('profiles')
      .select('id,full_name,phone,district')
      .in('id', ids);
    if (error) throw error;
    return new Map(data.map((profile) => [profile.id, profile]));
  }

  function renderSubmission(record, profile) {
    const card = document.createElement('article');
    card.className = 'record-card';
    const content = document.createElement('div');
    content.className = 'record-content';
    const meta = document.createElement('div');
    meta.className = 'record-meta';
    meta.append(
      textNode('span', 'pill', statusText(record.status)),
      textNode('span', '', record.category || 'বিভাগহীন'),
      textNode('span', '', new Date(record.created_at).toLocaleString('bn-BD')),
      textNode('span', '', profile?.full_name || 'নাম পাওয়া যায়নি'),
      textNode('span', '', [profile?.phone, profile?.district].filter(Boolean).join(' · '))
    );
    const title = textNode('h2', '', record.title || 'শিরোনামহীন প্রতিবেদন');
    const summary = textNode('p', '', record.summary || '');
    content.append(meta, title);
    if (record.reporter) content.append(textNode('p', 'muted-label', `প্রতিবেদক: ${record.reporter}`));
    if (record.summary) content.append(summary);

    const details = document.createElement('details');
    const summaryLabel = document.createElement('summary');
    summaryLabel.textContent = 'পূর্ণ প্রতিবেদন ও তথ্যসূত্র দেখুন';
    details.append(summaryLabel, textNode('p', 'record-body', record.body));
    if (record.body_alignment) details.append(textNode('p', 'muted-label', `লেখার বিন্যাস: ${record.body_alignment}`));
    if (record.image_caption) details.append(textNode('p', 'muted-label', `ছবির ক্যাপশন: ${record.image_caption}`));
    const imageUrl = safeHttpsUrl(record.image_url);
    if (imageUrl) {
      const image = document.createElement('a');
      image.href = imageUrl;
      image.target = '_blank';
      image.rel = 'noopener noreferrer';
      image.textContent = 'সংযুক্ত ছবি খুলুন';
      details.append(image);
    }
    if (record.source_note) details.append(textNode('p', '', `তথ্যসূত্র / নোট: ${record.source_note}`));
    content.append(details, makeReviewActions('article_submissions', record));
    card.append(content);
    return card;
  }


  function escapeCardText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function openRepresentativeCard(record, profile) {
    const code = record.representative_code || (record.representative_id ? `TB-${String(record.representative_id).padStart(5, '0')}` : '');
    if (!code) { setStatus(editorStatus, 'অনুমোদনের পর আইডি তৈরি হলে কার্ড দেখা যাবে।', 'error'); return; }
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setStatus(editorStatus, 'আইডি কার্ড খুলতে ব্রাউজারের পপ-আপ অনুমতি দিন।', 'error'); return; }
    const name = escapeCardText(record.full_name || profile?.full_name || 'প্রতিনিধি');
    const designation = escapeCardText(record.designation || 'প্রতিনিধি');
    const district = escapeCardText(record.district || profile?.district || 'বাংলাদেশ');
    const issued = record.created_at ? new Date(record.created_at).toLocaleDateString('bn-BD') : '';
    printWindow.document.write(`<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${code} | Tribune Bangla ID Card</title><style>
    @page{size:90mm 58mm;margin:0}*{box-sizing:border-box}body{margin:0;padding:12mm 8mm;background:#eef2f6;font-family:"Noto Sans Bengali","Hind Siliguri",Arial,sans-serif;color:#172b3a}.card{position:relative;width:85.6mm;height:54mm;overflow:hidden;padding:5mm 6mm;border-radius:3mm;background:linear-gradient(120deg,#103c52,#087f83);color:#fff;box-shadow:0 5mm 12mm #17384b33}.top{display:flex;align-items:center;gap:3mm;border-bottom:1px solid #ffffff55;padding-bottom:2.5mm}.top img{width:12mm;height:12mm;object-fit:contain;background:#fff;border-radius:2mm;padding:1mm}.brand{font-size:13pt;font-weight:900;line-height:1.2}.brand small{display:block;font-size:6.5pt;font-weight:500;opacity:.85}.label{margin-top:3mm;font-size:6pt;letter-spacing:1.2px;color:#b8f1e7;font-weight:800}.name{font-size:15pt;font-weight:900;margin-top:1mm;line-height:1.25}.role{font-size:9pt;font-weight:700;margin-top:1mm}.bottom{display:flex;justify-content:space-between;align-items:end;margin-top:4mm;padding-top:2mm;border-top:1px solid #ffffff55}.code{font:800 10pt monospace;letter-spacing:.7px}.meta{font-size:6pt;line-height:1.5;text-align:right}.watermark{position:absolute;right:-8mm;bottom:-18mm;width:55mm;height:55mm;border:1px solid #ffffff24;border-radius:50%}.toolbar{display:flex;align-items:center;gap:12px;margin:0 auto 12px;width:85.6mm;font:12px Arial,sans-serif;color:#344054}.toolbar button{border:0;border-radius:8px;padding:9px 13px;background:#125f6c;color:#fff;font-weight:800;cursor:pointer}.toolbar span{font-size:10px}@media print{body{padding:0;background:#fff}.toolbar{display:none}.card{box-shadow:none;print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body><div class="toolbar"><button type="button" onclick="window.print()">PDF ডাউনলোড / প্রিন্ট</button><span>প্রিন্ট উইন্ডোতে ‘Save as PDF’ নির্বাচন করুন</span></div><article class="card"><div class="watermark"></div><div class="top"><img src="${location.origin}/assets/tribune-mark.svg" alt=""><div class="brand">ট্রিবিউন বাংলা<small>অফিশিয়াল প্রতিনিধি পরিচয়পত্র</small></div></div><div class="label">AUTHORIZED PRESS REPRESENTATIVE</div><div class="name">${name}</div><div class="role">${designation}</div><div class="bottom"><div class="code">${escapeCardText(code)}</div><div class="meta">${district}<br>ইস্যু: ${escapeCardText(issued)}<br>tribunebangla.com</div></div></article></body></html>`);
    printWindow.document.close();
  }

  function renderApplication(record, profile) {
    const row = document.createElement('article');
    row.className = 'application-row';
    const main = document.createElement('div');
    main.className = 'application-row-main';
    const name = textNode('strong', 'application-name', record.full_name || profile?.full_name || 'নাম উল্লেখ নেই');
    const representativeId = record.representative_code || (record.representative_id ? `TB-${String(record.representative_id).padStart(5, '0')}` : '—');
    const idCell = textNode('strong', 'application-id', representativeId);
    const phone = textNode('span', '', record.phone || profile?.phone || 'ফোন নেই');
    const district = textNode('span', '', record.district || profile?.district || 'এলাকা নেই');
    const roleLabels = { reporter: 'প্রতিনিধি', photographer: 'ফটোসাংবাদিক', editor: 'সম্পাদক' };
    const role = textNode('span', '', record.designation || roleLabels[record.desired_role] || 'পদ উল্লেখ নেই');
    const date = textNode('time', '', new Date(record.created_at).toLocaleDateString('bn-BD'));
    const status = textNode('span', 'pill', statusText(record.status));
    status.dataset.status = record.status || '';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'application-details-toggle';
    toggle.textContent = 'বিস্তারিত';
    main.append(name, idCell, phone, district, role, date, status, toggle);
    const details = document.createElement('section');
    details.className = 'application-details';
    details.hidden = true;
    if (record.experience) details.append(textNode('p', '', `অভিজ্ঞতা: ${record.experience}`));
    if (record.statement) details.append(textNode('p', 'record-body', record.statement));
    const portfolioUrl = safeHttpsUrl(record.portfolio_url);
    if (portfolioUrl) {
      const link = document.createElement('a');
      link.href = portfolioUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'পোর্টফোলিও খুলুন';
      details.append(link);
    }
    details.append(textNode('p', 'application-contact', `প্রতিনিধি আইডি: ${representativeId} · আবেদনের তারিখ: ${new Date(record.created_at).toLocaleString('bn-BD')} · আবেদনকারী ID: ${record.user_id}`));
    const designationEditor = document.createElement('form');
    designationEditor.className = 'representative-designation-editor';
    const designationLabel = document.createElement('label');
    designationLabel.textContent = 'প্রতিনিধির কাস্টম পদবি';
    const designationInput = document.createElement('input');
    designationInput.type = 'text';
    designationInput.maxLength = 80;
    designationInput.required = true;
    designationInput.value = record.designation || roleLabels[record.desired_role] || 'প্রতিনিধি';
    designationInput.placeholder = 'যেমন: ভালুকা উপজেলা প্রতিনিধি';
    designationLabel.append(designationInput);
    const designationSave = document.createElement('button');
    designationSave.type = 'submit';
    designationSave.className = 'primary-button';
    designationSave.textContent = 'পদবি সংরক্ষণ';
    designationEditor.append(designationLabel, designationSave);
    designationEditor.addEventListener('submit', async (event) => {
      event.preventDefault();
      const value = designationInput.value.trim();
      if (value.length < 2) { setStatus(editorStatus, 'কমপক্ষে ২ অক্ষরের পদবি লিখুন।', 'error'); return; }
      designationSave.disabled = true;
      try {
        const { error } = await client.from('staff_applications').update({ designation: value }).eq('id', record.id);
        if (error) throw error;
        setStatus(editorStatus, 'প্রতিনিধির পদবি সংরক্ষণ হয়েছে।', 'success');
        await loadApplications();
      } catch (error) {
        setStatus(editorStatus, friendlyError(error), 'error');
        designationSave.disabled = false;
      }
    });
    details.append(designationEditor);

    if (record.status === 'approved') {
      const cardButton = document.createElement('button');
      cardButton.type = 'button';
      cardButton.className = 'primary-button representative-card-action';
      cardButton.textContent = 'আইডি কার্ড দেখুন / ডাউনলোড';
      cardButton.addEventListener('click', () => openRepresentativeCard(record, profile));
      details.append(cardButton);

      const codeEditor = document.createElement('form');
      codeEditor.className = 'representative-code-editor';
      const codeLabel = document.createElement('label');
      codeLabel.textContent = 'কাস্টম প্রতিনিধি আইডি';
      const codeInput = document.createElement('input');
      codeInput.type = 'text';
      codeInput.name = 'representative_code';
      codeInput.maxLength = 32;
      codeInput.autocomplete = 'off';
      codeInput.spellcheck = false;
      codeInput.value = record.representative_code || representativeId;
      codeInput.placeholder = 'যেমন: TB-VAL-0001';
      codeInput.required = true;
      codeLabel.append(codeInput);
      const codeHelp = textNode('small', '', 'আইডি অবশ্যই TB- দিয়ে শুরু হবে; অক্ষর, সংখ্যা ও হাইফেন ব্যবহার করুন।');
      const codeSave = document.createElement('button');
      codeSave.type = 'submit';
      codeSave.className = 'primary-button';
      codeSave.textContent = 'কাস্টম আইডি সংরক্ষণ';
      codeEditor.append(codeLabel, codeHelp, codeSave);
      codeEditor.addEventListener('submit', async (event) => {
        event.preventDefault();
        const customCode = codeInput.value.trim().toUpperCase();
        if (!/^TB-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(customCode) || customCode.length > 32) {
          setStatus(editorStatus, 'সঠিক আইডি লিখুন। উদাহরণ: TB-VAL-0001', 'error');
          codeInput.focus();
          return;
        }
        codeSave.disabled = true;
        codeSave.textContent = 'সংরক্ষণ হচ্ছে…';
        try {
          const { error } = await client.from('staff_applications')
            .update({ representative_code: customCode })
            .eq('id', record.id);
          if (error) throw error;
          setStatus(editorStatus, `প্রতিনিধি আইডি ${customCode} সংরক্ষণ হয়েছে।`, 'success');
          await loadApplications();
        } catch (error) {
          console.error('Unable to save custom representative ID:', error);
          const message = /duplicate key|unique constraint/i.test(error.message || '')
            ? 'এই আইডি নম্বরটি অন্য একজনের আছে। নতুন আইডি ব্যবহার করুন।'
            : friendlyError(error);
          setStatus(editorStatus, message, 'error');
          codeSave.disabled = false;
          codeSave.textContent = 'কাস্টম আইডি সংরক্ষণ';
        }
      });
      details.append(codeEditor);
    } else {
      details.append(textNode('p', 'application-contact', 'অনুমোদন দেওয়ার পর TB যুক্ত প্রতিনিধি আইডি তৈরি হবে।'));
    }
    details.append(makeReviewActions('staff_applications', record));
    toggle.addEventListener('click', () => {
      details.hidden = !details.hidden;
      toggle.textContent = details.hidden ? 'বিস্তারিত' : 'বন্ধ করুন';
    });
    row.append(main, details);
    return row;
  }

  function renderNewsArticle(record) {
    const card = document.createElement('article');
    card.className = 'record-card';
    const content = document.createElement('div');
    content.className = 'record-content';
    const meta = document.createElement('div');
    meta.className = 'record-meta';
    meta.append(
      textNode('span', 'pill', statusText(record.status)),
      textNode('span', '', record.category || 'বিভাগহীন'),
      textNode('span', '', new Date(record.created_at).toLocaleString('bn-BD')),
      textNode('span', '', `সংবাদ নম্বর ${record.id}`)
    );
    content.append(meta, textNode('h2', '', record.title));
    if (record.reporter) content.append(textNode('p', 'record-meta', `প্রতিবেদক: ${record.reporter}`));
    if (record.summary) content.append(textNode('p', '', record.summary));
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'পূর্ণ প্রতিবেদন দেখুন';
    details.append(summary, textNode('p', 'record-body', record.body));
    if (record.image_url) { const preview = document.createElement('img'); preview.src = record.image_url; preview.alt = record.image_caption || record.title || 'সংবাদের ছবি'; preview.className = 'managed-article-image'; details.append(preview); }
    if (record.image_caption) details.append(textNode('p', '', `ছবির ক্যাপশন: ${record.image_caption}`));
    content.append(details);
    const actions = document.createElement('div');
    actions.className = 'record-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'primary-button';
    edit.textContent = 'সম্পাদনা করুন';
    edit.addEventListener('click', () => editNewsArticle(record));
    actions.append(edit);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger-button';
    remove.textContent = 'ডিলিট';
    remove.addEventListener('click', () => { void deleteNewsArticle(record, remove); });
    actions.append(remove);
    if (record.status === 'published') {
      const link = document.createElement('a');
      link.href = `/post/${record.id}/`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'secondary-button';
      link.textContent = 'সাইটে দেখুন';
      actions.append(link);
    }
    content.append(actions);
    card.append(content);
    return card;
  }

  async function deleteNewsArticle(record, button) {
    const title = record.title || 'এই নিউজ';
    if (!window.confirm(`“${title}” স্থায়ীভাবে ডিলিট করতে চান? এই কাজ ফিরিয়ে নেওয়া যাবে না।`)) return;
    button.disabled = true;
    button.textContent = 'ডিলিট হচ্ছে…';
    try {
      const { error } = await client.from('news_articles').delete().eq('id', record.id);
      if (error) throw error;
      setStatus(editorStatus, 'নিউজটি ডিলিট করা হয়েছে।', 'success');
      await loadManagedArticles();
    } catch (error) {
      console.error('Unable to delete article:', error);
      setStatus(editorStatus, friendlyError(error), 'error');
      button.disabled = false;
      button.textContent = 'ডিলিট';
    }
  }

  function normalizeArticleSearch(value) {
    return String(value ?? '').toLocaleLowerCase('bn-BD')
      .replace(/[০-৯]/g, (digit) => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)))
      .trim();
  }

  function renderAutoNewsArticle(record) {
    const card = document.createElement('article');
    card.className = 'record-card auto-news-record';
    const content = document.createElement('div');
    content.className = 'record-content';
    const meta = document.createElement('div');
    meta.className = 'record-meta';
    meta.append(
      textNode('span', 'pill', 'অটো পোস্ট'),
      textNode('span', '', record.category || 'বিভাগহীন'),
      textNode('span', '', record.publishedAt ? new Date(record.publishedAt).toLocaleString('bn-BD') : ''),
      textNode('span', '', record.contentStatus === 'excerpt_only' ? 'RSS সারাংশ — পূর্ণ প্রতিবেদন নয়' : 'স্বয়ংক্রিয় সংবাদ')
    );
    content.append(meta, textNode('h2', '', record.title || 'শিরোনামহীন সংবাদ'));
    if (record.summary) content.append(textNode('p', '', record.summary));
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'সংরক্ষিত লেখা ও তথ্যসূত্র দেখুন';
    details.append(summary, textNode('p', 'record-body', record.body || 'এই পোস্টে পূর্ণ প্রতিবেদন পাওয়া যায়নি।'));
    const imageUrl = safeHttpsUrl(record.image);
    if (imageUrl) {
      const preview = document.createElement('img');
      preview.src = imageUrl;
      preview.alt = record.title || 'অটো নিউজের ছবি';
      preview.className = 'managed-article-image';
      preview.loading = 'lazy';
      details.append(preview);
    } else {
      details.append(textNode('p', 'muted-label', 'এই অটো পোস্টে কোনো ছবি পাওয়া যায়নি।'));
    }
    const sourceUrl = safeHttpsUrl(record.sourceUrl);
    if (sourceUrl) {
      const source = document.createElement('a');
      source.href = sourceUrl;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      source.textContent = 'মূল সংবাদসূত্র খুলুন';
      details.append(source);
    }
    const editLink = document.createElement('a');
    editLink.className = 'secondary-button auto-news-edit-link';
    editLink.href = '/github-cms?article=' + encodeURIComponent(String(record.id));
    editLink.textContent = 'সম্পাদনা করুন';
    editLink.setAttribute('aria-label', (record.title || 'অটো নিউজ') + ' সম্পাদনা করুন');
    content.append(details, editLink, textNode('p', 'muted-label', 'সম্পাদনার জন্য GitHub অনুমোদন প্রয়োজন। সংরক্ষিত পরিবর্তন মূল সাইটে প্রয়োগ হবে।'));
    card.append(content);
    return card;
  }

  async function loadManagedArticles() {
    managedArticles.replaceChildren(emptyState('নিউজের তালিকা লোড হচ্ছে…'));
    const [databaseResult, feedResult] = await Promise.all([
      client.from('news_articles')
        .select('id,title,summary,body,category,image_url,image_caption,reporter,body_alignment,status,created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      fetch('/articles.json?admin=' + Date.now(), { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error('অটো নিউজ ফিড লোড করা যায়নি।');
          const payload = await response.json();
          return Array.isArray(payload?.articles) ? payload.articles : [];
        })
        .catch((error) => {
          console.warn('Auto-news feed unavailable in editor:', error);
          return [];
        })
    ]);
    if (databaseResult.error) throw databaseResult.error;
    const query = normalizeArticleSearch(articleSearch);
    const matches = (record) => !query || normalizeArticleSearch([record.title, record.summary, record.body, record.category, record.reporter, record.id].join(' ')).includes(query);
    const databaseRows = databaseResult.data || [];
    const databaseArticles = databaseRows.filter(matches);
    const databaseIds = new Set(databaseRows.map((record) => String(record.id)));
    const autoArticles = feedResult.filter((record) => !databaseIds.has(String(record.id)) && matches(record));
    managedArticles.replaceChildren();
    if (!databaseArticles.length && !autoArticles.length) {
      managedArticles.append(emptyState(query ? 'আপনার অনুসন্ধানের সঙ্গে কোনো নিউজ মেলেনি। বানান বা অন্য শব্দ দিয়ে আবার খুঁজুন।' : 'এখনো কোনো নিউজ তৈরি বা প্রকাশ করা হয়নি।'));
      return;
    }
    managedArticles.append(textNode('p', 'managed-news-result-count', `অনুসন্ধানের ফল: ${(databaseArticles.length + autoArticles.length).toLocaleString('bn-BD')}টি নিউজ`));
    const heading = textNode('h2', 'managed-news-group-title', 'এডিটরিয়াল নিউজ ও খসড়া');
    managedArticles.append(heading);
    if (databaseArticles.length) {
      databaseArticles.forEach((record) => managedArticles.append(renderNewsArticle(record)));
    } else {
      managedArticles.append(emptyState('ডাটাবেজে কোনো নিউজ নেই।'));
    }
    managedArticles.append(textNode('h2', 'managed-news-group-title', `স্বয়ংক্রিয় নিউজ ফিড (${autoArticles.length.toLocaleString('bn-BD')}টি)`));
    if (autoArticles.length) {
      autoArticles.forEach((record) => managedArticles.append(renderAutoNewsArticle(record)));
    } else {
      managedArticles.append(emptyState('বর্তমানে articles.json-এ কোনো অটো নিউজ নেই।'));
    }
  }

  function startNewArticle() {
    articleForm.reset();
    articleImagePreview.hidden = true;
    articleImagePreview.removeAttribute('src');
    articleImageStatus.textContent = '';
    articleImageStatus.dataset.error = 'false';
    articleForm.elements.namedItem('id').value = '';
    articleForm.elements.namedItem('status').value = 'draft';
    byId('article-form-heading').textContent = 'নতুন নিউজ লিখুন';
    articleForm.hidden = false;
    articleForm.elements.namedItem('title').focus();
  }

  function editNewsArticle(record) {
    articleImageInput.value = '';
    articleForm.elements.namedItem('image_filename').value = '';
    articleForm.elements.namedItem('id').value = String(record.id);
    articleForm.elements.namedItem('title').value = record.title || '';
    articleForm.elements.namedItem('category').value = record.category || 'জাতীয়';
    articleForm.elements.namedItem('summary').value = record.summary || '';
    articleForm.elements.namedItem('image_url').value = record.image_url || '';
    articleForm.elements.namedItem('body').value = record.body || '';
    articleForm.elements.namedItem('reporter').value = record.reporter || '';
    articleForm.elements.namedItem('body_alignment').value = record.body_alignment || 'justify';
    articleForm.elements.namedItem('image_caption').value = record.image_caption || '';
    articleForm.elements.namedItem('status').value = record.status || 'draft';
    articleImagePreview.src = safeHttpsUrl(record.image_url) || '';
    articleImagePreview.hidden = !articleImagePreview.src;
    articleImageStatus.textContent = record.image_url ? 'বর্তমান ছবিটি রাখা হবে। নতুন ছবি দিলে এটি বদলে যাবে।' : '';
    byId('article-form-heading').textContent = `সংবাদ নম্বর ${record.id} সম্পাদনা`;
    articleForm.hidden = false;
    articleForm.elements.namedItem('title').focus();
  }

  async function loadRecords(table, list, renderer, emptyMessage) {
    list.replaceChildren(emptyState('তথ্য লোড হচ্ছে…'));
    const { data, error } = await client.from(table).select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    if (!data.length) {
      list.replaceChildren(emptyState(emptyMessage));
      return;
    }
    const profiles = await loadSubmitterProfiles(data);
    list.replaceChildren(...data.map((record) => renderer(record, profiles.get(record.user_id))));
  }

  function normalizeRepresentativeSearch(value) {
    return String(value ?? '')
      .toLocaleLowerCase('bn-BD')
      .replace(/[০-৯]/g, (digit) => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)))
      .replace(/[\\s\\-]/g, '')
      .trim();
  }

  function renderApplicationRows() {
    const counts = { all: applicationRecords.length, pending: 0, approved: 0, inactive: 0, rejected: 0 };
    applicationRecords.forEach((record) => { if (Object.prototype.hasOwnProperty.call(counts, record.status)) counts[record.status] += 1; });
    Object.entries(counts).forEach(([key, count]) => {
      const node = byId(`application-count-${key}`);
      if (node) node.textContent = count.toLocaleString('bn-BD');
    });
    document.querySelectorAll('[data-application-filter]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.applicationFilter === applicationFilter);
      button.setAttribute('aria-pressed', String(button.dataset.applicationFilter === applicationFilter));
    });
    const query = normalizeRepresentativeSearch(applicationSearch);
    const filtered = applicationRecords.filter((record) => {
      if (applicationFilter !== 'all' && record.status !== applicationFilter) return false;
      if (!query) return true;
      const profile = applicationProfiles.get(record.user_id);
      const searchable = [
        record.representative_id,
        record.representative_code, record.designation,
        record.full_name, profile?.full_name,
        record.district, profile?.district
      ].map(normalizeRepresentativeSearch).join(' ');
      return searchable.includes(query);
    });
    applicationRows.replaceChildren();
    if (!filtered.length) {
      const labels = { all: 'এখনো কোনো প্রতিনিধি আবেদন জমা পড়েনি।', pending: 'কোনো অপেক্ষমান আবেদন নেই।', approved: 'এখনো কোনো অনুমোদিত আবেদন নেই।', inactive: 'নিষ্ক্রিয় আবেদন নেই।', rejected: 'বাতিল আবেদন নেই।' };
      applicationRows.append(emptyState(query ? 'আপনার দেওয়া আইডি, নাম বা জেলার সঙ্গে কোনো প্রতিনিধি মেলেনি।' : (labels[applicationFilter] || labels.all)));
      return;
    }
    applicationRows.append(...filtered.map((record) => renderApplication(record, applicationProfiles.get(record.user_id))));
  }

  byId('representative-search-input')?.addEventListener('input', (event) => {
    applicationSearch = event.currentTarget.value;
    renderApplicationRows();
  });

  async function loadApplications() {
    applicationRows.replaceChildren(emptyState('প্রতিনিধি আবেদনের তালিকা লোড হচ্ছে…'));
    const { data, error } = await client.from('staff_applications')
      .select('*').order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    applicationRecords = data || [];
    applicationProfiles = await loadSubmitterProfiles(applicationRecords);
    renderApplicationRows();
  }

  async function loadDashboardMetric(countId, noteId, table, status) {
    const countNode = byId(countId);
    const noteNode = byId(noteId);
    const card = countNode.closest('.dashboard-stat');
    card.dataset.state = 'loading';
    countNode.textContent = '—';
    noteNode.textContent = 'তথ্য লোড হচ্ছে…';

    try {
      let query = client.from(table).select('id', table === 'news_articles' ? {} : { count: 'exact', head: true });
      if (status) query = query.eq('status', status);
      const result = await query;
      if (result.error) throw result.error;
      let count = result.count;
      if (table === 'news_articles') {
        const databaseIds = (result.data || []).map((row) => String(row.id));
        let autoCount = 0;
        try {
          const response = await fetch('/articles.json?dashboard=' + Date.now(), { cache: 'no-store' });
          if (response.ok) {
            const payload = await response.json();
            const feed = Array.isArray(payload?.articles) ? payload.articles : [];
            const seen = new Set(databaseIds);
            feed.forEach((record) => {
              if (record && String(record.status || 'published') === String(status || 'published') && !seen.has(String(record.id))) {
                seen.add(String(record.id));
                autoCount += 1;
              }
            });
          }
        } catch (feedError) {
          console.warn('Automatic news count unavailable:', feedError);
        }
        count = databaseIds.length + autoCount;
        countNode.textContent = count.toLocaleString('bn-BD');
        noteNode.textContent = `ডাটাবেজ ${databaseIds.length.toLocaleString('bn-BD')}টি · অটো নিউজ ${autoCount.toLocaleString('bn-BD')}টি`;
      } else {
        if (typeof count !== 'number') throw new Error('তথ্যের সংখ্যা পাওয়া যায়নি।');
        countNode.textContent = count.toLocaleString('bn-BD');
        noteNode.textContent = 'ডেটাবেস থেকে হালনাগাদ';
      }
      card.dataset.state = 'ok';
    } catch (error) {
      console.error(`Unable to load ${table} dashboard count:`, error);
      countNode.textContent = '—';
      noteNode.textContent = friendlyError(error);
      card.dataset.state = 'error';
    }
  }

  async function runHealthCheck(cardId, check) {
    const card = byId(cardId);
    const state = card.querySelector('.health-state');
    const detail = card.querySelector('.health-detail');
    card.dataset.state = 'loading';
    state.textContent = 'পরীক্ষা হচ্ছে…';
    detail.textContent = '';

    try {
      detail.textContent = await check();
      state.textContent = 'সচল';
      card.dataset.state = 'ok';
    } catch (error) {
      console.error(`Dashboard health check failed (${cardId}):`, error);
      state.textContent = 'সমস্যা';
      detail.textContent = friendlyError(error);
      card.dataset.state = 'error';
    }
  }

  async function loadDashboardOverview() {
    const refreshButton = byId('refresh-dashboard-button');
    refreshButton.disabled = true;
    try {
      await Promise.all([
        loadDashboardMetric('pending-submissions-count', 'pending-submissions-note', 'article_submissions', 'pending'),
        loadDashboardMetric('pending-applications-count', 'pending-applications-note', 'staff_applications', 'pending'),
        loadDashboardMetric('published-articles-count', 'published-articles-note', 'news_articles', 'published'),
        loadDashboardMetric('draft-articles-count', 'draft-articles-note', 'news_articles', 'draft'),
        runHealthCheck('health-homepage', async () => {
          const response = await fetch('/', { cache: 'no-store' });
          if (!response.ok) throw new Error(`মূল সাইট HTTP ${response.status}`);
          return `HTTP ${response.status} · ${new URL(response.url).host}`;
        }),
        runHealthCheck('health-admin-route', async () => {
          const response = await fetch('/admin', { cache: 'no-store' });
          const path = new URL(response.url).pathname.replace(/\/+$/, '');
          if (!response.ok || path !== '/editor') {
            throw new Error(`/admin রুট /editor-এ পৌঁছায়নি (HTTP ${response.status})`);
          }
          return '/admin → /editor ঠিক আছে';
        }),
        runHealthCheck('health-news-feed', async () => {
          const response = await fetch(`/articles.json?check=${Date.now()}`, { cache: 'no-store' });
          if (!response.ok) throw new Error(`নিউজ ফিড HTTP ${response.status}`);
          const data = await response.json();
          if (!Array.isArray(data?.articles)) throw new Error('নিউজ ফিডের গঠন সঠিক নয়।');
          return `${data.articles.length.toLocaleString('bn-BD')}টি স্থির নিউজ রেকর্ড`;
        }),
        runHealthCheck('health-database', async () => {
          const response = await fetch(
            `${SUPABASE_URL}/rest/v1/news_articles?select=id&status=eq.published&limit=1`,
            {
              headers: {
                apikey: SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
              },
              cache: 'no-store'
            }
          );
          if (!response.ok) throw new Error(`প্রকাশিত নিউজ API HTTP ${response.status}`);
          const records = await response.json();
          if (!Array.isArray(records)) throw new Error('প্রকাশিত নিউজ API-র উত্তর সঠিক নয়।');
          return records.length ? 'Supabase সংযোগ ও public read ঠিক আছে' : 'সংযোগ ঠিক আছে · এখনো প্রকাশিত নিউজ নেই';
        }),
        runHealthCheck('health-editor-access', async () => {
          const { data, error } = await client.from('profiles')
            .select('role')
            .eq('id', activeUserId)
            .maybeSingle();
          if (error) throw error;
          if (!data || !['admin', 'editor'].includes(data.role)) {
            throw new Error('সম্পাদকীয় অনুমতি যাচাই হয়নি।');
          }
          return `${data.role === 'admin' ? 'প্রধান সম্পাদক' : 'সম্পাদক'} অনুমতি সক্রিয়`;
        })
      ]);
      byId('dashboard-updated-at').textContent =
        `শেষ পরীক্ষা: ${new Date().toLocaleTimeString('bn-BD')}`;
    } finally {
      refreshButton.disabled = false;
    }
  }


  function accountDate(value) {
    if (!value) return 'তথ্য নেই';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'তথ্য নেই' : date.toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function renderAccountRows() {
    accountRows.replaceChildren();
    byId('account-list-count').textContent = `মোট ${accountRecords.length.toLocaleString('bn-BD')}টি অ্যাকাউন্ট`;
    if (!accountRecords.length) {
      accountRows.append(emptyState('কোনো অ্যাকাউন্ট পাওয়া যায়নি।'));
      return;
    }
    accountRecords.forEach((account) => {
      const disabled = account.banned_until && new Date(account.banned_until) > new Date();
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'account-row';
      button.setAttribute('aria-current', String(selectedAccount?.id === account.id));
      const main = document.createElement('span');
      main.className = 'account-row-main';
      main.append(textNode('strong', '', account.full_name || 'নাম দেওয়া হয়নি'));
      main.append(textNode('small', '', account.email || 'ইমেইল নেই'));
      const contact = textNode('span', 'account-row-contact', [account.phone, account.representative_code, account.designation].filter(Boolean).join(' · ') || 'মোবাইল / প্রতিনিধি তথ্য নেই');
      const area = textNode('span', 'account-row-area', [account.division, account.district, account.upazila].filter(Boolean).join(' · ') || 'কর্মএলাকা দেওয়া নেই');
      const meta = document.createElement('span');
      meta.className = 'account-row-meta';
      const roleLabels = { reader: 'পাঠক', reporter: 'প্রতিনিধি', editor: 'সম্পাদক', admin: 'প্রশাসক' };
      meta.append(textNode('strong', 'account-role', roleLabels[account.role] || account.role));
      meta.append(textNode('small', disabled ? 'স্থগিত' : 'সক্রিয়'));
      button.append(main, contact, area, meta);
      button.addEventListener('click', () => openAccountEditor(account));
      accountRows.append(button);
    });
  }

  async function loadAccounts() {
    accountRows.replaceChildren(emptyState('অ্যাকাউন্টের তালিকা লোড হচ্ছে…'));
    const { data, error } = await client.rpc('admin_list_accounts', { p_search: accountSearch || null });
    if (error) throw error;
    accountRecords = data || [];
    renderAccountRows();
  }

  function openAccountEditor(account) {
    selectedAccount = account;
    accountForm.hidden = false;
    accountForm.elements.namedItem('user_id').value = account.id;
    accountForm.elements.namedItem('desired_role').value = account.desired_role || '';
    accountForm.elements.namedItem('desired_role').disabled = !account.application_status;
    byId('account-edit-title').textContent = account.full_name || account.email || 'অ্যাকাউন্ট';
    byId('account-edit-note').textContent = account.application_status
      ? 'শুধু প্রতিনিধির ধরন পরিবর্তন করা যাবে। ব্যক্তিগত তথ্য অপরিবর্তিত থাকবে।'
      : 'এই অ্যাকাউন্টে প্রতিনিধি আবেদন নেই; প্রতিনিধির ধরন পরিবর্তন করা যাবে না।';
    const disabled = account.banned_until && new Date(account.banned_until) > new Date();
    byId('account-current-state').textContent = `${disabled ? 'স্থগিত' : 'সক্রিয়'} · নিবন্ধন: ${accountDate(account.created_at)} · শেষ লগইন: ${accountDate(account.last_sign_in_at)}`;
    byId('account-toggle-access').textContent = disabled ? 'অ্যাকাউন্ট পুনরায় চালু করুন' : 'অ্যাকাউন্ট স্থগিত করুন';
    byId('account-toggle-access').disabled = account.id === activeUserId;
    accountForm.querySelector('[type="submit"]').disabled = !account.application_status;
    byId('account-edit-status').textContent = '';
    accountForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  accountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (activeEditorRole !== 'admin' || !selectedAccount || !selectedAccount.application_status) return;
    const desiredRole = accountForm.elements.namedItem('desired_role').value;
    if (!['reporter', 'photographer', 'editor'].includes(desiredRole)) {
      setStatus(byId('account-edit-status'), 'প্রতিনিধির ধরন নির্বাচন করুন।', 'error');
      return;
    }
    const button = accountForm.querySelector('[type="submit"]');
    button.disabled = true;
    setStatus(byId('account-edit-status'), 'প্রতিনিধির ধরন সংরক্ষণ হচ্ছে…');
    try {
      const { error } = await client.rpc('admin_update_representative_type', {
        p_user_id: selectedAccount.id,
        p_desired_role: desiredRole
      });
      if (error) throw error;
      setStatus(byId('account-edit-status'), 'প্রতিনিধির ধরন সংরক্ষণ হয়েছে।', 'success');
      await loadAccounts();
      const updated = accountRecords.find((item) => item.id === selectedAccount.id);
      if (updated) openAccountEditor(updated);
    } catch (error) {
      console.error('Unable to update representative type:', error);
      setStatus(byId('account-edit-status'), friendlyError(error), 'error');
    } finally {
      button.disabled = !selectedAccount?.application_status;
    }
  });

  byId('account-reset-password').addEventListener('click', async () => {
    if (!selectedAccount?.email || activeEditorRole !== 'admin') return;
    const button = byId('account-reset-password');
    button.disabled = true;
    try {
      const { error } = await client.auth.resetPasswordForEmail(selectedAccount.email, {
        redirectTo: `${window.location.origin}/account/`
      });
      if (error) throw error;
      setStatus(byId('account-edit-status'), 'পাসওয়ার্ড রিসেট লিংক ব্যবহারকারীর ইমেইলে পাঠানো হয়েছে।', 'success');
    } catch (error) {
      setStatus(byId('account-edit-status'), friendlyError(error), 'error');
    } finally {
      button.disabled = false;
    }
  });

  byId('account-toggle-access').addEventListener('click', async () => {
    if (!selectedAccount || activeEditorRole !== 'admin' || selectedAccount.id === activeUserId) return;
    const disabled = selectedAccount.banned_until && new Date(selectedAccount.banned_until) > new Date();
    const button = byId('account-toggle-access');
    button.disabled = true;
    try {
      const { error } = await client.rpc('admin_set_account_access', {
        p_user_id: selectedAccount.id,
        p_disabled: !disabled
      });
      if (error) throw error;
      setStatus(byId('account-edit-status'), disabled ? 'অ্যাকাউন্ট পুনরায় চালু হয়েছে।' : 'অ্যাকাউন্ট স্থগিত করা হয়েছে।', 'success');
      await loadAccounts();
      const updated = accountRecords.find((item) => item.id === selectedAccount.id);
      if (updated) openAccountEditor(updated);
    } catch (error) {
      setStatus(byId('account-edit-status'), friendlyError(error), 'error');
    } finally {
      button.disabled = false;
    }
  });


  byId('account-search-input').addEventListener('input', (event) => {
    accountSearch = event.currentTarget.value.trim();
    void loadAccounts().catch((error) => {
      console.error('Account search failed:', error);
      setStatus(editorStatus, friendlyError(error), 'error');
    });
  });
  byId('refresh-accounts-button').addEventListener('click', () => {
    void loadAccounts().catch((error) => setStatus(editorStatus, friendlyError(error), 'error'));
  });
  byId('account-cancel-edit').addEventListener('click', () => {
    accountForm.hidden = true;
    selectedAccount = null;
  });

  async function loadCurrentTab() {
    setStatus(editorStatus, '');
    try {
      if (activeTab === 'overview') {
        await loadDashboardOverview();
        return;
      }
      if (activeTab === 'articles') {
        await loadManagedArticles();
        return;
      }
      if (activeTab === 'accounts') {
        if (activeEditorRole !== 'admin') throw new Error('শুধু প্রশাসক অ্যাকাউন্ট ব্যবস্থাপনা করতে পারবেন।');
        await loadAccounts();
        return;
      }
      if (activeTab === 'settings') return;

      const applications = activeTab === 'applications';
      if (applications) {
        await loadApplications();
        return;
      }
      await loadRecords('article_submissions', submissionsList, renderSubmission, 'এখনো কোনো সংবাদ জমা পড়েনি।');
    } catch (error) {
      console.error('Unable to load editorial records:', error);
      setStatus(editorStatus, 'তথ্য লোড করা যায়নি। অনুমতি বা সংযোগ যাচাই করে আবার চেষ্টা করুন।', 'error');
      const list = activeTab === 'applications' ? applicationRows :
        activeTab === 'accounts' ? accountRows :
        activeTab === 'articles' ? managedArticles : submissionsList;
      if (activeTab !== 'overview') list.replaceChildren(emptyState('তালিকা লোড করা যায়নি।'));
    }
  }

  articleImageInput.addEventListener('change', () => {
    const file = articleImageInput.files[0];
    articleImageStatus.textContent = '';
    articleImageStatus.dataset.error = 'false';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      articleImageInput.value = '';
      setStatus(articleImageStatus, 'JPG, PNG অথবা WebP ছবি বেছে নিন।', 'error');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      articleImageInput.value = '';
      setStatus(articleImageStatus, 'ছবির আকার ৮ MB-এর মধ্যে হতে হবে।', 'error');
      return;
    }
    articleForm.elements.namedItem('image_url').value = '';
    articleImagePreview.src = URL.createObjectURL(file);
    articleImagePreview.hidden = false;
    articleImageStatus.textContent = `${file.name} · আপলোডের জন্য প্রস্তুত`;
  });

  profileSettingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = String(new FormData(profileSettingsForm).get('full_name') || '').trim();
    const button = profileSettingsForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const { error } = await client.from('profiles')
        .update({ full_name: name })
        .eq('id', activeUserId);
      if (error) throw error;
      byId('editor-identity').textContent = `${name} · ${activeEditorRole === 'admin' ? 'প্রধান সম্পাদক' : 'সম্পাদক'}`;
      setStatus(editorStatus, 'সম্পাদকের নাম সংরক্ষণ হয়েছে।', 'success');
    } catch (error) {
      console.error('Unable to update editor profile:', error);
      setStatus(editorStatus, friendlyError(error), 'error');
    } finally {
      button.disabled = false;
    }
  });

  byId('settings-password-button').addEventListener('click', () => {
    passwordForm.hidden = false;
    passwordForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    passwordForm.elements.namedItem('password').focus();
  });

  articleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(articleForm).entries());
    const imageInput = String(values.image_url || '').trim();
    let imageUrl = imageInput ? safeHttpsUrl(imageInput) : null;
    if (imageInput && !imageUrl) {
      setStatus(editorStatus, 'ছবির লিংকটি HTTPS ঠিকানা হতে হবে।', 'error');
      return;
    }
    const file = articleImageInput.files[0];
    if (file && (file.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      setStatus(articleImageStatus, 'JPG, PNG অথবা WebP ছবি ৮ MB-এর মধ্যে বেছে নিন।', 'error');
      return;
    }
    const button = articleForm.querySelector('[type="submit"]');
    const label = button.textContent;
    button.disabled = true;
    button.textContent = file ? 'ছবি আপলোড হচ্ছে…' : 'সংরক্ষণ হচ্ছে…';
    try {
      if (file) {
        const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[file.type];
        const requestedName = String(values.image_filename || '').trim();
        const baseName = (requestedName || file.name.replace(/\\.[^.]+$/, '')).normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'tribune-photo';
        const path = `${activeUserId}/${Date.now()}-${baseName}.${extension}`;
        const { error: uploadError } = await client.storage.from('news-images').upload(path, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false
        });
        if (uploadError) throw uploadError;
        imageUrl = client.storage.from('news-images').getPublicUrl(path).data.publicUrl;
      }
      const payload = {
        title: String(values.title).trim(),
        summary: String(values.summary || '').trim(),
        body: String(values.body).trim(),
        reporter: String(values.reporter || '').trim(),
        body_alignment: String(values.body_alignment || 'justify'),
        image_caption: String(values.image_caption || '').trim(),
        category: String(values.category),
        image_url: imageUrl,
        status: String(values.status),
        updated_at: new Date().toISOString()
      };
      const id = String(values.id || '').trim();
      button.textContent = 'সংরক্ষণ হচ্ছে…';
      const request = id
        ? client.from('news_articles').update(payload).eq('id', id)
        : client.from('news_articles').insert({ ...payload, created_by: activeUserId });
      const { error } = await request;
      if (error) throw error;
      articleForm.hidden = true;
      await loadManagedArticles();
      setStatus(editorStatus, payload.status === 'published' ? 'নিউজ সংরক্ষণ করে সাইটে প্রকাশ করা হয়েছে।' : 'নিউজের খসড়া সংরক্ষণ করা হয়েছে।', 'success');
    } catch (error) {
      console.error('Unable to save editorial article:', error);
      setStatus(editorStatus, friendlyError(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });

  byId('article-search-input')?.addEventListener('input', (event) => {
    articleSearch = event.currentTarget.value;
    void loadManagedArticles();
  });
  byId('refresh-articles-button')?.addEventListener('click', () => { void loadManagedArticles(); });
  byId('new-article-button').addEventListener('click', startNewArticle);
  byId('refresh-dashboard-button').addEventListener('click', () => {
    void loadCurrentTab();
  });
  byId('cancel-article-button').addEventListener('click', () => {
    articleForm.reset();
    articleForm.hidden = true;
    articleImagePreview.hidden = true;
    articleImageStatus.textContent = '';
  });

  async function showEditor(user) {
    if (activeUserId === user.id) return;
    activeUserId = user.id;
    loginPanel.hidden = true;
    editorPanel.hidden = false;
    setStatus(editorStatus, 'সম্পাদকীয় প্রবেশাধিকার যাচাই হচ্ছে…');
    try {
      const { data, error } = await client.from('profiles')
        .select('role,full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data || !['admin', 'editor'].includes(data.role)) {
        await client.auth.signOut();
        activeUserId = '';
        editorPanel.hidden = true;
        loginPanel.hidden = false;
        throw new Error('এই অ্যাকাউন্টে সম্পাদকীয় প্রবেশাধিকার নেই।');
      }
      activeEditorRole = data.role;
      const accountsTab = document.querySelector('[data-tab="accounts"]');
      if (accountsTab) accountsTab.hidden = activeEditorRole !== 'admin';
      profileSettingsForm.elements.namedItem('full_name').value = data.full_name || '';
      byId('editor-identity').textContent = `${data.full_name || user.email} · ${data.role === 'admin' ? 'প্রধান সম্পাদক' : 'সম্পাদক'}`;
      setStatus(editorStatus, '');
      document.querySelectorAll('[data-tab]').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === activeTab));
      submissionsList.hidden = activeTab !== 'submissions';
      dashboardPanel.hidden = activeTab !== 'overview';
      applicationsList.hidden = activeTab !== 'applications';
      accountsPanel.hidden = activeTab !== 'accounts';
      articlesList.hidden = activeTab !== 'articles';
      settingsPanel.hidden = activeTab !== 'settings';
      await loadCurrentTab();
      if (['invite', 'recovery'].includes(authCallbackType)) passwordForm.hidden = false;
    } catch (error) {
      console.error('Unable to verify editorial access:', error);
      setStatus(loginStatus, friendlyError(error), 'error');
    }
  }

  function showLogin() {
    activeUserId = '';
    editorPanel.hidden = true;
    loginPanel.hidden = false;
    passwordForm.hidden = true;
  }

  document.querySelectorAll('[data-application-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      applicationFilter = button.dataset.applicationFilter;
      renderApplicationRows();
    });
  });
  byId('refresh-applications-button').addEventListener('click', () => {
    void loadCurrentTab();
  });

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTab = button.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach((tab) => tab.classList.toggle('is-active', tab === button));
      submissionsList.hidden = activeTab !== 'submissions';
      dashboardPanel.hidden = activeTab !== 'overview';
      applicationsList.hidden = activeTab !== 'applications';
      accountsPanel.hidden = activeTab !== 'accounts';
      articlesList.hidden = activeTab !== 'articles';
      settingsPanel.hidden = activeTab !== 'settings';
      void loadCurrentTab();
    });
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = byId('login-button');
    button.disabled = true;
    setStatus(loginStatus, 'লগইন হচ্ছে…');
    try {
      const values = Object.fromEntries(new FormData(loginForm).entries());
      const { data, error } = await client.auth.signInWithPassword({
        email: String(values.email).trim(),
        password: String(values.password)
      });
      if (error) throw error;
      await showEditor(data.user);
    } catch (error) {
      console.error('Editorial sign-in failed:', error);
      setStatus(loginStatus, friendlyError(error), 'error');
    } finally {
      button.disabled = false;
    }
  });

  byId('reset-button').addEventListener('click', async () => {
    const email = loginForm.elements.namedItem('email').value.trim();
    if (!email) {
      setStatus(loginStatus, 'রিসেট লিংক পেতে আগে ইমেইল লিখুন।', 'error');
      return;
    }
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/editor/`
      });
      if (error) throw error;
      setStatus(loginStatus, 'পাসওয়ার্ড সেট/পরিবর্তনের লিংক ইমেইলে পাঠানো হয়েছে।', 'success');
    } catch (error) {
      console.error('Editorial password reset failed:', error);
      setStatus(loginStatus, friendlyError(error), 'error');
    }
  });

  byId('password-button').addEventListener('click', () => {
    passwordForm.hidden = !passwordForm.hidden;
    if (!passwordForm.hidden) passwordForm.elements.namedItem('password').focus();
  });

  byId('cancel-password-button').addEventListener('click', () => {
    passwordForm.reset();
    passwordForm.hidden = true;
  });

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(passwordForm).entries());
    if (values.password !== values.password_confirm) {
      setStatus(editorStatus, 'দুই ঘরে একই পাসওয়ার্ড লিখুন।', 'error');
      return;
    }
    if (String(values.password).length < 8) {
      setStatus(editorStatus, 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।', 'error');
      return;
    }
    const button = passwordForm.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'সংরক্ষণ হচ্ছে…';
    try {
      const { error } = await client.auth.updateUser({ password: String(values.password) });
      if (error) throw error;
      passwordForm.reset();
      passwordForm.hidden = true;
      setStatus(editorStatus, 'নতুন পাসওয়ার্ড নিরাপদে সংরক্ষণ হয়েছে।', 'success');
    } catch (error) {
      console.error('Unable to set editorial password:', error);
      setStatus(editorStatus, friendlyError(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'পাসওয়ার্ড সংরক্ষণ করুন';
    }
  });

  byId('logout-button').addEventListener('click', async () => {
    const { error } = await client.auth.signOut();
    if (error) {
      console.error('Editorial sign-out failed:', error);
      setStatus(editorStatus, friendlyError(error), 'error');
      return;
    }
    showLogin();
  });

  if (!client) {
    setStatus(loginStatus, 'লগইন সেবা এখন লোড করা যাচ্ছে না। পরে আবার চেষ্টা করুন।', 'error');
    return;
  }

  client.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      if (event === 'PASSWORD_RECOVERY') passwordForm.hidden = false;
      void showEditor(session.user);
    }
    else showLogin();
  });

  client.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    if (data.session?.user) void showEditor(data.session.user);
    else showLogin();
  }).catch((error) => {
    console.error('Unable to restore editorial session:', error);
    showLogin();
    setStatus(loginStatus, friendlyError(error), 'error');
  });
})();
