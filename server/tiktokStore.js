import { createClient } from "@supabase/supabase-js";

function storageConfig(env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    const error = new Error("TikTok connection storage is not configured.");
    error.code = "TIKTOK_STORAGE_NOT_CONFIGURED";
    error.statusCode = 503;
    throw error;
  }
  return { url, serviceRoleKey };
}

export function createTikTokStore({ env = process.env, client = null } = {}) {
  let database = client;
  function getClient() {
    if (database) return database;
    const { url, serviceRoleKey } = storageConfig(env);
    database = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return database;
  }

  async function get() {
    const { data, error } = await getClient()
      .from("social_oauth_connections")
      .select("provider,open_id,access_token,refresh_token,scope,access_token_expires_at,refresh_token_expires_at,status,last_error_code,created_at,updated_at")
      .eq("provider", "tiktok")
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function save(connection) {
    const row = { ...connection, provider: "tiktok", updated_at: new Date().toISOString() };
    const { data, error } = await getClient()
      .from("social_oauth_connections")
      .upsert(row, { onConflict: "provider" })
      .select("provider,open_id,scope,access_token_expires_at,refresh_token_expires_at,status,last_error_code,created_at,updated_at")
      .single();
    if (error) throw error;
    return data;
  }

  async function update(values) {
    const { data, error } = await getClient()
      .from("social_oauth_connections")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("provider", "tiktok")
      .select("provider,open_id,scope,access_token_expires_at,refresh_token_expires_at,status,last_error_code,created_at,updated_at")
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function remove() {
    const { error } = await getClient().from("social_oauth_connections").delete().eq("provider", "tiktok");
    if (error) throw error;
  }

  return { get, save, update, remove };
}

export const tikTokStore = createTikTokStore();
