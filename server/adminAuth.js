import { createClient } from "@supabase/supabase-js";

const FOLDER_PERMISSIONS = Object.freeze({
  EVENTS: "events",
  AVATARS: "team",
  PHOTOS: "team",
});

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase server authentication is not configured.");
  return { url, anonKey };
}

function bearerToken(request) {
  const authorization = request.headers.authorization || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export function requiredPermissionForFolder(folder) {
  return FOLDER_PERMISSIONS[folder] || "";
}

export function isAllowedMediaFolder(folder) {
  return Boolean(requiredPermissionForFolder(folder));
}

export async function requireClubAdmin(request) {
  const token = bearerToken(request);
  if (!token) {
    const error = new Error("Authentication is required.");
    error.statusCode = 401;
    throw error;
  }

  const { url, anonKey } = getSupabaseConfig();
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error: authError } = await client.auth.getUser(token);
  const user = data?.user;
  if (authError || !user) {
    const error = new Error("Your admin session is invalid or expired.");
    error.statusCode = 401;
    throw error;
  }
  if (user.app_metadata?.club_admin !== true) {
    const error = new Error("Club administrator access is required.");
    error.statusCode = 403;
    throw error;
  }
  return user;
}

export async function requireMediaAdmin(request, folder) {
  const user = await requireClubAdmin(request);
  assertMediaPermission(user, folder);
  return user;
}

export function assertMediaPermission(user, folder) {
  const requiredPermission = requiredPermissionForFolder(folder);
  if (!requiredPermission) {
    const error = new Error("Only EVENTS, AVATARS, and PHOTOS folders are allowed.");
    error.statusCode = 400;
    throw error;
  }

  const metadata = user?.app_metadata || {};
  if (metadata.club_admin !== true) {
    const error = new Error("Club administrator access is required.");
    error.statusCode = 403;
    throw error;
  }
  const storedPermissions = metadata.club_permissions;
  const isAuthorized = metadata.club_role === "owner"
    || !Array.isArray(storedPermissions)
    || storedPermissions.includes(requiredPermission);
  if (!isAuthorized) {
    const error = new Error(`The ${requiredPermission} permission is required.`);
    error.statusCode = 403;
    throw error;
  }
}
