-- This function is invoked only by the profiles trigger, never as a public RPC.
revoke all on function public.sync_profile_phone_to_auth() from public, anon, authenticated;
