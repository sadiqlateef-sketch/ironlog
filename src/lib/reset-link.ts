// Reading the "reset password" email link (see password-reset.ts).

/** The link's sign-in details, from #access_token=... (or ?error_description=... when it expired). */
export function parseResetLink(url: string): { access_token: string; refresh_token: string } | { error: string } | null {
  const u = new URL(url.replace(/^com\.ironlog\.app:\/\//, "https://app/"));
  const p = new URLSearchParams(u.hash.slice(1));
  u.searchParams.forEach((v, k) => p.has(k) || p.set(k, v));
  const err = p.get("error_description");
  if (err) return { error: err.replace(/\+/g, " ") };
  const access_token = p.get("access_token");
  const refresh_token = p.get("refresh_token");
  return access_token && refresh_token ? { access_token, refresh_token } : null;
}
