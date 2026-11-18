const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
function tag(block: string, names: string[]): string {
  for (const name of names) {
    const re = new RegExp("<(?:[\\w.-]+:)?" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?" + name + "\\s*>", "i");
    const match = block.match(re);
    if (match) return decodeXml(match[1]).replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim();
  }
  return "";
}
function itemLink(block: string): string | null {
  const atom = block.match(/<link\\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  const raw = atom?.[1] || tag(block, ["link"]);
  return safeUrl(raw);
}
function imageLink(block: string): string | null {
  const match = block.match(/<(?:media:content|media:thumbnail|enclosure)\\b[^>]*url=["']([^"']+)["']/i)
    || block.match(/<img\\b[^>]*src=["']([^"']+)["']/i);
  return safeUrl(match?.[1]);
}
function rssItems(xml: string, source: {name:string;url:string}) {
  const blocks = [...xml.matchAll(/<(item|entry)\\b[^>]*>([\\s\\S]*?)<\\/\\1>/gi)].slice(0, 15);
  const out = [];
  for (const match of blocks) {
    const block = match[2];
    const title = tag(block, ["title"]).slice(0, 500);
    const link = itemLink(block);
    if (!title || !link) continue;
    const excerpt = tag(block, ["description", "summary", "encoded", "content"]).slice(0, 1200);
    const external = tag(block, ["guid", "id"]).slice(0, 300) || link;
    out.push({
      source_name: source.name,
      source_url: link,
      external_id: external,
      title,
      excerpt: excerpt || null,
      body: null,
      image_url: imageLink(block),
      category_id: null,
      status: "pending"
    });
  }
  return out;
}
async function credentials() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  let serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const secretKeysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysJson) {
    try { serviceKey = JSON.parse(secretKeysJson).default || serviceKey; }
    catch { throw new Error("Supabase secret-key configuration is invalid"); }
  }
  if (!supabaseUrl || !serviceKey) throw new Error("Ingestion service is not configured");
  return {supabaseUrl, serviceKey};
}
async function saveQueue(rows: Record<string, unknown>[], supabaseUrl: string, serviceKey: string) {
  if (!rows.length) return 0;
  const endpoint = new URL("/rest/v1/auto_news_queue", supabaseUrl);
  endpoint.searchParams.set("on_conflict", "source_url");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {apikey:serviceKey, Authorization:"Bearer "+serviceKey, "Content-Type":"application/json",
      Prefer:"resolution=ignore-duplicates,return=representation"},
    body:JSON.stringify(rows)
  });
  if (!response.ok) throw new Error("Queue insertion failed: "+(await response.text()).slice(0,500));
  const inserted = await response.json();
  return Array.isArray(inserted) ? inserted.length : 0;
}
async function collectRss(supabaseUrl: string, serviceKey: string) {
  const settingsUrl = new URL("/rest/v1/site_settings", supabaseUrl);
  settingsUrl.searchParams.set("select", "value");
  settingsUrl.searchParams.set("key", "eq.auto_news_sources");
  const settingsResponse = await fetch(settingsUrl, {headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey}});
  if (!settingsResponse.ok) throw new Error("Unable to read RSS source settings");
  const settings = await settingsResponse.json();
  const sources = settings?.[0]?.value?.sources;
  if (!Array.isArray(sources) || !sources.length) return {sources:0, fetched:0, queued:0, message:"No RSS sources configured"};
  const rows: Record<string, unknown>[] = [];
  const failures: string[] = [];
  for (const raw of sources.slice(0,20)) {
    const name = typeof raw?.name === "string" ? raw.name.trim().slice(0,160) : "";
    const url = safeUrl(raw?.url);
    if (!name || !url) continue;
    try {
      const response = await fetch(url, {headers:{"User-Agent":"TribuneBangla-RSS/1.0","Accept":"application/rss+xml, application/atom+xml, application/xml, text/xml"}});
      if (!response.ok) throw new Error("HTTP "+response.status);
      const xml = (await response.text()).slice(0, 1_000_000);
      rows.push(...rssItems(xml,{name,url}).slice(0,15));
    } catch (error) {
      failures.push(name+": "+String(error).slice(0,120));
    }
    if (rows.length >= 50) break;
  }
  const limited = rows.slice(0,50);
  const queued = await saveQueue(limited,supabaseUrl,serviceKey);
  return {sources:sources.length,fetched:limited.length,queued,failures};
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!["GET","POST"].includes(req.method)) return reply(405, { error: "GET or POST required" });
  const expected = Deno.env.get("AUTO_NEWS_SHARED_SECRET") || "";
  const supplied = req.headers.get("x-ingest-secret") || "";
  if (!expected || !supplied || !(await sameSecret(expected, supplied))) {
    return reply(401, { error: "Unauthorized ingestion request" });
  }
  try {
    const {supabaseUrl,serviceKey}=await credentials();
    if(req.method==="GET") return reply(200, await collectRss(supabaseUrl,serviceKey));
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
        source_name: sourceName, source_url: sourceUrl,
        external_id: typeof item.external_id === "string" ? item.external_id.slice(0, 300) : null,
        title, excerpt: typeof item.excerpt === "string" ? item.excerpt.slice(0, 3000) : null,
        body: typeof item.body === "string" ? item.body.slice(0, 30000) : null,
        image_url: safeUrl(item.image_url), category_id: typeof item.category_id === "string" ? item.category_id : null,
        status: "pending"
      });
    }
    if (!rows.length) return reply(400, { error: "No valid news items supplied" });
    const queued = await saveQueue(rows,supabaseUrl,serviceKey);
    return reply(200, {received:rows.length,queued,policy:"pending_only_human_approval_required"});
  } catch (error) {
    return reply(503,{error:String(error).slice(0,1000)});
  }
});
