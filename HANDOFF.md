# ملف التسليم: ملف الأداء الوظيفي

مشروع «ملف الأداء الوظيفي» لابتدائية عروة بن الزبير، الإدارة العامة للتعليم بمحافظة جدة.

## الأدوار والصلاحيات

- **المعلم:** يدخل إلى ملفه فقط، ويعدّل بياناته وشواهده، ويرفع صورة توقيعه، ويرسل ملفه إلى المدير من القائمة العلوية.
- **المدير:** يرى المعلمين المسندين إليه فقط، ويرى أسماءهم دائما، ولا يفتح ملف المعلم إلا بعد أن يرسله المعلم.
- **مسؤول النظام:** يرى كل شيء، ويدير الحسابات، ويسند المعلمين للمديرين، ويرفع توقيع المدير وختم المدرسة.

## البنية الحالية

- **الواجهة:** JavaScript بسيط (بدون إطار عمل)، تعمل كتطبيق PWA، وتُستضاف على GitHub Pages.
  - الملفات: `index.html`، `app.js`، `styles.css`، `sw.js`، `manifest.webmanifest`.
  - إصدار الكاش الحالي في `sw.js`: `ada-shell-v8`. عند تغيير الواجهة ارفع الرقم.
- **الخادم الحالي:** Google Apps Script.
  - الملف الأصلي `Code.gs` موجود خارج المستودع في `/home/claude/appscript2/Code.gs`، وسيُنسخ إلى `server/Code.gs` عند الحاجة.
  - الاستقبال يتم عبر `doGet` و`doPost` بصيغة JSON: الطلب `{fn, args}`، والرد `{result}` أو `{error}`.
  - الدوال مسموح بها فقط عبر القائمة البيضاء `API_FUNCTIONS_`.
  - الجلسات (token) تُحفظ في `CacheService` لمدة 6 ساعات.
  - قاعدة البيانات جداول داخل Google Sheets، والملفات والصور في Google Drive.
- **المشكلة المعروفة:** بطء كل طلب إلى الخادم (1.5 إلى 3.5 ثانية)، وسببه طبيعة Apps Script وقاعدة البيانات القائمة على الجداول. لا يمكن حلها داخل Apps Script.

## الجداول الحالية (Google Sheets)

| الجدول | الأعمدة |
|---|---|
| users | id, username, name, role, salt, hash, active, createdAt |
| evidence | id, userId, element, title, fileId, fileName, mime, size, uploadedAt, description |
| ratings | userId, element, rating, updatedAt |
| profiles | userId, ownerType, ownerName, stage, subject, school, principalName, eduOffice, jobNo, year, term, message, leftLogoId, rightLogoId, ownerSigId, principalSigId, updatedAt, stampId |
| access | principalId, teacherId, grantedAt |
| links | userId, element, url, updatedAt |
| submissions | userId, sentAt |

ملاحظة: `leftLogoId` و`rightLogoId` ما زالا في الجدول لكن الشعارات أُزيلت من الطباعة.

## الدوال الرئيسية في الخادم

- الجلسة والدخول: `getState`، `setupAdmin`، `login`، `resume(token)`، `whoami`.
- الملف: `buildFile_`، `getFile`، `getProfile`، `saveProfile`.
- الصور: `uploadProfileImage(token, targetId, slot, mime, base64)`، `getProfileImage`.
  - `ownerSig`: المعلم لنفسه فقط.
  - `principalSig` و`stamp`: مسؤول النظام فقط.
  - الحد الأقصى 1 MB، والأنواع المسموحة png وjpeg وwebp.
- المدير: `listUsers`، `setPrincipalTeachers`، `canView_`.
- الإرسال: `submitToPrincipal(token)`، وهي للمعلم فقط.
- الشواهد: `uploadEvidence`، `updateEvidence`، وحد الملف 4 MB.
- الروابط: `setElementLink`، ويقبل روابط Drive وDocs بصيغة https فقط، وبحد أقصى 300 حرف.
- النسخ الاحتياطي: `exportBackup`.

## حالة الاختبار

- تم نشر الإصدار الأخير من الخادم (الإصدار 12) والواجهة (الإصدار v8).
- **لم يُختبر بعد بحسابات حقيقية:**
  - رفع مسؤول النظام لتوقيع المدير والختم.
  - إرسال المعلم ملفه، ثم ظهوره للمدير بعد الإرسال.
  - عرض ملفات PDF في معاينة الطباعة.
- **مشكلة بصرية معلقة:** مربع فارغ أسفل الترويسة في معاينة الطباعة، واسم المدرسة فوقه.

## Supabase (قيد الإنشاء)

- المشروع: `performance-file`، والمنطقة Singapore (ap-southeast-1)، والخطة المجانية.
- الرابط العام: `https://ejlcjmqsxqjztampixpq.supabase.co`
- المفتاح العام (publishable key): `sb_publishable_Eyv09toudVtIvWs3gPStig_okTgIVu2`
  - هذا المفتاح آمن للاستخدام في الواجهة، لكن الحماية الحقيقية تعتمد على قواعد RLS.
- **لا تُحفظ في المستودع أبدا:** كلمة مرور قاعدة البيانات، ومفتاح `service_role`، وأي مفتاح سري.
- القيود المعروفة في الخطة المجانية: المشروع يتوقف بعد أسبوع من عدم النشاط، ومشروعان نشطان كحد أقصى.

## خطة النقل إلى Supabase

1. إنشاء الجداول في Postgres: users، profiles، evidence، ratings، links، access، submissions.
2. تفعيل RLS على كل جدول، وكتابة القواعد:
   - المعلم يقرأ ويكتب صفه فقط.
   - المدير يقرأ المعلمين المسندين إليه، ويقرأ ملف المعلم فقط إذا وُجد له سجل في submissions.
   - مسؤول النظام يقرأ ويكتب كل شيء.
3. تخزين الصور والشواهد في Supabase Storage، مع قواعد وصول مماثلة.
4. نقل العمليات الحساسة (إنشاء الحسابات، إسناد المعلمين، رفع توقيع المدير والختم) إلى Edge Functions، لأنها تحتاج إلى مفتاح `service_role`.
5. نقل البيانات الحالية من Sheets وDrive، مع نسخة احتياطية كاملة قبل النقل.
6. تعديل `app.js` لاستدعاء Supabase مباشرة بدل Apps Script، مع الإبقاء على نفس الشاشات وسلوكها.
7. اختبار كل دور بحساب حقيقي، ثم إيقاف Apps Script بعد التأكد.

### ما أُنجز من الخطة (2026-11-24)

- **الخطوات ١ و٢ و٣ مكتوبة ومختبرة محليًا، ولم تُنفَّذ بعد في مشروع Supabase.**
  - الملف: `supabase/migrations/20261124000000_init.sql`. يُنفَّذ مرة واحدة في محرر SQL في لوحة Supabase.
  - الاختبار: `supabase/tests/rls.test.mjs` (٤٨ حالة لكل الأدوار، تعمل على PGlite بلا Docker). التشغيل: `cd supabase/tests && npm install && npm test`.
- **أسماء الأعمدة** صارت بصيغة snake_case (مثل `owner_name`، `principal_sig_path`). وحُذف `leftLogoId` و`rightLogoId`.
- **التخزين:** حاويتان خاصتان:
  - `evidence`: حتى 4 MB، والمسار `<user_id>/<uuid>-<اسم الملف>`.
  - `images`: حتى 1 MB، png وjpeg وwebp، والمسار `<user_id>/owner_sig.png` أو `principal_sig.png` أو `stamp.png`.
- **الحساب الموقوف** (`active = false`) لا يقرأ ولا يكتب شيئًا، وهذا مفروض في القواعد نفسها.
- **توقيع المدير والختم:** يرفعهما مسؤول النظام مباشرة من الواجهة. القواعد ومشغّل (trigger) على `profiles` تمنع غيره. لذلك لا يحتاجان إلى Edge Function، وهذا تعديل على الخطوة ٤.
- **إسناد المعلمين للمديرين:** يتم مباشرة من الواجهة كذلك، والقواعد تسمح به لمسؤول النظام فقط.
- **ما زال يحتاج Edge Function** (لأنه يحتاج `service_role`): إنشاء الحسابات، وتغيير كلمة مرور حساب آخر، وحذف الحسابات.

### الخطوة ٤: Edge Functions (مكتوبة ومفحوصة الأنواع، ولم تُنشر بعد)

- **الدخول باسم المستخدم (قرار معتمد):** لكل حساب بريد داخلي غير حقيقي في Supabase Auth:
  `u` + أول ٤٠ حرفًا من SHA-256 لاسم المستخدم بعد `trim` و`toLowerCase` + `@users.performance-file.invalid`.
  - الدالة في `supabase/functions/_shared/auth-email.ts`، واختبارها `auth-email.test.ts` (٤ حالات ناجحة).
  - الواجهة تحسب البريد بالدالة نفسها ثم تستدعي `supabase.auth.signInWithPassword` مباشرة، فلا تحتاج دالة دخول على الخادم، وتبقى حماية Auth من تكرار المحاولات كما هي.
  - **عند تعديل `app.js` في الخطوة ٦ يجب نسخ الدالة حرفيًا** (`usernameToEmail`)، وإلا فشل الدخول.
  - **يُتحقق عند أول نشر** من أن Supabase يقبل النطاق `.invalid`. إن رفضه، يُغيَّر `AUTH_EMAIL_DOMAIN` في الملف ونسخته في `app.js` قبل إنشاء أي حساب.
- `supabase/functions/setup-admin`: ينشئ مسؤول النظام الأول، ويعمل فقط حين لا يوجد أي حساب. يُنشر بـ `--no-verify-jwt`.
- `supabase/functions/admin-users`: لمسؤول النظام الفعّال فقط. العمليات: `create`، `reset_password`، `set_active` (يوقف الحساب في Auth أيضًا)، `delete`. ولا يطبّقها مسؤول النظام على حسابه.
- **تغيير المستخدم كلمة مروره بنفسه:** من الواجهة عبر `supabase.auth.updateUser`، بعد التحقق من كلمة المرور القديمة بتسجيل دخول جديد.
- **كلمة المرور:** من ٨ إلى ٧٢ حرفًا.
- **إعدادات Auth المطلوبة في لوحة Supabase:** تعطيل التسجيل الذاتي (Allow new users to sign up = off)، وتعطيل تأكيد البريد.
- **النشر:** `supabase functions deploy setup-admin --no-verify-jwt` ثم `supabase functions deploy admin-users`. مفتاح `service_role` تضيفه Supabase تلقائيًا إلى بيئة الدوال، ولا يوضع في المستودع.

### حالة مشروع Supabase الفعلي (2026-11-24)

- **نُفِّذ** الملفان `20261124000000_init.sql` ثم `20261124000001_grants.sql` في محرر SQL، وتحقّق: ٧ جداول بـ RLS، و٢٣ قاعدة على الجداول، و٧ على التخزين، والحاويتان.
  - **درس مهم:** المشاريع الجديدة لا تمنح `authenticated` و`service_role` صلاحيات الجداول تلقائيًا. أي جدول جديد يحتاج `grant` صريحًا، وإلا رفض الخادم كل طلب. الاختبار المحلي صار يحاكي هذا.
- **أُوقف** التسجيل الذاتي (Allow new users to sign up = off). تأكيد البريد بقي مفعّلًا ولا يضر، لأن الحسابات تُنشأ مؤكَّدة.
- **نُشرت** الدالتان من لوحة Supabase (Via Editor) بملف مدمج واحد لكل دالة، لأن المحرر لا يدعم `../_shared`. الملف المدمج = ملفات `_shared` بالترتيب (auth-email، common، accounts) ثم `index.ts`، مع حذف الاستيرادات المحلية وكلمة `export`.
  - «Verify JWT with legacy secret» **مطفأ** في الدالتين. `setup-admin` يجب أن يعمل بلا جلسة، و`admin-users` يتحقق من الجلسة بنفسه عبر `auth.getUser`.
  - فُحصت بطلبات لا تنشئ شيئًا: رفض كلمة المرور القصيرة، ورفض الطلب بلا جلسة، ورفض قراءة الزائر لجدول users.
- **لم يُنشأ أي حساب بعد.** الخطوة التالية: إنشاء مسؤول النظام الأول عبر `setup-admin` باسم وكلمة مرور يختارهما صاحب المشروع، ثم التحقق من قبول النطاق `.invalid`.

### قرار معلق

- **كلمات المرور الحالية لا تُنقل:** صيغة salt وhash في Apps Script غير معروفة هنا، وملف `Code.gs` خارج المستودع. الأبسط أن يضع مسؤول النظام كلمات مرور جديدة بعد النقل.

## قواعد للعمل على المشروع

- لا تُضف أي مفتاح سري أو كلمة مرور إلى المستودع.
- عند تعديل `app.js` أو `styles.css` ارفع رقم الكاش في `sw.js`.
- عند تعديل `Code.gs` تأكد من نشره كإصدار جديد في Apps Script، وليس على إصدار قديم.
- لا تحذف تطبيق Apps Script قبل التأكد من عمل النسخة الجديدة.
