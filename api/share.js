const fallbackUrl = "https://tdyrxdnqyuebtzhjuprh.supabase.co";
const fallbackKey = "sb_publishable___JNcLdKcXvRSSdP6ZoA7A_mVDD2phD";
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const siteOrigin = () => {
  const candidate = process.env.PUBLIC_SITE_URL || (process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://preview.tribunebangla.com");
  try {
    const parsed = new URL(candidate);
    const allowed = new Set(["tribunebangla.com", "www.tribunebangla.com", "preview.tribunebangla.com"]);
    const vercelPreview = /^[a-z0-9.-]+\.vercel\.app$/i.test(parsed.hostname);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || (!allowed.has(parsed.hostname) && !vercelPreview)) return "https://preview.tribunebangla.com";
    return parsed.origin;
  } catch (_) {
    return "https://preview.tribunebangla.com";
  }
};
const safeImageUrl = (value, origin) => {
  if (!value) return origin + "/assets/tribune-mark.svg";
  try {
    const parsed = new URL(value, origin);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : origin + "/assets/tribune-mark.svg";
  } catch (_) {
    return origin + "/assets/tribune-mark.svg";
  }
};
module.exports = async function handler(req,res) {
  const slug = String(req.query?.slug || "").trim();
  const origin = siteOrigin();
  const url = process.env.SUPABASE_URL || fallbackUrl;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || fallbackKey;
  let article = null;
  if (slug && /^[\p{L}\p{N}-]+$/u.test(slug)) {
    try {
      const endpoint = new URL("/rest/v1/news", url);
      endpoint.searchParams.set("select","title,slug,excerpt,featured_image,seo_title,seo_description,published_at,categories(name)");
      endpoint.searchParams.set("slug","eq."+slug);
      endpoint.searchParams.set("status","eq.published");
      endpoint.searchParams.set("published_at","lte."+new Date().toISOString());
      endpoint.searchParams.set("limit","1");
      const response = await fetch(endpoint, {headers:{apikey:key,Authorization:"Bearer "+key}});
      if(response.ok){const rows=await response.json();article=rows[0]||null;}
    } catch (_) { article=null; }
  }
  const title = article?.seo_title || article?.title || "ট্রিবিউন বাংলা | সত্য ও ন্যায়ের পক্ষে";
  const description = article?.seo_description || article?.excerpt || "সত্য ও ন্যায়ের পক্ষে, মানুষের কথা তুলে ধরাই আমাদের অঙ্গীকার।";
  const canonical = origin + (article ? "/post/"+encodeURIComponent(article.slug) : "/");
  const image = safeImageUrl(article?.featured_image, origin);
  const html = `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#151b23"><title>${esc(title)} | ট্রিবিউন বাংলা</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}"><meta property="og:site_name" content="ট্রিবিউন বাংলা"><meta property="og:type" content="article"><meta property="og:url" content="${esc(canonical)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(image)}"><link rel="icon" href="/assets/tribune-mark.svg"><link rel="stylesheet" href="/styles.css"><script src="/config.js"></script><script type="module" src="/app.js"></script></head><body><div class="utility"><div class="container"><span>সত্য ও ন্যায়ের পক্ষে</span><span>বাংলাদেশ</span></div></div><header class="container masthead"><a class="brand" href="/"><img src="/assets/tribune-mark.svg" alt=""><img class="wordmark" src="/assets/tribune-wordmark.svg" alt="ট্রিবিউন বাংলা"></a><div class="actions"><a href="/search">অনুসন্ধান</a><a class="login" id="account-link" href="/login">লগইন</a></div></header><nav class="nav" aria-label="প্রধান নেভিগেশন"><div class="container"><a href="/">প্রচ্ছদ</a><a href="/category/national">জাতীয়</a><a href="/category/politics">রাজনীতি</a><a href="/category/international">আন্তর্জাতিক</a><a href="/category/country">সারাদেশ</a><a href="/category/economy">অর্থনীতি</a><a href="/category/sports">খেলাধুলা</a><a href="/category/entertainment">বিনোদন</a><a href="/category/education">শিক্ষা</a><a href="/video">ভিডিও</a></div></nav><div class="container ticker"><b>ব্রেকিং</b><span>সর্বশেষ সংবাদ ও গুরুত্বপূর্ণ আপডেট — ট্রিবিউন বাংলা</span></div><main id="app" class="container" tabindex="-1"><article class="article"><h1>${esc(title)}</h1><p>${esc(description)}</p>${article?.featured_image ? `<img class="article-image" src="${esc(image)}" alt="${esc(title)}">` : ""}</article></main><footer><div class="container footer"><div><a class="brand" href="/"><img src="/assets/tribune-mark.svg" alt=""><img class="wordmark" src="/assets/tribune-wordmark.svg" alt="ট্রিবিউন বাংলা"></a><p>সত্য ও ন্যায়ের পক্ষে, মানুষের কথা তুলে ধরাই আমাদের অঙ্গীকার।</p></div></div><div class="container copyright">© Tribune Bangla. সর্বস্বত্ব সংরক্ষিত।</div></footer></body></html>`;
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.setHeader("Cache-Control","public, s-maxage=60, stale-while-revalidate=300");
  if(!article)res.statusCode=404;
  res.end(html);
}
