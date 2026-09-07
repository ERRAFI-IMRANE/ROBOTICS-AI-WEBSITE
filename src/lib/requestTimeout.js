export async function withRequestTimeout(request, label, timeoutMs = 12000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out. Refresh the panel; if it continues, sign out and sign in again.`)), timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}
