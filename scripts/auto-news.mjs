import fs from 'node:fs';

const FEEDS = [
  { domain: 'jagonews24.com', path: '/rss/rss.xml', category: 'সারাদেশ' },
  { domain: 'bd-pratidin.com', path: '/rss.xml', category: 'জাতীয়' },
  { domain: 'kalerkantho.com', path: '/rss.xml', category: 'আন্তর্জাতিক' },
  { domain: 'jugantor.com', path: '/feed/rss.xml', category: 'খেলাধুলা' },
  { domain: 'banglatribune.com', path: '/feed', category: 'রাজনীতি' },
  { domain: 'prothomalo.com', path: '/feed', category: 'জাতীয়' },
  { domain: 'samakal.com', path: '/feed', category: 'অর্থনীতি' },
  { domain: 'ittefaq.com.bd', path: '/feed', category: 'বিনোদন' }
];

const MAX_PER_RUN = 12;
const MAX_SUMMARY_LENGTH = 320;
const RETENTION_MS = 24 * 60 * 60 * 1000;

function extractTag(xml, tag) {
  const pattern = '<' + tag + '[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</' + tag + '>';
  return xml.match(new RegExp(pattern, 'i'))?.[1]?.trim() || '';
}

function cleanText(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function formatNewsBody(value) {
  // Preserve paragraph boundaries from RSS HTML before removing markup.
  const withBreaks = String(value || '')
    .replace(/<\/(?:p|div|section|article|h[1-6]|li|blockquote)>\s*/gi, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const lines = withBreaks.split(/\n+/)
    .map(line => cleanText(line))
    .filter(Boolean);

  // RSS feeds often provide one giant paragraph. Break it into readable
  // groups of roughly 3 sentences, while keeping short paragraphs intact.
  const paragraphs = [];
  for (const line of lines) {
    const sentences = line.match(/[^।.!?]+[।.!?]+|[^।.!?]+$/g) || [line];
    let chunk = '';
    let count = 0;
    for (const sentence of sentences) {
      const part = sentence.trim();
      if (!part) continue;
      chunk = chunk ? chunk + ' ' + part : part;
      count++;
      if (count >= 3 || chunk.length >= 420) {
        paragraphs.push(chunk);
        chunk = '';
        count = 0;
      }
    }
    if (chunk) paragraphs.push(chunk);
  }
  return paragraphs.join('\n\n');
}

function normalizeTitle(value) {
  return cleanText(value).toLocaleLowerCase('bn').replace(/[\s।,;:!?'"“”‘’()-]+/g, '');
}

function safeArticleUrl(value, domain) {
  try {
    const url = new URL(cleanText(value));
    return url.protocol === 'https:' && (url.hostname === domain || url.hostname.endsWith('.' + domain)) ? url.href : '';
  } catch {
    return '';
  }
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function tagAttribute(tag, attribute) {
  return tag.match(new RegExp(attribute + "\\s*=\\s*([\"'])([^\"']+)\\1", "i"))?.[2] || "";
}

function resolveImageUrl(value, baseUrl) {
  const candidate = decodeEntities(value).trim();
  if (!candidate || /^(data:|javascript:)/i.test(candidate)) return '';
  try {
    const imageUrl = new URL(candidate, baseUrl);
    return ['https:', 'http:'].includes(imageUrl.protocol) ? imageUrl.href : '';
  } catch {
    return '';
  }
}

function imageFromMarkup(markup, baseUrl) {
  const text = decodeEntities(String(markup || ''));
  const candidates = [];
  const tags = text.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const type = tagAttribute(tag, 'type');
    const url = tagAttribute(tag, 'url');
    if (url && (!type || type.toLowerCase().startsWith('image/'))) candidates.push(url);
  }
  const imageTags = text.match(/<img\b[^>]*>/gi) || [];
  for (const tag of imageTags) {
    candidates.push(tagAttribute(tag, 'src'), tagAttribute(tag, 'data-src'));
    const srcset = tagAttribute(tag, 'srcset');
    if (srcset) candidates.push(srcset.split(',')[0].trim().split(/\s+/)[0]);
  }
  for (const tag of text.match(/<(?:itunes:image|image)\b[^>]*>/gi) || []) {
    candidates.push(tagAttribute(tag, 'href'), tagAttribute(tag, 'url'));
  }
  for (const tag of text.match(/<meta\b[^>]*>/gi) || []) {
    const key = (tagAttribute(tag, 'property') || tagAttribute(tag, 'name')).toLowerCase();
    if (['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'].includes(key)) {
      candidates.push(tagAttribute(tag, 'content'));
    }
  }
  for (const candidate of candidates) {
    const image = resolveImageUrl(candidate, baseUrl);
    if (image) return image;
  }
  return '';
}

async function fetchPageImage(articleUrl) {
  try {
    const response = await fetch(articleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TribuneBanglaNewsBot/1.0; +https://tribunebangla.com)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return '';
    const html = (await response.text()).slice(0, 1500000);
    return imageFromMarkup(html, articleUrl);
  } catch {
    return '';
  }
}

async function findArticleImage(item, description, articleUrl) {
  return imageFromMarkup(item + ' ' + description, articleUrl) || await fetchPageImage(articleUrl);
}

async function runAutoNews() {
  const filePath = './articles.json';
  let db = { version: 1, articles: [] };
  if (fs.existsSync(filePath)) {
    db = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(db.articles)) db.articles = [];
  }

  const cutoff = Date.now() - RETENTION_MS;
  const beforeRetention = db.articles.length;
  db.articles = db.articles.filter(article => {
    const publishedAt = Date.parse(article?.publishedAt || '');
    // Preserve records with missing/invalid dates rather than deleting uncertain data.
    return !Number.isFinite(publishedAt) || publishedAt >= cutoff;
  });
  const removedCount = beforeRetention - db.articles.length;

  const existingUrls = new Set(db.articles.map(article => article.sourceUrl).filter(Boolean));
  const existingTitles = new Set(db.articles.map(article => normalizeTitle(article.title)).filter(Boolean));
  const numericIds = db.articles.map(article => Number(article.id)).filter(Number.isSafeInteger);
  let nextId = Math.max(10000, ...numericIds) + 1;
  let addedCount = 0;
  let imageBackfillCount = 0;

  // Add source images to recent auto-posts that were previously published without one.
  for (const article of db.articles.slice(0, 24)) {
    if (article.image || !article.sourceUrl || !FEEDS.some(feed => feed.domain === article.source)) continue;
    const validUrl = safeArticleUrl(article.sourceUrl, article.source);
    if (!validUrl) continue;
    const image = await fetchPageImage(validUrl);
    if (image) {
      article.image = image;
      imageBackfillCount++;
    }
  }

  for (const feed of FEEDS) {
    if (addedCount >= MAX_PER_RUN) break;
    try {
      const response = await fetch('https://www.' + feed.domain + feed.path, {
        headers: { 'User-Agent': 'TribuneBanglaNewsBot/1.0 (+https://tribunebangla.com)' },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) continue;
      const xml = await response.text();
      const items = xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];

      for (const item of items) {
        if (addedCount >= MAX_PER_RUN) break;
        const title = cleanText(extractTag(item, 'title'));
        const url = safeArticleUrl(extractTag(item, 'link'), feed.domain);
        const description = cleanText(extractTag(item, 'content:encoded') || extractTag(item, 'description') || extractTag(item, 'summary'));
        if (!title || !url || !description || description.length < 500 || !/[\u0980-\u09FF]/.test(title)) continue;

        const normalized = normalizeTitle(title);
        if (existingUrls.has(url) || existingTitles.has(normalized)) continue;

        const image = await findArticleImage(item, description, url);
        // Do not publish image-less or very short teaser-only feed entries.
        if (!image) continue;

        const summary = description.length > MAX_SUMMARY_LENGTH
          ? description.slice(0, MAX_SUMMARY_LENGTH - 1).replace(/\s+\S*$/, '') + '…'
          : description;
        if (summary.length < 45) continue;

        // Keep the complete text supplied by the RSS feed; only the summary is shortened.
        const body = formatNewsBody(extractTag(item, 'content:encoded') || extractTag(item, 'description') || extractTag(item, 'summary'));
        db.articles.unshift({
          id: String(nextId++),
          title,
          summary,
          body,
          image,
          category: feed.category,
          status: 'published',
          contentStatus: 'rss_content',
          source: feed.domain,
          sourceUrl: url,
          publishedAt: new Date().toISOString()
        });
        existingUrls.add(url);
        existingTitles.add(normalized);
        addedCount++;
      }
    } catch (error) {
      console.warn('Feed unavailable:', feed.domain, error?.message || error);
    }
  }

  console.log('Auto-news items added:', addedCount, 'of', MAX_PER_RUN, '| images added to new posts:', db.articles.filter(article => article.publishedAt && Date.now() - Date.parse(article.publishedAt) < 60000 && article.image).length, '| older posts backfilled with images:', imageBackfillCount, '| generated images: 0 (RSS source images only)', '| older than 24h removed:', removedCount);
  if (addedCount > 0 || removedCount > 0) {
    db.articles = db.articles.slice(0, 300);
    fs.writeFileSync(filePath, JSON.stringify(db, null, 2), 'utf8');
  }
}

runAutoNews().catch(error => {
  console.error('Auto-news run failed:', error);
  process.exitCode = 1;
});
