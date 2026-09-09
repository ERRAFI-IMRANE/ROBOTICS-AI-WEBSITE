export async function invokeAdminUsers(client, action, values = {}) {
  const { data, error } = await client.functions.invoke("admin-users", {
    body: { action, ...values },
  });

  if (error) {
    let message = error.message || "The admin user service could not be reached.";
    try {
      const details = await error.context?.json?.();
      if (details?.error) message = details.error;
    } catch {
      // Keep the SDK error when the response has no JSON body.
    }
    if (/non-2xx|failed to send|fetch/i.test(message)) {
      message = "Admin users are unavailable. Deploy the admin-users Supabase Edge Function and try again.";
    }
    throw new Error(message);
  }

  if (!data?.ok) throw new Error(data?.error || "The admin user operation was not confirmed.");
  return data;
}

export async function listAdminUsers(client) {
  const result = await invokeAdminUsers(client, "list");
  return Array.isArray(result.users) ? result.users : [];
}

export async function createAdminUser(client, values) {
  const result = await invokeAdminUsers(client, "create", values);
  if (!result.user?.id) throw new Error("The new admin account was not confirmed.");
  return result.user;
}

export async function updateAdminUser(client, userId, values) {
  const result = await invokeAdminUsers(client, "update", { userId, ...values });
  if (!result.user?.id) throw new Error("The admin permissions update was not confirmed.");
  return result.user;
}
