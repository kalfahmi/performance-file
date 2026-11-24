// التشغيل: deno test supabase/functions/_shared/names.test.ts
import { normalizeName } from './names.ts';

function same(a: string, b: string, expect: boolean) {
  if ((normalizeName(a) === normalizeName(b)) !== expect) throw new Error(`${a} | ${b} -> expected ${expect}`);
}

Deno.test('الهمزات والتاء المربوطة والألف المقصورة', () => {
  same('أحمد عبدالله', 'احمد عبدالله', true);
  same('فاطمة علي', 'فاطمه علي', true);
  same('مصطفى سعيد', 'مصطفي سعيد', true);
  same('إسراء آل محمد', 'اسراء ال محمد', true);
});

Deno.test('التشكيل والتطويل والمسافات', () => {
  same('خَالِد  علـــي', 'خالد علي', true);
  same('  خالد علي ', 'خالد علي', true);
});

Deno.test('أسماء مختلفة تبقى مختلفة', () => {
  same('خالد علي الزهراني', 'خالد علي الغامدي', false);
  same('محمد أحمد', 'أحمد محمد', false);
});
