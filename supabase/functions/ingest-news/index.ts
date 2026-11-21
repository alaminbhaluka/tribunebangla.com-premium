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
function rawTag(block: string, names: string[]): string {
  for (const name of names) {
    const re = new RegExp("<(?:[\\w.-]+:)?" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?" + name + "\\s*>", "i");
    const match = block.match(re);
    if (match) return decodeXml(match[1]).trim();
  }
  return "";
}
function plainText(value: string): string {
  return value.replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ").trim();
}
function tag(block: string, names: string[]): string {
  return plainText(rawTag(block, names));
}
function itemLink(block: string): string | null {
  const atom = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  return safeUrl(atom?.[1] || tag(block, ["link"]));
}
function imageLink(block: string): string | null {
  const match = block.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*url=["']([^"']+)["']/i)
    || block.match(/<img\b[^>]*src=["']([^"']+)["']/i);
  return safeUrl(match?.[1]);
}
function rssItems(xml: string, source: {name:string;url:string}) {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0, 15);
  const out = [];
  for (const match of blocks) {
    const block = match[2];
    const title = tag(block, ["title"]).slice(0, 500);
    const link = itemLink(block);
    if (!title || !link) continue;
    // Only publisher-supplied full-content fields may become the article body.
    // RSS description/Atom summary is an excerpt, never a full article.
    const bodyRaw = rawTag(block, ["encoded", "content"]);
    const bodyText = plainText(bodyRaw);
    const body = bodyText.length >= 500 ? bodyRaw.slice(0, 50000) : null;
    const excerpt = (tag(block, ["description", "summary"]) || bodyText).slice(0, 280);
    const external = tag(block, ["guid", "id"]).slice(0, 300) || link;
    out.push({
      source_name: source.name, source_url: link, external_id: external,
      title, excerpt: excerpt || null, body, image_url: imageLink(block),
      category_id: null, status: "pending"
    });
  }
  return out;
}
const sensitivePattern = /(হত্যা|খুন|মৃত্যু|মরদেহ|লাশ|ধর্ষণ|যৌন\s?নির্যাতন|শিশু\s?নির্যাতন|আত্মহত্যা|গুম|অপহরণ|নিখোঁজ|দুর্ঘটনা|সড়ক\s?দুর্ঘটনা|অগ্নিকাণ্ড|আগুনে\s?পুড়ে|বিস্ফোরণ|সংঘর্ষ|সহিংসতা|হামলা|গ্রেপ্তার|আটক|মামলা|অভিযোগ|দুর্নীতি|নির্বাচন|ভোট|রাজনীতি|রাজনৈতিক|সংসদ|মন্ত্রিসভা|প্রধানমন্ত্রী|রাষ্ট্রপতি|বিএনপি|আওয়ামী\s?লীগ|জামায়াত|পুলিশ|র‍্যাব|র‌্যাব|সেনাবাহিনী|আদালত|রায়|কারাদণ্ড|যুদ্ধ|ক্ষেপণাস্ত্র|ভূমিকম্প|ঘূর্ণিঝড়|বন্যা|মহামারি|epidemic|murder|rape|killed|death|dead|suicide|missing|kidnap|accident|crash|fire|explosion|attack|arrest|court|election|vote|politic|minister|prime minister|president|police|army|war|earthquake|cyclone|flood|outbreak)/i;
function needsHumanReview(title: string, excerpt: string): string | null {
  if (!excerpt || excerpt.trim().length < 50) return "short_or_missing_rss_summary";
  if (sensitivePattern.test(title + " " + excerpt)) return "sensitive_topic";
  return null;
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
async function rest(url: URL, serviceKey: string, init: RequestInit = {}) {
  return fetch(url, { ...init, headers: {
    apikey: serviceKey, Authorization: "Bearer " + serviceKey,
    ...(init.headers || {})
  }});
}
async function validCronSecret(supplied: string, supabaseUrl: string, serviceKey: string): Promise<boolean> {
  if (!supplied) return false;
  const expected = Deno.env.get("AUTO_NEWS_SHARED_SECRET") || "";
  if (expected && await sameSecret(expected, supplied)) return true;
  const settingsUrl = new URL("/rest/v1/site_settings", supabaseUrl);
  settingsUrl.searchParams.set("select", "value");
  settingsUrl.searchParams.set("key", "eq.auto_news_secret_hash");
  const response = await rest(settingsUrl, serviceKey);
  if (!response.ok) return false;
  const rows = await response.json();
  const stored = rows?.[0]?.value?.sha256;
  if (typeof stored !== "string" || !/^[a-f0-9]{64}$/i.test(stored)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(supplied));
  const actual = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= actual.charCodeAt(i) ^ stored.toLowerCase().charCodeAt(i);
  return diff === 0;
}
async function collectRss(supabaseUrl: string, serviceKey: string) {
  const settingsUrl = new URL("/rest/v1/site_settings", supabaseUrl);
  settingsUrl.searchParams.set("select", "value");
  settingsUrl.searchParams.set("key", "eq.auto_news_sources");
  const settingsResponse = await rest(settingsUrl, serviceKey);
  if (!settingsResponse.ok) throw new Error("Unable to read RSS source settings");
  const settings = await settingsResponse.json();
  const sources = settings?.[0]?.value?.sources;
  if (!Array.isArray(sources) || !sources.length)
    return {sources:0, fetched:0, queued:0, published:0, heldForReview:0, message:"No RSS sources configured"};

  const rows: Record<string, unknown>[] = [];
  const failures: string[] = [];
  for (const raw of sources.slice(0,20)) {
    const name = typeof raw?.name === "string" ? raw.name.trim().slice(0,160) : "";
    const url = safeUrl(raw?.url);
    if (!name || !url) continue;
    try {
      const response = await fetch(url, {
        headers: {"User-Agent":"TribuneBangla-RSS/1.0", "Accept":"application/rss+xml, application/atom+xml, application/xml, text/xml"},
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const xml = (await response.text()).slice(0, 1_000_000);
      rows.push(...rssItems(xml,{name,url}).slice(0,15));
    } catch (error) {
      failures.push(name + ": " + String(error).slice(0,120));
    }
    if (rows.length >= 50) break;
  }
  const limited = rows.slice(0,50);
  if (!limited.length) return {sources:sources.length, fetched:0, queued:0, published:0, heldForReview:0, failures};

  const insertUrl = new URL("/rest/v1/auto_news_queue", supabaseUrl);
  insertUrl.searchParams.set("on_conflict", "source_url");
  const insertResponse = await rest(insertUrl, serviceKey, {
    method:"POST",
    headers:{"Content-Type":"application/json", Prefer:"resolution=ignore-duplicates,return=minimal"},
    body:JSON.stringify(limited)
  });
  if (!insertResponse.ok) throw new Error("Queue insertion failed: " + (await insertResponse.text()).slice(0,500));

  // Enrich already-queued pending headlines when a later feed refresh exposes
  // the publisher's full RSS body. Never overwrite an editor's existing body.
  for (const item of limited) {
    if (typeof item.body !== "string" || !item.body.trim()) continue;
    const enrichUrl = new URL("/rest/v1/auto_news_queue", supabaseUrl);
    enrichUrl.searchParams.set("source_url", "eq." + String(item.source_url));
    enrichUrl.searchParams.set("status", "eq.pending");
    enrichUrl.searchParams.set("body", "is.null");
    const enrichResponse = await rest(enrichUrl, serviceKey, {
      method: "PATCH",
      headers: {"Content-Type":"application/json", Prefer:"return=minimal"},
      body: JSON.stringify({body:item.body, excerpt:item.excerpt, image_url:item.image_url})
    });
    if (!enrichResponse.ok) throw new Error("Unable to enrich queued RSS body: " + (await enrichResponse.text()).slice(0,300));
  }

  const uniqueUrls = [...new Set(limited.map(x => String(x.source_url)))];
  const queueUrl = new URL("/rest/v1/auto_news_queue", supabaseUrl);
  queueUrl.searchParams.set("select", "id,title,excerpt,source_url,status");
  queueUrl.searchParams.set("status", "eq.pending");
  queueUrl.searchParams.set("source_url", "in.(" + uniqueUrls.join(",") + ")");
  const queueResponse = await rest(queueUrl, serviceKey);
  if (!queueResponse.ok) throw new Error("Unable to load pending RSS items: " + (await queueResponse.text()).slice(0,300));
  const pending = await queueResponse.json();

  let heldForReview = 0;
  const reasons: Record<string,number> = {};
  for (const item of (Array.isArray(pending) ? pending : [])) {
    const reason = needsHumanReview(String(item.title || ""), String(item.excerpt || ""));
    if (reason) { heldForReview++; reasons[reason] = (reasons[reason] || 0) + 1; }
  }
  return {sources:sources.length, fetched:limited.length, queued:limited.length, published:0, heldForReview, reviewReasons:reasons, failures, policy:"all RSS items remain pending until an authorized editor approves them"};
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!["GET","POST"].includes(req.method)) return reply(405, {error:"GET or POST required"});
  try {
    const {supabaseUrl,serviceKey}=await credentials();
    const supplied = req.headers.get("x-ingest-secret") || "";
    const cronAuthorized = await validCronSecret(supplied, supabaseUrl, serviceKey);
    let adminAuthorized = false;
    if (!cronAuthorized) {
      const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (token) {
        const userResponse = await fetch(new URL("/auth/v1/user", supabaseUrl), {
          headers: { apikey: serviceKey, Authorization: "Bearer " + token }
        });
        if (userResponse.ok) {
          const authUser = await userResponse.json();
          const role = authUser?.app_metadata?.role;
          adminAuthorized = ["super_admin","admin","editor","auto_news_admin"].includes(role);
        }
      }
    }
    if (!cronAuthorized && !adminAuthorized) return reply(401,{error:"Unauthorized ingestion request"});
    if (req.method === "GET") {
      if (!cronAuthorized) return reply(403,{error:"Use the admin Run Now action"});
      return reply(200, await collectRss(supabaseUrl,serviceKey));
    }
    let payload: unknown;
    try { payload = await req.json(); } catch { return reply(400,{error:"Invalid JSON"}); }
    if ((payload as {action?:string})?.action === "collect") {
      return reply(200, await collectRss(supabaseUrl,serviceKey));
    }
    if (!cronAuthorized) return reply(403,{error:"Manual item ingestion requires cron authorization"});
    const items = (payload as {items?:unknown})?.items;
    if (!Array.isArray(items) || items.length < 1 || items.length > 50)
      return reply(400,{error:"Provide between 1 and 50 items"});
    const rows = [];
    for (const raw of items) {
      const item = raw as Record<string,unknown>;
      const title = typeof item.title === "string" ? item.title.trim().slice(0,500) : "";
      const sourceName = typeof item.source_name === "string" ? item.source_name.trim().slice(0,160) : "";
      const sourceUrl = safeUrl(item.source_url);
      if (!title || !sourceName || !sourceUrl) continue;
      rows.push({
        source_name:sourceName, source_url:sourceUrl,
        external_id:typeof item.external_id === "string" ? item.external_id.slice(0,300) : null,
        title, excerpt:typeof item.excerpt === "string" ? item.excerpt.slice(0,280) : null,
        body:null, image_url:safeUrl(item.image_url), category_id:null, status:"pending"
      });
    }
    if (!rows.length) return reply(400,{error:"No valid news items supplied"});
    const queued = await saveManualQueue(rows,supabaseUrl,serviceKey);
    return reply(200,{received:rows.length,queued,policy:"rss_headline_and_short_excerpt_only; sensitive_topics_require_human_review"});
  } catch (error) { return reply(503,{error:String(error).slice(0,1000)}); }
});
async function saveManualQueue(rows: Record<string,unknown>[], supabaseUrl: string, serviceKey: string) {
  const endpoint = new URL("/rest/v1/auto_news_queue", supabaseUrl);
  endpoint.searchParams.set("on_conflict","source_url");
  const response = await rest(endpoint,serviceKey,{
    method:"POST",headers:{"Content-Type":"application/json",Prefer:"resolution=ignore-duplicates,return=representation"},
    body:JSON.stringify(rows)
  });
  if (!response.ok) throw new Error("Queue insertion failed: " + (await response.text()).slice(0,500));
  const inserted = await response.json();
  return Array.isArray(inserted) ? inserted.length : 0;
}
