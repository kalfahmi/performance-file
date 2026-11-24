// أدوات مشتركة لدوال الخادم (Edge Functions).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** عميل بمفتاح service_role. المفتاح يأتي من بيئة Supabase نفسها، ولا يُحفظ في المستودع. */
export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new HttpError(500, 'إعدادات الخادم ناقصة');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** يقرأ الطلب ويعيد جسمه، ويرد على طلب OPTIONS. */
export async function readBody(req: Request): Promise<Record<string, unknown> | Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'الطريقة غير مسموحة' }, 405);
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    return json({ error: 'صيغة الطلب غير صحيحة' }, 400);
  }
}

export function str(v: unknown, field: string, min = 1, max = 200): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) throw new HttpError(400, `قيمة «${field}» غير صحيحة`);
  return s;
}

export function password(v: unknown): string {
  const s = typeof v === 'string' ? v : '';
  if (s.length < 8 || s.length > 72) throw new HttpError(400, 'كلمة المرور من ٨ إلى ٧٢ حرفًا');
  return s;
}

export const ROLES = ['teacher', 'principal', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export function role(v: unknown): Role {
  if (!ROLES.includes(v as Role)) throw new HttpError(400, 'الدور غير صحيح');
  return v as Role;
}

export function handleError(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error(e);
  return json({ error: 'حدث خطأ في الخادم' }, 500);
}
