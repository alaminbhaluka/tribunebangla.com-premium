import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: cors });

async function sameSecret(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b))
  ]);
  const x = new Uint8Array(left), y = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch { return null; }
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "POST required" });

  const expected = Deno.env.get("AUTO_NEWS_SHARED_SECRET") || "";
  const supplied = req.headers.get("x-ingest-secret") || "";
  if (!expected || !supplied || !(await sameSecret(expected, supplied))) {
    return reply(401, { error: "Unauthorized ingestion request" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return reply(503, { error: "Ingestion service is not configured" });

  let payload: unknown;
  try { payload = await req.json(); } catch { return reply(400, { error: "Invalid JSON" }); }
  const items = (payload as { items?: unknown })?.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    return reply(400, { error: "Provide between 1 and 50 items" });
  }

  const rows = [];
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === "string" ? item.title.trim().slice(0, 500) : "";
    const sourceName = typeof item.source_name === "string" ? item.source_name.trim().slice(0, 160) : "";
    const sourceUrl = safeUrl(item.source_url);
    if (!title || !sourceName || !sourceUrl) continue;
    rows.push({
      source_name: sourceName,
      source_url: sourceUrl,
      external_id: typeof item.external_id === "string" ? item.external_id.slice(0, 300) : null,
      title,
      excerpt: typeof item.excerpt === "string" ? item.excerpt.slice(0, 3000) : null,
      body: typeof item.body === "string" ? item.body.slice(0, 30000) : null,
      image_url: safeUrl(item.image_url),
      category_id: typeof item.category_id === "string" ? item.category_id : null,
      status: "pending"
    });
  }
  if (!rows.length) return reply(400, { error: "No valid news items supplied" });

  const endpoint = new URL("/rest/v1/auto_news_queue", supabaseUrl);
  endpoint.searchParams.set("on_conflict", "source_url");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation"
    },
    body: JSON.stringify(rows)
  });
  if (!response.ok) {
    const detail = await response.text();
    return reply(502, { error: "Queue insertion failed", detail: detail.slice(0, 1000) });
  }
  const inserted = await response.json();
  return reply(200, {
    received: rows.length,
    queued: Array.isArray(inserted) ? inserted.length : 0,
    policy: "pending_only_human_approval_required"
  });
});
