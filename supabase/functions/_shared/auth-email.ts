// تحويل اسم المستخدم إلى البريد الداخلي في Supabase Auth.
// يجب أن تبقى هذه الدالة مطابقة حرفيًا لنسختها في app.js (usernameToEmail)،
// لأن الواجهة تحسب البريد بنفسها عند الدخول.
//
// البريد غير حقيقي ولا تُرسل إليه رسائل. الجزء المحلي ثابت الطول (٤١ حرفًا)
// مهما كان اسم المستخدم، ويقبل الأسماء العربية.

export const AUTH_EMAIL_DOMAIN = 'users.performance-file.invalid';

export function normalizeUsername(username: string): string {
  return String(username ?? '').trim().toLowerCase();
}

export async function usernameToEmail(username: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeUsername(username));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return 'u' + hex.slice(0, 40) + '@' + AUTH_EMAIL_DOMAIN;
}
