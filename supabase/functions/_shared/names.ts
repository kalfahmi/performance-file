// توحيد كتابة الاسم العربي للمقارنة (منع تسجيل الشخص نفسه مرتين):
// بلا تشكيل ولا تطويل، والهمزات على الألف ألفًا، والألف المقصورة ياءً، والتاء المربوطة هاءً، ومسافة واحدة بين الكلمات.
export function normalizeName(name: string): string {
  return String(name ?? '')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
