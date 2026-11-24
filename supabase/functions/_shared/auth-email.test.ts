// التشغيل: deno test supabase/functions/_shared/auth-email.test.ts
import { usernameToEmail } from './auth-email.ts';

function assertEquals(a: unknown, b: unknown) {
  if (a !== b) throw new Error(`${a} !== ${b}`);
}

Deno.test('قيمة معروفة: sha256("admin")', async () => {
  assertEquals(await usernameToEmail('admin'), 'u8c6976e5b5410415bde908bd4dee15dfb167a9c8@users.performance-file.invalid');
});

Deno.test('المسافات وحالة الأحرف لا تغيّر البريد', async () => {
  assertEquals(await usernameToEmail('  Admin '), await usernameToEmail('admin'));
});

Deno.test('الأسماء العربية تعطي بريدًا صالحًا بطول ثابت', async () => {
  const e = await usernameToEmail('خالد.الزهراني');
  const [local] = e.split('@');
  assertEquals(local.length, 41);
  assertEquals(/^u[0-9a-f]{40}$/.test(local), true);
});

Deno.test('أسماء مختلفة تعطي بريدًا مختلفًا', async () => {
  assertEquals((await usernameToEmail('t1')) === (await usernameToEmail('t2')), false);
});
