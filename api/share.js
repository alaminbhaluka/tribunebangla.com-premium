const SITE = 'https://tribunebangla.com';
const SUPABASE_URL = 'https://rvffsavdvetdmhnwgivz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_K4ir8_k1DY9EOhoC-wUT8A_8r01CJxu';
const FALLBACK_IMAGE = SITE + '/uploads/20261026_214141_0000.jpg';

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function plainText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ').trim();
}

function absoluteUrl(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return FALLBACK_IMAGE;
  try {
    const parsed = new URL(candidate, SITE);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : FALLBACK_IMAGE;
  } catch (_) {
    return FALLBACK_IMAGE;
  }
}

async function findDatabaseArticle(id) {
  const endpoint = new URL(SUPABASE_URL + '/rest/v1/news_articles');
  endpoint.searchParams.set('select', 'id,title,summary,body,image_url,category,status,reporter,created_at');
  endpoint.searchParams.set('id', 'eq.' + id);
  endpoint.searchParams.set('status', 'eq.published');
  endpoint.searchParams.set('limit', '1');
  const response = await fetch(endpoint, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error('Published article lookup failed: ' + response.status);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function findStaticArticle(id) {
  const response = await fetch(SITE + '/articles.json', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('Static article feed unavailable: ' + response.status);
  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : payload && payload.articles;
  if (!Array.isArray(rows)) return null;
  return rows.find((item) => String(item.id) === String(id)) || null;
}

module.exports = async function handler(req, res) {
  const id = String((req.query && req.query.id) || '');
  if (!/^\d{1,20}$/.test(id)) {
    res.status(400).setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Invalid article ID');
  }

  let record = null;
  try {
    record = await findStaticArticle(id);
  } catch (error) {
    console.error('Share preview static lookup:', error.message);
  }

  if (record && record.status === 'draft') record = null;
  else if (!record) {
    try {
      record = await findDatabaseArticle(id);
    } catch (error) {
      console.error('Share preview database lookup:', error.message);
    }
  }

  if (!record || !record.title) {
    res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<!doctype html><html lang="bn"><meta charset="utf-8"><title>সংবাদ পাওয়া যায়নি | ট্রিবিউন বাংলা</title><meta name="robots" content="noindex"><body>সংবাদটি পাওয়া যায়নি।</body></html>');
  }

  const title = plainText(record.title);
  const description = (plainText(record.summary) || plainText(record.body) || 'সত্য ও ন্যায়ের পক্ষে, মানুষের কথা তুলে ধরাই আমাদের অঙ্গীকার।').slice(0, 280);
  const image = absoluteUrl(record.image_url || record.image);
  const url = SITE + '/post/' + encodeURIComponent(id) + '/';
  const published = record.created_at || record.publishedAt || '';
  const publishedMeta = published && !Number.isNaN(Date.parse(published))
    ? '<meta property="article:published_time" content="' + escapeHtml(new Date(published).toISOString()) + '">'
    : '';

  const html = '<!doctype html><html lang="bn"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + escapeHtml(title) + ' | ট্রিবিউন বাংলা</title>' +
    '<meta name="description" content="' + escapeHtml(description) + '">' +
    '<link rel="canonical" href="' + escapeHtml(url) + '">' +
    '<meta name="robots" content="index,follow,max-image-preview:large">' +
    '<meta property="og:type" content="article">' +
    '<meta property="og:site_name" content="ট্রিবিউন বাংলা">' +
    '<meta property="og:locale" content="bn_BD">' +
    '<meta property="og:url" content="' + escapeHtml(url) + '">' +
    '<meta property="og:title" content="' + escapeHtml(title) + '">' +
    '<meta property="og:description" content="' + escapeHtml(description) + '">' +
    '<meta property="og:image" content="' + escapeHtml(image) + '">' +
    '<meta property="og:image:secure_url" content="' + escapeHtml(image) + '">' +
    '<meta property="og:image:alt" content="' + escapeHtml(title) + '">' +
    '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' +
    publishedMeta +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + escapeHtml(title) + '">' +
    '<meta name="twitter:description" content="' + escapeHtml(description) + '">' +
    '<meta name="twitter:image" content="' + escapeHtml(image) + '">' +
    '</head><body><main><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(description) + '</p>' +
    '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(title) + '">' +
    '<p><a href="' + escapeHtml(url) + '">ট্রিবিউন বাংলায় সম্পূর্ণ সংবাদ পড়ুন</a></p></main></body></html>';

  res.status(200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.setHeader('Vary', 'User-Agent');
  return res.end(html);
};
