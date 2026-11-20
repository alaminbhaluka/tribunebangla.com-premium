const FALLBACK_URL = "https://tdyrxdnqyuebtzhjuprh.supabase.co";
const FALLBACK_KEY = "sb_publishable___JNcLdKcXvRSSdP6ZoA7A_mVDD2phD";
const esc = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
function siteOrigin() {
  const candidate = process.env.PUBLIC_SITE_URL || (process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://preview.tribunebangla.com");
  try {
    const parsed = new URL(candidate);
    const allowed = new Set(["tribunebangla.com", "www.tribunebangla.com", "preview.tribunebangla.com"]);
    const vercelPreview = /^[a-z0-9.-]+\\.vercel\\.app$/i.test(parsed.hostname);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || (!allowed.has(parsed.hostname) && !vercelPreview)) return "https://preview.tribunebangla.com";
    return parsed.origin;
  } catch (_) {
    return "https://preview.tribunebangla.com";
  }
}
const staticPaths = [
  "/", "/category/national", "/category/politics", "/category/international",
  "/category/country", "/category/economy", "/category/sports",
  "/category/entertainment", "/category/education", "/category/health",
  "/category/technology", "/category/opinion", "/video", "/epaper",
  "/about", "/contact", "/privacy"
];
module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }
  const origin = siteOrigin();
  const urls = staticPaths.map(path => ({loc: origin + path}));
  const supabaseUrl = process.env.SUPABASE_URL || FALLBACK_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || FALLBACK_KEY;
  const now = new Date().toISOString();
  try {
    const endpoint = new URL("/rest/v1/news", supabaseUrl);
    endpoint.searchParams.set("select", "slug,updated_at,published_at");
    endpoint.searchParams.set("status", "eq.published");
    endpoint.searchParams.set("published_at", "lte." + now);
    endpoint.searchParams.set("order", "published_at.desc");
    endpoint.searchParams.set("limit", "1000");
    for (let offset = 0; offset < 50000; offset += 1000) {
      const response = await fetch(endpoint, {
        headers: { apikey: publishableKey, Authorization: "Bearer " + publishableKey, Range: offset + "-" + (offset + 999) }
      });
      if (!response.ok) throw new Error("Published news query failed");
      const rows = await response.json();
      for (const row of rows) {
        if (!row.slug || !/^[\\p{L}\\p{N}-]+$/u.test(row.slug)) continue;
        const item = {loc: origin + "/post/" + encodeURIComponent(row.slug)};
        const modified = row.updated_at || row.published_at;
        if (modified && Number.isFinite(Date.parse(modified))) item.lastmod = new Date(modified).toISOString();
        urls.push(item);
      }
      if (rows.length < 1000) break;
    }
  } catch (_) {
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return res.status(503).json({error: "Sitemap temporarily unavailable"});
  }
  const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls.map(item => '<url><loc>' + esc(item.loc) + '</loc>' + (item.lastmod ? '<lastmod>' + esc(item.lastmod) + '</lastmod>' : '') + '</url>').join("") +
    '</urlset>';
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
  if (req.method === "HEAD") return res.status(200).end();
  return res.status(200).send(xml);
};
