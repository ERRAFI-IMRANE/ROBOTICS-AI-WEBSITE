import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const permissionIds = ["overview", "team", "events", "registrations", "users"] as const;
const validPermissions = new Set<string>(permissionIds);

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function permissionsFor(metadata: Record<string, unknown> | null | undefined) {
  const stored = metadata?.club_permissions;
  if (!Array.isArray(stored)) return [...permissionIds];
  return [...new Set(["overview", ...stored.filter((item): item is string => typeof item === "string" && validPermissions.has(item))])];
}

function canManageUsers(user: { app_metadata?: Record<string, unknown> } | null) {
  const metadata = user?.app_metadata;
  if (metadata?.club_admin !== true) return false;
  if (metadata.club_role === "owner") return true;
  if (!Array.isArray(metadata.club_permissions)) return true;
  return metadata.club_permissions.includes("users");
}

function sanitizeUser(user: any) {
  return {
    id: user.id,
    email: user.email || "",
    display_name: user.user_metadata?.display_name || user.user_metadata?.name || "",
    permissions: permissionsFor(user.app_metadata),
    role: user.app_metadata?.club_role || "officer",
    legacy_full_access: !Array.isArray(user.app_metadata?.club_permissions),
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
  };
}

function normalizePermissions(input: unknown) {
  if (!Array.isArray(input)) return ["overview"];
  return [...new Set(["overview", ...input.filter((item): item is string => typeof item === "string" && validPermissions.has(item))])];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ ok: false, error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return response({ ok: false, error: "Admin user service is not configured." }, 500);
  if (!authorization?.startsWith("Bearer ")) return response({ ok: false, error: "Authentication required." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await userClient.auth.getUser();
  const caller = callerData.user;
  if (callerError || !caller) return response({ ok: false, error: "Your admin session is invalid or expired." }, 401);
  if (!canManageUsers(caller)) return response({ ok: false, error: "Admin user management permission is required." }, 403);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return response({ ok: false, error: "A valid JSON request is required." }, 400);
  }

  try {
    if (body.action === "list") {
      const users: any[] = [];
      const perPage = 200;
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        users.push(...data.users);
        if (data.users.length < perPage) break;
      }
      return response({
        ok: true,
        users: users
          .filter((user) => user.app_metadata?.club_admin === true)
          .map(sanitizeUser)
          .sort((a, b) => a.email.localeCompare(b.email)),
      });
    }

    if (body.action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const displayName = String(body.displayName || "").trim().slice(0, 120);
      const permissions = normalizePermissions(body.permissions);
      if (!/^\S+@\S+\.\S+$/.test(email)) return response({ ok: false, error: "Enter a valid email address." }, 400);
      if (password.length < 8 || password.length > 200) return response({ ok: false, error: "The temporary password must contain 8 to 200 characters." }, 400);

      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
        app_metadata: {
          club_admin: true,
          club_role: "officer",
          club_permissions: permissions,
        },
      });
      if (error) throw error;
      return response({ ok: true, user: sanitizeUser(data.user) }, 201);
    }

    if (body.action === "update") {
      const userId = String(body.userId || "");
      if (!/^[0-9a-f-]{36}$/i.test(userId)) return response({ ok: false, error: "Choose a valid admin account." }, 400);
      if (userId === caller.id) return response({ ok: false, error: "You cannot change your own permissions while signed in." }, 400);

      const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(userId);
      if (targetError) throw targetError;
      const target = targetData.user;
      if (!target || target.app_metadata?.club_admin !== true) return response({ ok: false, error: "Admin account not found." }, 404);

      const permissions = normalizePermissions(body.permissions);
      const displayName = String(body.displayName || "").trim().slice(0, 120);
      const { data, error } = await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: { ...target.user_metadata, display_name: displayName },
        app_metadata: {
          ...target.app_metadata,
          club_admin: true,
          club_role: target.app_metadata?.club_role === "owner" ? "owner" : "officer",
          club_permissions: permissions,
        },
      });
      if (error) throw error;
      return response({ ok: true, user: sanitizeUser(data.user) });
    }

    return response({ ok: false, error: "Unsupported admin user action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The admin user operation failed.";
    return response({ ok: false, error: message }, 400);
  }
});
