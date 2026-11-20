module.exports = function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }
  const candidate = process.env.PUBLIC_SITE_URL || (process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://preview.tribunebangla.com");
  let origin = "https://preview.tribunebangla.com";
  try {
    const parsed = new URL(candidate);
    const allowed = new Set(["tribunebangla.com", "www.tribunebangla.com", "preview.tribunebangla.com"]);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password && (allowed.has(parsed.hostname) || /^[a-z0-9.-]+\\.vercel\\.app$/i.test(parsed.hostname))) origin = parsed.origin;
  } catch (_) {}
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /account",
    "Disallow: /reporter/dashboard",
    "Disallow: /login",
    "Disallow: /register",
    "Disallow: /search",
    "Sitemap: " + origin + "/sitemap.xml",
    ""
  ].join("\n");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  if (req.method === "HEAD") return res.status(200).end();
  return res.status(200).send(body);
};
