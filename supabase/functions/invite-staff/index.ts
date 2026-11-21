import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const allowedOrigins = new Set([
  "https://preview.tribunebangla.com",
  "https://tribunebangla.com",
  "https://www.tribunebangla.com"
]);
const allowedRoles = new Set(["admin", "editor", "reporter_admin", "auto_news_admin", "reporter"]);
const responseHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json; charset=utf-8"
});
const json = (status: number, body: Record<string, unknown>, origin: string) =>
  new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });

function credentials() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try { key = JSON.parse(secretKeys).default || key; }
    catch { throw new Error("Supabase secret-key configuration is invalid"); }
  }
  if (!url || !key) throw new Error("Invitation service is not configured");
  return { url, key };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  if (!allowedOrigins.has(origin)) return new Response("Origin not allowed", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders(origin) });
  if (req.method !== "POST") return json(405, { error: "POST required" }, origin);

  try {
    const authorization = req.headers.get("authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token || token === authorization) return json(401, { error: "Authentication required" }, origin);

    const { url, key } = credentials();
    const authResponse = await fetch(new URL("/auth/v1/user", url), {
      headers: { apikey: key, Authorization: "Bearer " + token }
    });
    if (!authResponse.ok) return json(401, { error: "Invalid session" }, origin);
    const actor = await authResponse.json();
    if (actor?.app_metadata?.role !== "super_admin")
      return json(403, { error: "Only the primary administrator can invite staff" }, origin);

    let payload: Record<string, unknown>;
    try { payload = await req.json(); }
    catch { return json(400, { error: "Invalid JSON" }, origin); }

    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const displayName = typeof payload.display_name === "string" ? payload.display_name.trim().slice(0, 120) : "";
    const role = typeof payload.role === "string" ? payload.role : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      return json(400, { error: "Enter a valid email address" }, origin);
    if (!displayName) return json(400, { error: "Staff member name is required" }, origin);
    if (!allowedRoles.has(role)) return json(400, { error: "Role is not permitted for invitation" }, origin);

    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { display_name: displayName, invited_role: role },
      redirectTo: origin + "/login"
    });
    if (inviteError) {
      const message = inviteError.message || "Invitation could not be sent";
      const duplicate = /already|registered|exists/i.test(message);
      return json(duplicate ? 409 : 400, { error: duplicate ? "এই ইমেইলে আগে থেকেই অ্যাকাউন্ট আছে। অ্যাকাউন্ট ভূমিকা ব্যবস্থাপনা থেকে ভূমিকা দিন।" : message }, origin);
    }
    const invitedUser = invited?.user;
    if (!invitedUser?.id) return json(502, { error: "Invitation did not return a user record" }, origin);

    const { error: roleError } = await admin.auth.admin.updateUserById(invitedUser.id, {
      app_metadata: { role }
    });
    if (roleError) {
      await admin.auth.admin.deleteUser(invitedUser.id);
      return json(502, { error: "Invitation setup failed; the pending account was removed. Please retry." }, origin);
    }

    const { error: auditError } = await admin.from("admin_audit_logs").insert({
      actor_id: actor.id,
      action: "invite_staff",
      target_table: "auth.users",
      target_id: invitedUser.id,
      details: { email, role, display_name: displayName }
    });
    if (auditError) console.error("Invitation audit log failed", auditError.message);

    return json(200, { success: true, email, role, message: "Staff invitation sent" }, origin);
  } catch (error) {
    console.error("Staff invitation failed", error);
    return json(503, { error: "Invitation service is temporarily unavailable" }, origin);
  }
});
