module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET required" });
  }
  const cronSecret = process.env.CRON_SECRET || "";
  const ingestSecret = process.env.AUTO_NEWS_SHARED_SECRET || "";
  if (!cronSecret || req.headers.authorization !== "Bearer " + cronSecret) {
    return res.status(401).json({ error: "Unauthorized cron request" });
  }
  if (!ingestSecret) return res.status(503).json({ error: "Auto-news ingestion secret is not configured" });
  const base = process.env.SUPABASE_URL || "https://tdyrxdnqyuebtzhjuprh.supabase.co";
  try {
    const response = await fetch(base.replace(/\/$/, "") + "/functions/v1/ingest-news", {
      method: "GET",
      headers: { "x-ingest-secret": ingestSecret, "Accept": "application/json" }
    });
    const body = await response.json().catch(() => ({ error: "Invalid ingestion response" }));
    return res.status(response.status).json(body);
  } catch (error) {
    return res.status(502).json({ error: "Unable to reach ingestion service" });
  }
};
