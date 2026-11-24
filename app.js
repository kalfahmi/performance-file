/* مشروع الاداء الوظيفي — واجهة التطبيق (PWA).
 * الاتصال بالخادم (Supabase) في api.js عبر الدالة call(fn, args). */

var SCHOOL = 'ابتدائية عروة بن الزبير';
var EDU = 'الإدارة العامة للتعليم بمحافظة جدة';
var MAX_BYTES = 4 * 1024 * 1024;
var MAX_IMG_BYTES = 1024 * 1024;
var ROLE_LABEL = { teacher: 'معلم', principal: 'مدير', admin: 'مسؤول النظام' };
var RATING_LABEL = ['لم يُقيَّم', 'ضعيف', 'مقبول', 'جيد', 'جيد جدًا', 'ممتاز'];
var MIME = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};
var OWNER_TYPES = ['معلم', 'وكيل مدرسة', 'موجه طلابي', 'مدير مدرسة'];
var TERMS = ['الفصل الدراسي الأول', 'الفصل الدراسي الثاني'];
/* صور كل حساب في ملفه هو: المعلم توقيعه، والمدير توقيعه وختمه. يرفعها صاحبها أو مسؤول النظام.
   توقيع المدير وختمه يظهران في ملف المعلم لمسؤول النظام والمدير فقط، لا للمعلم. */
var IMAGES_BY_ROLE = {
  teacher: [{ key: 'ownerSig', label: 'توقيع صاحب الملف', sign: true }],
  principal: [{ key: 'ownerSig', label: 'توقيع المدير', sign: true }, { key: 'stamp', label: 'ختم المدرسة', sign: false }],
  admin: [{ key: 'ownerSig', label: 'التوقيع', sign: true }]
};
function imagesFor(role) { return IMAGES_BY_ROLE[role] || IMAGES_BY_ROLE.teacher; }
function imageLabel(slot) {
  return slot === 'stamp' ? 'ختم المدرسة' : 'التوقيع';
}
var GENERAL_IDEAS = ['سجل الدوام', 'جدول الحصص والانتظار', 'سجل المناوبة', 'محضر لجنة مدرسية', 'خطاب تقدير', 'سجل متابعة منصة مدرستي'];
var EVIDENCE_IDEAS = {
  1: ['خطة الدرس الأسبوعية', 'سجل متابعة الواجبات', 'شهادة حضور دورة'],
  2: ['سجل حضور مجتمع التعلم', 'ورقة عمل ورشة', 'شهادة مشاركة'],
  3: ['سجل التواصل مع أولياء الأمور', 'محضر اجتماع أولياء الأمور', 'رسائل التواصل المكتوبة'],
  4: ['خطة درس تتضمن استراتيجيات متنوعة', 'صور من تطبيق الاستراتيجية', 'أوراق عمل طلابية'],
  5: ['كشف متابعة المادة', 'خطة علاجية', 'مقارنة نتائج قبل وبعد'],
  6: ['خطة تعلم فصلية', 'توزيع المنهج', 'خطة الدرس'],
  7: ['صور من استخدام الوسائل', 'روابط المنصات التعليمية', 'مقاطع عرض للدرس'],
  8: ['صور للفصل', 'جدول توزيع الطلاب', 'لوحات الجدار التعليمية'],
  9: ['سجل السلوك', 'خطة تعزيز السلوك', 'جدول المناوبة الصفية'],
  10: ['تحليل نتائج الاختبارات', 'جدول تصنيف مستويات الطلاب', 'خطة معالجة'],
  11: ['نماذج اختبارات متنوعة', 'روبرك تقويم', 'ملف إنجاز الطلاب']
};
var S = { token: null, me: null, view: null, inFile: false, targetId: null, file: null, profile: null, users: [], sig: null, cache: { img: {}, ev: {}, pdf: {} } };

/* ---------- أدوات ---------- */

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function d(v) {
  return String(v).replace(/[0-9]/g, function (n) { return '٠١٢٣٤٥٦٧٨٩'[n]; });
}

function pct(n) { return d(n) + '٪'; }

function fmtDate(iso) {
  var dt = new Date(iso);
  return isNaN(dt) ? '' : dt.toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtSize(bytes) {
  return bytes < 1048576 ? d(Math.max(1, Math.round(bytes / 1024))) + ' ك.ب' : d((bytes / 1048576).toFixed(1)) + ' م.ب';
}

function ext(name) { return String(name).split('.').pop().toLowerCase(); }

function main() { return document.getElementById('main'); }

function toast(msg, kind) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (kind === 'err' ? ' err' : '');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(function () { el.className = 'toast'; }, 3800);
}

function openModal(html) {
  var m = document.getElementById('modal');
  m.innerHTML = '<div class="' + (html.indexOf('modal-head') !== -1 ? 'sheet wide' : 'sheet') + '" role="dialog" aria-modal="true">' + html + '</div>';
  m.hidden = false;
  var first = m.querySelector('input');
  if (first) first.focus();
}

function closeModal() {
  var m = document.getElementById('modal');
  if (m) m.hidden = true;
  S.sig = null;
  S.onConfirm = null;
}

/** نافذة تأكيد داخل التطبيق بدل confirm() الذي تمنعه بعض المتصفحات والتطبيقات المثبتة. */
function askConfirm(message, yesLabel, onYes, danger) {
  openModal('<h2>تأكيد</h2><p>' + esc(message) + '</p>' +
    '<div class="form-actions"><button class="btn" type="button" data-act="close">إلغاء</button>' +
    '<button class="btn ' + (danger ? 'danger' : 'primary') + '" type="button" data-act="confirm-yes">' + esc(yesLabel) + '</button></div>');
  S.onConfirm = onYes;
  var yes = document.querySelector('#modal [data-act="confirm-yes"]');
  if (yes) yes.focus();
}

function handleErr(err) {
  var msg = (err && err.message) || 'حدث خطأ غير متوقع.';
  if (msg.indexOf('انتهت الجلسة') !== -1) {
    sessionStorage.removeItem('ptoken');
    S.token = null;
    S.me = null;
    renderLogin();
  }
  toast(msg, 'err');
  var m = main();
  if (m && m.innerHTML.indexOf('جارٍ التحميل') !== -1) {
    m.innerHTML = '<div class="error-box">' + esc(msg) + '</div>' +
      '<p><button class="btn small" type="button" data-act="tab" data-view="' + esc(S.view || 'elements') + '">إعادة المحاولة</button></p>';
  }
}

function readBase64(file) {
  return new Promise(function (resolve, reject) {
    var fr = new FileReader();
    fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
    fr.onerror = function () { reject(new Error('تعذّرت قراءة الملف.')); };
    fr.readAsDataURL(file);
  });
}

/**
 * يضغط صورة في المتصفح حتى لا يتجاوز حجمها maxBytes: يصغّر الأبعاد إلى maxDim ثم يخفض الجودة تدريجيًا.
 * keepAlpha: صيغة WebP تحفظ الخلفية الشفافة (للتوقيع والختم)، وإلا JPEG (لصور الشواهد).
 * يعيد { base64, mime, size }.
 */
function compressImage(file, maxBytes, maxDim, keepAlpha) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      var mime = keepAlpha ? 'image/webp' : 'image/jpeg';
      var quality = 0.88;
      var attempt = function () {
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        var ctx = c.getContext('2d');
        if (!keepAlpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        var dataUrl = c.toDataURL(mime, quality);
        var b64 = dataUrl.split(',')[1];
        var size = Math.floor(b64.length * 3 / 4);
        if (size <= maxBytes || (quality <= 0.5 && scale < 0.2)) {
          if (size > maxBytes) return reject(new Error('تعذّر تصغير الصورة إلى الحجم المسموح.'));
          return resolve({ base64: b64, mime: dataUrl.slice(5, dataUrl.indexOf(';')), size: size });
        }
        if (quality > 0.55) quality -= 0.1; else scale *= 0.8;
        attempt();
      };
      attempt();
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('تعذّرت قراءة الصورة.')); };
    img.src = url;
  });
}

/** يقرأ الصورة كما هي إن كانت ضمن الحد، وإلا يضغطها. */
function prepareImage(file, maxBytes, maxDim, keepAlpha) {
  if (file.size <= maxBytes) {
    return readBase64(file).then(function (b64) { return { base64: b64, mime: file.type, size: file.size }; });
  }
  return compressImage(file, maxBytes, maxDim, keepAlpha);
}

function statusOf(c) {
  return c >= 2 ? ['pill-done', 'مكتمل'] : (c === 1 ? ['pill-partial', 'ناقص شاهد'] : ['pill-none', 'بلا شواهد']);
}

function downloadBlob(blob, name) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

/* ---------- الدخول والإعداد ---------- */

function boot() {
  document.getElementById('app').innerHTML = '<div class="notice">جارٍ التحميل…</div>';
  return call('resume').then(function (r) {
    S.token = r.token;
    S.me = r.user;
    S.prefetch = r.file;
    enter();
  }).catch(function () {
    sessionStorage.removeItem('ptoken');
    S.token = null;
    return showLoginOrSetup();
  });
}

/** تظهر شاشة الدخول فورًا، ثم يُتحقق في الخلفية إن كان النظام يحتاج إعدادًا أولًا. */
function showLoginOrSetup() {
  renderLogin();
  return call('getState').then(function (st) {
    if (st.setupNeeded) renderSetup();
  }).catch(function () {});
}

function renderSetup() {
  document.getElementById('app').innerHTML =
    '<section class="card auth">' +
    '<div class="brand"><h1>ملف الأداء الوظيفي</h1><span class="muted">' + esc(SCHOOL) + '</span></div>' +
    '<p class="muted">أول تشغيل للنظام: أنشئ حساب مسؤول النظام. يُنشأ هذا الحساب مرة واحدة فقط، ومنه تُضاف حسابات المعلمين والمديرين.</p>' +
    '<form class="col" data-action="setup">' +
    '<label>الاسم الكامل<input name="name" required></label>' +
    '<label>اسم الدخول<input name="username" dir="ltr" required></label>' +
    '<label>كلمة المرور<input name="password" type="password" minlength="8" required></label>' +
    '<label>تأكيد كلمة المرور<input name="confirm" type="password" minlength="8" required></label>' +
    '<button class="btn primary block" type="submit">إنشاء الحساب</button>' +
    '</form></section>';
}

function renderLogin() {
  document.getElementById('app').innerHTML =
    '<section class="card auth">' +
    '<div class="brand"><h1>ملف الأداء الوظيفي</h1><span class="muted">' + esc(SCHOOL) + '</span></div>' +
    '<form class="col" data-action="login">' +
    '<label>اسم الدخول<input name="username" dir="ltr" autocomplete="username" required></label>' +
    '<label>كلمة المرور<input name="password" type="password" autocomplete="current-password" required></label>' +
    '<button class="btn primary block" type="submit">دخول</button>' +
    '</form>' +
    '<p class="muted">إذا نسيت كلمة المرور فاطلبها من مسؤول النظام.</p>' +
    '<p class="auth-switch">ليس لديك حساب؟ <button class="link" type="button" data-act="show-register">تسجيل جديد</button></p>' +
    '</section>';
}

function renderRegister() {
  document.getElementById('app').innerHTML =
    '<section class="card auth">' +
    '<div class="brand"><h1>تسجيل جديد</h1><span class="muted">' + esc(SCHOOL) + '</span></div>' +
    '<p class="muted">يُنشأ لك حساب معلم، وتدخل به مباشرة بعد التسجيل.</p>' +
    '<form class="col" data-action="register">' +
    '<label>الاسم الكامل<input name="name" minlength="2" maxlength="120" autocomplete="name" required></label>' +
    '<label>اسم الدخول<input name="username" dir="ltr" minlength="3" maxlength="60" pattern="\\S+" title="بلا مسافات" autocomplete="username" required></label>' +
    '<label>كلمة المرور<input name="password" type="password" minlength="8" maxlength="72" autocomplete="new-password" required></label>' +
    '<label>تأكيد كلمة المرور<input name="confirm" type="password" minlength="8" maxlength="72" autocomplete="new-password" required></label>' +
    '<button class="btn primary block" type="submit">إنشاء الحساب والدخول</button>' +
    '</form>' +
    '<p class="auth-switch">لديك حساب؟ <button class="link" type="button" data-act="show-login">تسجيل الدخول</button></p>' +
    '</section>';
}

function enter() {
  S.cache = { img: {}, ev: {}, pdf: {} };
  shell();
  S.targetId = S.me.id;
  S.unread = 0;
  go(S.me.role === 'teacher' ? 'elements' : 'teachers', S.me.id);
  if (S.me.role === 'teacher') refreshUnread();
}

/** عدد رسائل المدير غير المقروءة، ويظهر بجوار تبويب «رسائل المدير». */
function refreshUnread() {
  return call('unreadCount').then(function (n) {
    S.unread = n;
    renderNav();
  }).catch(function () {});
}

function shell() {
  document.getElementById('app').innerHTML =
    '<header class="topbar no-print"><div class="topbar-row"><div class="brand"><span class="logo" aria-hidden="true">أ</span><div><h1>ملف الأداء الوظيفي</h1><span class="brand-sub">' + esc(SCHOOL) + '</span></div></div>' +
    '<div class="who"><span>' + esc(S.me.name) + ' · ' + ROLE_LABEL[S.me.role] + '</span>' +
    '<button class="btn ghost small" type="button" data-act="pwd">تغيير كلمة المرور</button>' +
    '<button class="btn ghost small" type="button" data-act="logout">خروج</button></div></div>' +
    '<nav class="nav" id="nav" aria-label="التنقل"></nav></header>' +
    '<main id="main" class="pad"></main><div id="modal" class="modal" hidden></div>';
}

function navItems() {
  if (!S.inFile) {
    if (S.me.role === 'admin') return [['teachers', 'المعلمون'], ['accounts', 'الحسابات'], ['backup', 'النسخ الاحتياطي']];
    return [['teachers', 'المعلمون'], ['myfile', 'بيانات الملف']];
  }
  var own = S.targetId === S.me.id;
  var list = [];
  if (!own) list.push(['teachers', 'رجوع إلى المعلمين']);
  list.push(['elements', 'عناصر الأداء'], ['profile', 'بيانات الملف'], ['preview', 'معاينة الملف']);
  if (own && S.me.role === 'teacher') {
    list.push(['messages', 'رسائل المدير' + (S.unread ? ' <span class="badge" aria-label="' + S.unread + ' غير مقروءة">' + d(S.unread) + '</span>' : '')]);
    list.push(['submit', 'إرسال الملف إلى المدير']);
  }
  if (own) list.push(['backup', 'النسخ الاحتياطي']);
  return list;
}

function renderNav() {
  var nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML = navItems().map(function (it) {
    var current = it[0] === S.view || (it[0] === 'teachers' && S.view === 'teachers');
    return '<button class="tab" type="button" data-act="tab" data-view="' + it[0] + '" aria-current="' + (current ? 'true' : 'false') + '">' + it[1] + '</button>';
  }).join('');
}

/** التنقل الرئيسي. id اختياري لفتح ملف معلم محدد. */
function go(view, id) {
  if (view === 'submit') return submitPrincipal();
  S.view = view;
  if (main()) main().innerHTML = '<div class="notice" aria-live="polite">جارٍ التحميل…</div>';
  if (view === 'teachers') { S.inFile = false; renderNav(); return loadTeachers(); }
  if (view === 'accounts') { S.inFile = false; renderNav(); return loadAccounts(); }
  if (view === 'myfile') { S.inFile = false; S.targetId = S.me.id; renderNav(); return loadProfileView(); }
  if (view === 'messages') { S.inFile = true; S.targetId = S.me.id; renderNav(); return loadMessages(); }
  if (view === 'backup') {
    S.inFile = S.me.role === 'teacher';
    S.targetId = S.me.id;
    renderNav();
    return renderBackup();
  }
  S.inFile = true;
  if (id) S.targetId = String(id);
  if (!S.targetId) S.targetId = S.me.id;
  renderNav();
  if (view === 'profile') return loadProfileView();
  if (view === 'preview') return loadPreview();
  return loadElements();
}

/* ---------- عناصر الأداء ---------- */

function loadElements() {
  if (S.prefetch && S.targetId === S.me.id) {
    S.file = S.prefetch;
    S.prefetch = null;
    renderElements();
    return Promise.resolve();
  }
  return call('getFile', [S.token, S.targetId]).then(function (f) {
    S.file = f;
    renderElements();
  }).catch(handleErr);
}

function renderElements() {
  var f = S.file, s = f.summary, mine = f.editable;
  var complete = s.counts.filter(function (c) { return c >= 2; }).length;
  var cards = f.elements.map(function (el, i) { return renderElementCard(el, s.counts[i]); }).join('');
  main().innerHTML =
    '<div class="page-head"><h2>' + esc(mine ? 'عناصر الأداء والشواهد' : 'ملف ' + f.owner.name) + '</h2></div>' +
    '<div class="notice">' + (mine ? 'اضغط على أي عنصر لرفع شواهده وتقييم نفسك فيه.' : 'تعرض هذه الصفحة ملف المعلم للقراءة فقط.') + '</div>' +
    '<div class="stats">' +
    '<div class="card stat"><span class="muted">جاهزية الشواهد</span><span class="stat-num">' + pct(s.readiness) + '</span><div class="meter"><span style="width:' + s.readiness + '%"></span></div></div>' +
    '<div class="card stat"><span class="muted">عناصر مكتملة</span><span class="stat-num">' + d(complete) + ' / ' + d(11) + '</span><span class="muted">شاهدان فأكثر لكل عنصر</span></div>' +
    '<div class="card stat"><span class="muted">الشواهد المضافة</span><span class="stat-num">' + d(s.evidenceTotal) + '</span><span class="muted">التقدير الذاتي الاسترشادي: ' + pct(s.selfScore) + '</span></div>' +
    '</div>' +
    '<div class="grid">' + cards + '</div>';
}

function renderElementCard(el, count) {
  var st = statusOf(count);
  return '<button class="el-card" type="button" data-act="elem" data-element="' + el.no + '">' +
    '<span class="el-top"><span class="no">' + d(el.no) + '</span><span class="el-name">' + esc(el.name) + '</span></span>' +
    '<span class="el-foot"><span class="pill ' + st[0] + '">' + st[1] + '</span><span class="muted">الوزن ' + d(el.weight) + '٪</span></span>' +
    '</button>';
}

function openElement(no) {
  var f = S.file, el = f.elements[no - 1], mine = f.editable;
  if (!el) return;
  var list = el.evidence.length
    ? '<ul class="ev-list">' + el.evidence.map(function (x) {
        return '<li><span><strong>' + esc(x.title) + '</strong>' + (x.description ? '<br><span>' + esc(x.description) + '</span>' : '') + '<br><span class="muted">' + esc(x.fileName) + ' · ' + fmtSize(x.size) + ' · ' + fmtDate(x.uploadedAt) + '</span></span>' +
          '<span style="display:flex;gap:8px"><button class="btn small" type="button" data-act="view" data-id="' + esc(x.id) + '">عرض</button>' +
          (mine ? '<button class="btn small" type="button" data-act="edit-ev" data-id="' + esc(x.id) + '">تعديل</button>' : '') + (mine ? '<button class="btn small danger" type="button" data-act="del" data-id="' + esc(x.id) + '">حذف</button>' : '') + '</span></li>';
      }).join('') + '</ul>'
    : '<p class="muted">لا توجد شواهد لهذا العنصر بعد.</p>';
  var ideas = (EVIDENCE_IDEAS[no] || []).concat(GENERAL_IDEAS);
  var ideaBox = mine
    ? '<div class="section-box"><h3>أفكار للشواهد</h3><div class="chips">' + ideas.map(function (t) {
        return '<button class="chip" type="button" data-act="idea" data-idea="' + esc(t) + '">' + esc(t) + '</button>';
      }).join('') + '</div><p class="muted" style="margin:0">اضغط على الفكرة لتعبئة عنوان الشاهد.</p></div>'
    : '';
  var upload = mine
    ? '<div class="section-box"><h3>رفع شاهد جديد</h3><form class="row" data-action="upload" data-element="' + no + '">' +
      '<label>عنوان الشاهد<input name="title" maxlength="120" required></label>' +
      '<label>نبذة عن الشاهد (اختياري)<textarea name="description" maxlength="300" rows="2"></textarea></label>' +
      '<label>الملف<input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx"></label>' +
      '<button class="btn primary" type="submit">رفع الشاهد</button></form>' +
      '<p class="muted" style="margin:0">الحد الأقصى ٤ ميغابايت للملفات. الصور الأكبر من ١ ميغابايت تُضغط تلقائيًا. الصيغ: PDF وصور وWord وExcel وPowerPoint.</p></div>'
    : '';
  var ratings = mine
    ? '<div class="section-box"><h3>التقدير الذاتي</h3><div class="ratings" role="group" aria-label="التقدير الذاتي">' +
      [1, 2, 3, 4, 5].map(function (v) {
        return '<button type="button" data-act="rate" data-element="' + no + '" data-value="' + v + '" aria-pressed="' +
          (el.rating === v ? 'true' : 'false') + '" title="' + RATING_LABEL[v] + '">' + d(v) + '</button>';
      }).join('') + '<span class="muted">' + RATING_LABEL[el.rating] + '</span></div></div>'
    : '<p class="muted">التقدير الذاتي: ' + RATING_LABEL[el.rating] + '</p>';
  var linkBox = mine
    ? '<div class="section-box"><h3>رابط مجلد الشواهد (اختياري)</h3><form class="row" data-action="link" data-element="' + no + '">' +
      '<label>رابط مجلد Google Drive<input name="url" type="url" maxlength="300" value="' + esc(el.link || '') + '" placeholder="https://drive.google.com/..."></label>' +
      '<button class="btn primary" type="submit">حفظ الرابط</button>' + (el.link ? '<button class="btn small danger" type="button" data-act="clear-link" data-element="' + no + '">حذف الرابط</button>' : '') + '</form>' +
      '<p class="muted" style="margin:0">يظهر في الملف المطبوع رمز QR يفتح الشواهد كاملة. اترك الحقل فارغًا لإزالته.</p></div>'
    : (el.link ? '<div class="section-box"><h3>مجلد الشواهد</h3><a href="' + esc(el.link) + '" target="_blank" rel="noopener">فتح مجلد الشواهد</a></div>' : '');
  openModal('<div class="modal-head"><div><span class="muted">العنصر ' + d(no) + ' · الوزن ' + d(el.weight) + '٪</span><h2>' + esc(el.name) + '</h2></div>' +
    '<button class="btn small" type="button" data-act="close">إغلاق</button></div>' +
    '<div class="section-box"><h3>الشواهد</h3>' + list + '</div>' + ideaBox + upload + linkBox + ratings);
}

function readRatingAndSave(no, value) {
  var cur = S.file.elements[no - 1].rating;
  var next = cur === value ? 0 : value;
  return call('setRating', [S.token, no, next]).then(function () {
    closeModal();
    return loadElements();
  }).catch(handleErr);
}

function upload(form) {
  var file = form.file.files[0];
  var title = form.title.value.trim();
  if (!file) return toast('اختر ملفًا أولًا.', 'err');
  var mime = file.type === 'image/jpg' ? 'image/jpeg' : (file.type || MIME[ext(file.name)] || '');
  // صور الشواهد فوق ١ ميغابايت تُضغط قبل الرفع (توفيرًا للمساحة)، وما سواها يبقى حدّه ٤ ميغابايت.
  var squeeze = /^image\/(jpeg|png|webp)$/.test(mime) && file.size > MAX_IMG_BYTES;
  if (!squeeze && file.size > MAX_BYTES) return toast('حجم الملف أكبر من ٤ ميغابايت.', 'err');
  var btn = form.querySelector('button');
  btn.disabled = true;
  btn.textContent = squeeze ? 'جارٍ ضغط الصورة…' : 'جارٍ الرفع…';
  var name = squeeze ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;
  var ready = squeeze
    ? compressImage(file, MAX_IMG_BYTES, 2000, false)
    : readBase64(file).then(function (b64) { return { base64: b64, mime: mime }; });
  return ready.then(function (im) {
    btn.textContent = 'جارٍ الرفع…';
    var desc = String(form.querySelector('[name="description"]').value || '').trim();
    return call('uploadEvidence', [S.token, Number(form.dataset.element), title, name, im.mime, im.base64, desc]);
  }).then(function () {
    toast(squeeze ? 'ضُغطت الصورة ورُفع الشاهد.' : 'تم رفع الشاهد.');
    closeModal();
    return loadElements();
  }).catch(function (err) {
    btn.disabled = false;
    btn.textContent = 'رفع الشاهد';
    handleErr(err);
  });
}

function openEvidenceEdit(id) {
  var x = null;
  S.file.elements.forEach(function (el) {
    el.evidence.forEach(function (e) { if (e.id === id) x = e; });
  });
  if (!x) return;
  openModal('<div class="modal-head"><div><h2>تعديل الشاهد</h2></div>' +
    '<button class="btn small" type="button" data-act="close">إغلاق</button></div>' +
    '<form class="col" data-action="edit-ev" data-id="' + esc(id) + '">' +
    '<label>عنوان الشاهد<input name="title" maxlength="120" required value="' + esc(x.title) + '"></label>' +
    '<label>نبذة عن الشاهد (اختياري)<textarea name="description" maxlength="300" rows="3">' + esc(x.description || '') + '</textarea></label>' +
    '<div class="form-actions"><button class="btn" type="button" data-act="close">إلغاء</button><button class="btn primary" type="submit">حفظ</button></div></form>');
}

function viewEvidence(id) {
  return call('getEvidenceFile', [S.token, id]).then(function (r) {
    var bytes = Uint8Array.from(atob(r.base64), function (c) { return c.charCodeAt(0); });
    var url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
    if (!window.open(url, '_blank')) {
      var a = document.createElement('a');
      a.href = url;
      a.download = r.fileName;
      a.click();
    }
  }).catch(handleErr);
}

function deleteEvidence(id) {
  askConfirm('حذف هذا الشاهد نهائيًا؟ لا يمكن التراجع عن الحذف.', 'حذف الشاهد', function () {
    return call('deleteEvidence', [S.token, id]).then(function () {
      toast('تم حذف الشاهد.');
      closeModal();
      return loadElements();
    }).catch(handleErr);
  }, true);
}

/* ---------- بيانات الملف ---------- */

/* select: قائمة ثابتة. other: يضاف خيار «أخرى» لكتابة قيمة غير موجودة. القوائم في lists.js. */
var OTHER = '__other__';
var PROFILE_FIELDS = [
  { key: 'ownerType', label: 'صفة صاحب الملف', select: function () { return OWNER_TYPES; } },
  { key: 'term', label: 'الفصل الدراسي', select: function () { return TERMS; } },
  { key: 'ownerName', label: 'اسم صاحب الملف' },
  { key: 'subject', label: 'المادة أو التخصص', select: function () { return LIST_SUBJECTS; }, other: true },
  { key: 'stage', label: 'المرحلة', select: function () { return LIST_STAGES; } },
  { key: 'school', label: 'المدرسة', select: function () { return S.schools || [SCHOOL]; }, other: true },
  { key: 'eduOffice', label: 'إدارة التعليم', select: function () { return LIST_EDU_OFFICES; }, other: true },
  { key: 'principalName', label: 'اسم مدير المدرسة أو مديرتها' },
  { key: 'jobNo', label: 'الرقم الوظيفي (اختياري)' },
  { key: 'year', label: 'العام الدراسي (هـ)', select: function () { return LIST_YEARS; } }
];

/** حقل قائمة منسدلة، ومعه حقل نصي يظهر عند اختيار «أخرى». القيمة القديمة غير الموجودة في القائمة لا تضيع. */
function selectFieldHTML(f, value, dis) {
  var opts = f.select();
  var known = !value || opts.indexOf(value) !== -1;
  var isOther = !known && f.other;
  var list = known || f.other ? opts : opts.concat([value]);
  var html = '<select name="' + f.key + '" data-other="' + (f.other ? '1' : '0') + '"' + dis + '>' +
    '<option value=""' + (value ? '' : ' selected') + '>اختر…</option>' +
    list.map(function (o) { return '<option value="' + esc(o) + '"' + (o === value ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') +
    (f.other ? '<option value="' + OTHER + '"' + (isOther ? ' selected' : '') + '>أخرى (أكتبها)</option>' : '') +
    '</select>';
  if (f.other) {
    html += '<input class="other-input" name="' + f.key + '__other" maxlength="150" placeholder="اكتب ' + esc(f.label) + '" value="' + (isOther ? esc(value) : '') + '"' + (isOther ? '' : ' hidden') + dis + '>';
  }
  return html;
}

function loadProfileView() {
  return Promise.all([
    call('getProfile', [S.token, S.targetId]),
    call('schoolNames').catch(function () { return []; }),
    call('schoolDirectory').catch(function () { return []; })
  ]).then(function (r) {
    S.profile = r[0];
    S.directory = r[2] || [];
    var schools = (r[1] || []).slice();
    S.directory.forEach(function (x) { if (schools.indexOf(x.school) === -1) schools.push(x.school); });
    if (schools.indexOf(SCHOOL) === -1) schools.unshift(SCHOOL);
    S.schools = schools.sort(function (a, b) { return a.localeCompare(b, 'ar'); });
    renderProfile();
    loadThumbs();
  }).catch(handleErr);
}

/** المدرسة المسجلة في دليل المديرين (اسم مديرها وإدارة تعليمها)، أو null. */
function schoolEntry(name) {
  return (S.directory || []).filter(function (x) { return x.school === name; })[0] || null;
}

/**
 * عند اختيار مدرسة لها مدير مسجل: يُكتب اسم المدير ولا يُعدَّل، وتُكتب إدارة التعليم.
 * يُستدعى عند تغيير المدرسة وبعد عرض النموذج.
 */
function applySchool(form) {
  if (!form || !form.principalName) return;
  var sel = form.querySelector('select[name="school"]');
  var school = sel && sel.value === OTHER ? '' : (sel ? sel.value : '');
  var entry = schoolEntry(school);
  var pn = form.principalName;
  if (entry) {
    pn.value = entry.principalName;
    pn.readOnly = true;
    pn.title = 'اسم مدير هذه المدرسة كما سجّله في النظام';
    var eo = form.querySelector('select[name="eduOffice"]');
    if (eo && entry.eduOffice) {
      var known = Array.prototype.some.call(eo.options, function (o) { return o.value === entry.eduOffice; });
      eo.value = known ? entry.eduOffice : OTHER;
      var other = form.querySelector('[name="eduOffice__other"]');
      if (other) { other.hidden = known; if (!known) other.value = entry.eduOffice; }
    }
  } else {
    pn.readOnly = false;
    pn.title = '';
  }
}

function imgCardsHTML(role, userId, images, canEdit) {
  return imagesFor(role).map(function (im) {
    var has = images[im.key];
    var actions = canEdit
      ? '<button class="btn small" type="button" data-act="pick-img" data-slot="' + im.key + '" data-id="' + esc(userId) + '">رفع صورة</button>' +
        (im.sign ? '<button class="btn small" type="button" data-act="sign" data-slot="' + im.key + '" data-id="' + esc(userId) + '">رسم توقيع</button>' : '')
      : '';
    return '<div class="img-card"><span class="img-name">' + esc(im.label) + '</span>' +
      (has ? '<img class="img-thumb" data-thumb="' + im.key + '" data-user="' + esc(userId) + '" alt="' + esc(im.label) + '">' : '<span class="muted">لم يُرفع بعد</span>') +
      '<div class="img-actions">' + actions + '</div></div>';
  }).join('');
}

function renderProfile() {
  var p = S.profile, pr = p.profile;
  var own = p.owner.id === S.me.id;
  // مسؤول النظام يعدّل بيانات ملف أي حساب.
  var can = p.editable || S.me.role === 'admin';
  var canImg = can;
  if (p.owner.role === 'principal') {
    var pdis = can ? '' : ' disabled';
    var pf = PROFILE_FIELDS.filter(function (f) { return f.key === 'school' || f.key === 'eduOffice'; });
    main().innerHTML =
      '<div class="page-head"><h2>' + esc(own ? 'بيانات الملف' : 'بيانات ' + p.owner.name) + '</h2></div>' +
      '<section class="card"><h3>المدرسة</h3><form class="pform" data-action="profile" data-fields="school,eduOffice">' +
      pf.map(function (f) { return '<label>' + esc(f.label) + selectFieldHTML(f, pr[f.key] || '', pdis) + '</label>'; }).join('') +
      (can ? '<div class="form-actions"><button class="btn primary" type="submit">حفظ</button></div>' : '') + '</form>' +
      '<p class="muted" style="margin:0">عندما يختار المعلم هذه المدرسة في بيانات ملفه، يُكتب اسمك مديرًا لها تلقائيًا، وتُكتب إدارة التعليم.</p></section>' +
      '<section class="card"><h3>توقيع المدير وختم المدرسة</h3><div class="img-grid">' + imgCardsHTML('principal', p.owner.id, p.images, canImg) + '</div>' +
      '<p class="muted" style="margin:0">يظهران في ملفات المعلمين المسندين إليك عند معاينتها وطباعتها من حسابك أو من حساب مسؤول النظام، ولا يظهران للمعلم.</p></section>';
    return;
  }
  var dis = can ? '' : ' disabled';
  var fields = PROFILE_FIELDS.map(function (f) {
    var input = f.select
      ? selectFieldHTML(f, pr[f.key] || '', dis)
      : '<input name="' + f.key + '" value="' + esc(pr[f.key]) + '" maxlength="150"' + dis + '>';
    return '<label>' + esc(f.label) + input + '</label>';
  }).join('');
  var msg = '<label class="wide">رسالة المعلم<textarea name="message" rows="4" maxlength="1000"' + dis + '>' + esc(pr.message) + '</textarea></label>';
  var form = '<form class="pform" data-action="profile">' + fields + msg +
    (can ? '<div class="form-actions"><button class="btn primary" type="submit">حفظ بيانات الملف</button></div>' : '') + '</form>';
  var imgs = imgCardsHTML('teacher', p.owner.id, p.images, canImg);
  var submit = (can && S.me.role === 'teacher')
    ? '<section class="card"><h3>إرسال الملف إلى المدير</h3>' +
      '<p class="muted" style="margin:0">' + (p.sentAt
        ? 'أُرسل الملف إلى المدير في ' + esc(fmtDate(p.sentAt)) + '. يمكنك إعادة الإرسال من القائمة العلوية بعد أي تعديل.'
        : 'لن يظهر ملفك لحساب المدير قبل أن ترسله. الإرسال من القائمة العلوية.') + '</p></section>'
    : '';
  main().innerHTML =
    '<div class="page-head"><h2>' + esc(own ? 'بيانات الملف' : 'بيانات ملف ' + p.owner.name) + '</h2></div>' +
    (!own && S.me.role === 'admin' ? '<div class="notice">تعدّل بيانات ملف ' + esc(p.owner.name) + ' بصفتك مسؤول النظام.</div>' : '') +
    '<section class="card"><h3>المعلومات الأساسية</h3>' + form +
    '<p class="muted" style="margin:6px 0 0">إذا كانت المدرسة مسجلة باسم مديرها في النظام، يُكتب اسم المدير تلقائيًا ولا يُعدَّل. والمدرسة وإدارة التعليم واسم المدير تظهر في المعاينة والطباعة.</p></section>' +
    '<section class="card"><h3>التوقيع</h3><div class="img-grid">' + imgs + '</div>' +
    '<p class="muted" style="margin:0">توقيعك يضيفه أنت أو مسؤول النظام، ويظهر في معاينة الملف وطباعته. توقيع المدير والختم يضيفهما المدير في ملفه أو مسؤول النظام.</p></section>' +
    submit;
  applySchool(main().querySelector('form[data-action="profile"]'));
}

/** بعد رفع صورة أو رسم توقيع: تحديث الشاشة التي جاء منها (الحسابات أو بيانات الملف). */
function afterImageSaved() {
  S.cache.img = {};
  return S.view === 'accounts' ? loadAccounts() : loadProfileView();
}

function pickImage(slot, userId) {
  var target = userId || S.targetId;
  var inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/png,image/jpeg,image/webp';
  inp.onchange = function () {
    var file = inp.files[0];
    if (!file) return;
    var big = file.size > MAX_IMG_BYTES;
    if (big) toast('الصورة أكبر من ١ ميغابايت، جارٍ ضغطها…');
    prepareImage(file, MAX_IMG_BYTES, 1600, true).then(function (im) {
      return call('uploadProfileImage', [S.token, target, slot, im.mime, im.base64]);
    }).then(function () {
      toast(big ? 'ضُغطت الصورة ورُفعت.' : 'تم رفع الصورة.');
      return afterImageSaved();
    }).catch(handleErr);
  };
  inp.click();
}

function openSignature(slot, userId) {
  S.sigTarget = userId || S.targetId;
  var who = S.users && S.users.filter(function (u) { return u.id === S.sigTarget; })[0];
  var label = imageLabel(slot) + (who && S.view === 'accounts' ? ' — ' + who.name : '');
  openModal('<div class="modal-head"><div><h2>رسم التوقيع</h2><span class="muted">' + esc(label) + '</span></div>' +
    '<button class="btn small" type="button" data-act="close">إغلاق</button></div>' +
    '<canvas id="sigpad" class="sigpad" width="600" height="240" aria-label="لوحة التوقيع"></canvas>' +
    '<div class="form-actions"><button class="btn" type="button" data-act="sig-clear">مسح</button>' +
    '<button class="btn primary" type="button" data-act="sig-save" data-slot="' + slot + '">حفظ التوقيع</button></div>');
  initSigPad(document.getElementById('sigpad'));
}

function initSigPad(c) {
  var ctx = c.getContext('2d');
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#172B39';
  c.style.touchAction = 'none';
  var drawing = false;
  var pos = function (e) {
    var r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height };
  };
  c.addEventListener('pointerdown', function (e) {
    drawing = true;
    var p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    c.setPointerCapture(e.pointerId);
  });
  c.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    var p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });
  var stop = function () { drawing = false; };
  c.addEventListener('pointerup', stop);
  c.addEventListener('pointercancel', stop);
  S.sig = c;
}

function saveSignature(slot) {
  var c = S.sig;
  if (!c) return;
  var b64 = c.toDataURL('image/png').split(',')[1];
  var target = S.sigTarget || S.targetId;
  return call('uploadProfileImage', [S.token, target, slot, 'image/png', b64]).then(function () {
    toast('تم حفظ التوقيع.');
    closeModal();
    return afterImageSaved();
  }).catch(handleErr);
}

/* ---------- معاينة الملف للطباعة ---------- */

/* ---------- إجراءات الملف ---------- */

function clearLink(no) {
  askConfirm('حذف رابط مجلد الشواهد لهذا العنصر؟', 'حذف الرابط', function () {
    return call('setElementLink', [S.token, no, '']).then(function () {
      toast('تم حذف الرابط.');
      closeModal();
      return loadElements();
    }).catch(handleErr);
  }, true);
}

function submitPrincipal() {
  askConfirm('إرسال الملف إلى المدير؟ يظهر الملف لحساب المدير بعد الإرسال.', 'إرسال الملف', function () {
    var btn = document.querySelector('#modal [data-act="confirm-yes"]');
    if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الإرسال…'; }
    return call('submitToPrincipal', [S.token]).then(function () {
      closeModal();
      toast('تم إرسال الملف إلى المدير.');
      return go('profile', S.targetId);
    }).catch(function (err) {
      closeModal();
      handleErr(err);
    });
  });
}

/** يعرض صور التواقيع والختم الموجودة في بطاقاتها. */
function loadThumbs() {
  document.querySelectorAll('[data-thumb]').forEach(function (img) {
    var key = img.dataset.thumb, user = img.dataset.user || S.targetId;
    cached('img', user + ':' + key, 'getProfileImage', [S.token, user, key]).then(function (r) {
      if (r) img.src = 'data:' + r.mime + ';base64,' + r.base64;
    }).catch(function () {});
  });
}

/* ---------- تحميل مع ذاكرة مؤقتة للجلسة ---------- */

function cached(store, key, fn, args) {
  var c = S.cache[store];
  if (c[key]) return Promise.resolve(c[key]);
  return call(fn, args).then(function (v) {
    if (v) c[key] = v;
    return v;
  });
}

/* ---------- عرض صفحات PDF كصور (pdf.js) ---------- */

var PDFJS_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var PDF_MAX_PAGES = 20;

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve();
  return new Promise(function (resolve, reject) {
    var sc = document.createElement('script');
    sc.src = PDFJS_LIB;
    sc.onload = resolve;
    sc.onerror = reject;
    document.head.appendChild(sc);
  }).then(function () {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_LIB.replace('pdf.min.js', 'pdf.worker.min.js');
  });
}

function renderPdfPages(base64) {
  var bytes = Uint8Array.from(atob(base64), function (c) { return c.charCodeAt(0); });
  return window.pdfjsLib.getDocument({ data: bytes }).promise.then(function (pdf) {
    var last = Math.min(pdf.numPages, PDF_MAX_PAGES);
    var out = [];
    var next = function (i) {
      if (i > last) return Promise.resolve({ pages: out, total: pdf.numPages });
      return pdf.getPage(i).then(function (page) {
        var vp = page.getViewport({ scale: 1.3 });
        var cv = document.createElement('canvas');
        cv.width = Math.floor(vp.width);
        cv.height = Math.floor(vp.height);
        return page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise.then(function () {
          out.push(cv.toDataURL('image/jpeg', 0.85));
          cv.width = 0;
          cv.height = 0;
          return next(i + 1);
        });
      });
    };
    return next(1);
  });
}

/** يعيد صفحات الملف كصور، أو null إذا تعذّر العرض (فيُذكر اسم الملف فقط). */
function pdfPages(id, base64) {
  var c = S.cache.pdf;
  if (c[id]) return Promise.resolve(c[id]);
  return loadPdfJs().then(function () {
    return renderPdfPages(base64);
  }).then(function (pdf) {
    c[id] = pdf;
    return pdf;
  }).catch(function () { return null; });
}

function loadPreview() {
  return Promise.all([
    call('getFile', [S.token, S.targetId]),
    call('getProfile', [S.token, S.targetId]),
    cached('img', S.targetId + ':ownerSig', 'getProfileImage', [S.token, S.targetId, 'ownerSig']),
    // توقيع المدير وختمه: لمسؤول النظام والمدير فقط، ولا يُطلبان أصلًا في حساب المعلم.
    S.me.role === 'teacher' ? Promise.resolve({}) : call('getPrincipalImages', [S.token, S.targetId]).catch(function () { return {}; })
  ]).then(function (r) {
    var src = function (x) { return x ? 'data:' + x.mime + ';base64,' + x.base64 : ''; };
    var imgs = { ownerSig: src(r[2]), principalSig: src(r[3].sig), stamp: src(r[3].stamp) };
    var evs = [];
    r[0].elements.forEach(function (el) {
      el.evidence.forEach(function (x) {
        if (/^image\//.test(x.mime) || x.mime === 'application/pdf') evs.push(x);
      });
    });
    var jobs = evs.map(function (x) {
      return cached('ev', x.id, 'getEvidenceFile', [S.token, x.id]).then(function (f) {
        if (/^image\//.test(f.mime)) {
          imgs['ev:' + x.id] = 'data:' + f.mime + ';base64,' + f.base64;
          return;
        }
        return pdfPages(x.id, f.base64).then(function (pdf) {
          if (pdf) imgs['pdf:' + x.id] = pdf;
        });
      });
    });
    return Promise.all([loadQrFor(r[0].elements, imgs), Promise.all(jobs)]).then(function () {
      main().innerHTML =
        '<div class="page-head no-print"><h2>معاينة الملف للطباعة</h2>' +
        '<button class="btn primary" type="button" data-act="print">طباعة / حفظ PDF</button></div>' +
        '<div class="notice no-print">تُعرض الصفحة بالهوية البصرية للمدرسة، ومعها الشواهد. الصور تظهر كاملة، وصفحات ملفات PDF تظهر كصور (حتى ٢٠ صفحة لكل ملف). ملفات Word وExcel يُذكر اسمها فقط.</div>' +
        docHTML(r[0], r[1], imgs);
      return paginateDoc(document.getElementById('print-area'));
    });
  }).catch(handleErr);
}

function docHTML(f, p, imgs) {
  var s = f.summary, pr = p.profile;
  var complete = s.counts.filter(function (c) { return c >= 2; }).length;
  var rows = f.elements.map(function (el, i) {
    return '<tr><td>' + d(el.no) + '</td><td>' + esc(el.name) + '</td><td>' + d(el.weight) + '٪</td><td>' + d(s.counts[i]) +
      '</td><td>' + statusOf(s.counts[i])[1] + '</td><td>' + RATING_LABEL[el.rating] + '</td></tr>';
  }).join('');
  var info = [
    ['صفة صاحب الملف', pr.ownerType], ['الفترة', pr.term],
    ['اسم صاحب الملف', pr.ownerName], ['المادة أو التخصص', pr.subject],
    ['المرحلة والصفوف', pr.stage], ['المدرسة', pr.school],
    ['إدارة التعليم أو المكتب', pr.eduOffice], ['اسم مدير المدرسة أو مديرتها', pr.principalName],
    ['الرقم الوظيفي', pr.jobNo], ['العام الدراسي', pr.year]
  ];
  var kv = '';
  for (var i = 0; i < info.length; i += 2) {
    kv += '<tr><th>' + esc(info[i][0]) + '</th><td>' + esc(info[i][1]) + '</td><th>' + esc(info[i + 1][0]) + '</th><td>' + esc(info[i + 1][1]) + '</td></tr>';
  }
  // المستند أوراق A4 ثابتة: الأولى للبيانات، ثم أوراق العناصر (تُبنى بالقياس في paginateDoc)، ثم الورقة الختامية.
  return '<div class="doc-wrap"><div class="doc" id="print-area">' +
    '<section class="a4 a4-first">' +
    '<header class="doc-head" style="background-image:url(assets/header.png)"><div class="doc-head-text"><strong>' + esc(pr.eduOffice || EDU) + '</strong></div><div class="doc-head-tab">' + esc(pr.school || SCHOOL) + '</div></header>' +
    '<div class="doc-title">' +
    '<div><h1>ملف الأداء الوظيفي</h1><p>' + esc(pr.ownerName) + ' · ' + esc(pr.term) + ' · ' + esc(pr.year) + '</p></div></div>' +
    '<section class="doc-sec"><h3>بيانات الملف</h3><table class="kv">' + kv + '</table></section>' +
    '<section class="doc-sec"><h3>ملخص الأداء</h3><table class="kv"><tr><th>جاهزية الشواهد</th><td>' + pct(s.readiness) +
    '</td><th>عناصر مكتملة</th><td>' + d(complete) + ' / ' + d(11) + '</td></tr><tr><th>الشواهد المضافة</th><td>' + d(s.evidenceTotal) +
    '</td><th>التقدير الذاتي الاسترشادي</th><td>' + pct(s.selfScore) + '</td></tr></table></section>' +
    '<section class="doc-sec"><h3>عناصر الأداء</h3><table class="dt"><thead><tr><th>#</th><th>العنصر</th><th>الوزن</th><th>الشواهد</th><th>الحالة</th><th>التقدير الذاتي</th></tr></thead><tbody>' + rows + '</tbody></table></section>' +
    '</section>' +
    '<div class="doc-flow">' + evidenceHTML(f, imgs) + '</div>' +
    '<section class="a4 a4-last">' +
    '<div class="a4-body">' + (pr.message ? '<h3 class="a4-title">رسالة المعلم</h3><p class="doc-msg">' + esc(pr.message) + '</p>' : '') + '</div>' +
    '<div class="doc-end"><section class="doc-sign"><div><span class="muted">توقيع صاحب الملف</span>' + (imgs.ownerSig ? '<img src="' + imgs.ownerSig + '" alt="">' : '<div class="sig-empty"></div>') + '<strong>' + esc(pr.ownerName) + '</strong></div>' +
    // الختم في المنتصف بين التوقيعين، وفوقه كلمة «الختم».
    '<div class="doc-stamp-col"><span class="muted">الختم</span>' + (imgs.stamp ? '<img class="doc-stamp" src="' + imgs.stamp + '" alt="ختم المدرسة">' : '<div class="stamp-empty"></div>') + '</div>' +
    '<div><span class="muted">توقيع مدير المدرسة</span>' + (imgs.principalSig ? '<img src="' + imgs.principalSig + '" alt="">' : '<div class="sig-empty"></div>') + '<strong>' + esc(pr.principalName) + '</strong></div></section>' +
    '<footer class="doc-foot" style="background-image:url(assets/footer.png)"></footer></div>' +
    '</section>' +
    '</div></div>';
}

/** أقل ارتفاع لصفحة PDF مصغَّرة (١٠٥ ملم ≈ نصف صفحة) حتى تبقى مقروءة. */
var MIN_PDF_PX = 105 * 96 / 25.4;

/** يوزّع شواهد كل عنصر على أوراق A4: كل عنصر يبدأ في ورقة جديدة، وإن لم تتسع الورقة لصف شواهد انتقل إلى ورقة تالية. */
function paginateDoc(root) {
  if (!root) return Promise.resolve();
  var flow = root.querySelector('.doc-flow');
  var last = root.querySelector('.a4-last');
  if (!flow || !last) return Promise.resolve();
  // انتظار تحميل الصور حتى تُعرف أبعادها (decode() قد لا يكتمل لصور داخل عنصر مخفي، فنعتمد على load مع مهلة).
  var images = Array.prototype.slice.call(root.querySelectorAll('img'));
  return Promise.all(images.map(function (im) {
    if (im.complete && im.naturalWidth) return Promise.resolve();
    return new Promise(function (resolve) {
      im.addEventListener('load', resolve, { once: true });
      im.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 5000);
    });
  })).then(function () {
    var sheet, body;
    var newSheet = function () {
      sheet = document.createElement('section');
      sheet.className = 'a4 a4-el';
      body = document.createElement('div');
      body.className = 'a4-body';
      sheet.appendChild(body);
      root.insertBefore(sheet, last);
      return body;
    };
    var fits = function () { return sheet.scrollHeight <= sheet.clientHeight + 1; };
    var newGrid = function (multi) {
      var g = document.createElement('div');
      g.className = 'ev-grid' + (multi ? ' multi' : '');
      body.appendChild(g);
      return g;
    };
    Array.prototype.slice.call(flow.children).forEach(function (el, i) {
      newSheet();
      if (i === 0) {
        var t = document.createElement('h3');
        t.className = 'a4-title';
        t.textContent = 'الشواهد';
        body.appendChild(t);
      }
      var head = el.querySelector('.doc-el-head');
      body.appendChild(head);
      var qr = el.querySelector('.doc-qr');
      if (qr) body.appendChild(qr);
      var src = el.querySelector('.ev-src');
      if (!src) {
        body.appendChild(el.querySelector('.doc-none'));
        return;
      }
      var multi = el.dataset.multi === '1';
      var grid = newGrid(multi);
      Array.prototype.slice.call(src.children).forEach(function (row) {
        grid.appendChild(row);
        if (fits() || grid.children.length === 1) return;
        // صفحة PDF لا تتسع: تُصغَّر لتملأ المتبقي من الورقة ما دام لا يقل عن نصف صفحة تقريبًا.
        var page = row.querySelector('.ev-img.page');
        if (page) {
          var room = page.getBoundingClientRect().height - (sheet.scrollHeight - sheet.clientHeight) - 2;
          if (room >= MIN_PDF_PX) {
            page.style.maxHeight = Math.floor(room) + 'px';
            if (fits()) return;
            page.style.maxHeight = '';
          }
        }
        grid.removeChild(row);
        newSheet();
        var cont = head.cloneNode(true);
        var h4 = cont.querySelector('h4');
        if (h4) h4.insertAdjacentHTML('beforeend', ' <span class="muted cont">(تابع)</span>');
        body.appendChild(cont);
        grid = newGrid(multi);
        grid.appendChild(row);
      });
    });
    flow.remove();
  });
}

var QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';

function loadQr() {
  if (window.qrcode) return Promise.resolve();
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = QR_LIB;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function qrDataUrl(text) {
  var q = window.qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createDataURL(4, 0);
}

/** يولّد رموز QR لكل عنصر له رابط مجلد؛ إن تعذر تحميل المكتبة تُطبع الصفحة بدونها. */
function loadQrFor(elements, imgs) {
  var withLink = elements.filter(function (el) { return el.link; });
  if (!withLink.length) return Promise.resolve();
  return loadQr().then(function () {
    withLink.forEach(function (el) { imgs['qr:' + el.no] = qrDataUrl(el.link); });
  }).catch(function () {});
}

function evidenceHTML(f, imgs) {
  return f.elements.map(function (el) {
    var cards = [];
    el.evidence.forEach(function (x) {
      var desc = x.description ? '<p class="ev-desc">' + esc(x.description) + '</p>' : '';
      var head = function (note) {
        return '<div class="ev-meta"><strong>' + esc(x.title) + '</strong>' +
          '<span class="muted">' + esc(x.fileName) + ' · ' + fmtDate(x.uploadedAt) + (note ? ' · ' + note : '') + '</span></div>';
      };
      var pdf = imgs['pdf:' + x.id];
      if (pdf && pdf.pages.length) {
        pdf.pages.forEach(function (src, i) {
          var note = pdf.total > 1 ? 'صفحة ' + d(i + 1) + ' من ' + d(pdf.total) : '';
          cards.push({ pdf: true, html: '<div class="ev-card ev-pdf">' + head(note) + (i === 0 ? desc : '') +
            '<img class="ev-img page" src="' + src + '" alt="' + esc(x.title) + '"></div>' });
        });
        return;
      }
      var src = imgs['ev:' + x.id];
      var body = src
        ? '<img class="ev-img" src="' + src + '" alt="' + esc(x.title) + '">'
        : '<div class="ev-file">مرفق: ' + esc(x.fileName) + ' (' + fmtSize(x.size) + ')</div>';
      cards.push({ pdf: false, html: '<div class="ev-card">' + head('') + desc + body + '</div>' });
    });
    // الصور والملفات الأخرى أولًا ثم صفحات PDF، حتى تجتمع الصور في الورقة الأولى للعنصر.
    cards = cards.filter(function (c) { return !c.pdf; }).concat(cards.filter(function (c) { return c.pdf; }));
    // صفوف الشواهد: كل صفحة PDF في صف، والصور والملفات الأخرى اثنتين في كل صف.
    var rows = [], pair = [];
    var flush = function () {
      if (pair.length) rows.push('<div class="ev-row pair">' + pair.join('') + '</div>');
      pair = [];
    };
    cards.forEach(function (c) {
      if (c.pdf) { flush(); rows.push('<div class="ev-row">' + c.html + '</div>'); return; }
      pair.push(c.html);
      if (pair.length === 2) flush();
    });
    flush();
    if (cards.length === 1 && !cards[0].pdf) rows = ['<div class="ev-row">' + cards[0].html + '</div>'];
    var qr = imgs['qr:' + el.no]
      ? '<div class="doc-qr"><img src="' + imgs['qr:' + el.no] + '" alt=""><span>امسح لعرض كل الشواهد</span></div>'
      : '';
    var head = '<div class="doc-el-head"><span class="doc-el-no">' + d(el.no) + '</span>' +
      '<h4>' + esc(el.name) + '</h4><span class="muted">الوزن ' + d(el.weight) + '٪</span></div>';
    return '<div class="doc-el" data-multi="' + (cards.length > 1 ? '1' : '0') + '">' + head + qr +
      (rows.length ? '<div class="ev-src">' + rows.join('') + '</div>' : '<p class="doc-none">لا توجد شواهد لهذا العنصر.</p>') + '</div>';
  }).join('');
}

/* ---------- النسخ الاحتياطي ---------- */

function renderBackup() {
  var who = S.me.role === 'admin' ? 'جميع الحسابات والملفات' : 'ملفك فقط';
  main().innerHTML =
    '<div class="page-head"><h2>النسخ الاحتياطي</h2></div>' +
    '<section class="card"><h3>تنزيل نسخة احتياطية</h3>' +
    '<p class="muted" style="margin:0">تشمل النسخة: ' + who + '، من بيانات الملف والتقديرات وسجلات الشواهد. لا تحتوي كلمات المرور. ملفات الشواهد نفسها محفوظة في مخزن ملفات النظام، ويُذكر مسار كل ملف في النسخة.</p>' +
    '<div><button class="btn primary" type="button" data-act="backup">تنزيل نسخة احتياطية (JSON)</button></div></section>';
}

function downloadBackup() {
  return call('exportBackup', [S.token]).then(function (b) {
    var day = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }), 'backup-' + day + '.json');
    toast('تم تجهيز النسخة الاحتياطية.');
  }).catch(handleErr);
}

/* ---------- المدير ومسؤول النظام ---------- */

function loadTeachers() {
  return call('listUsers', [S.token]).then(function (users) {
    S.users = users;
    renderTeachers();
  }).catch(handleErr);
}

function renderTeachers() {
  var list = S.users.filter(function (u) { return u.role === 'teacher'; });
  var rows = list.map(function (u) {
    var s = u.summary;
    return '<tr><td>' + esc(u.name) + '<br><span class="muted">' + (u.submitted ? 'أرسل ملفه إلى المدير' : 'لم يرسل ملفه بعد') + '</span></td><td dir="ltr">' + esc(u.username) + '</td>' +
      '<td><div class="meter"><span style="width:' + s.readiness + '%"></span></div><span class="muted">' + pct(s.readiness) + '</span></td>' +
      '<td>' + d(s.evidenceTotal) + '</td><td>' + (u.active ? 'فعّال' : 'موقوف') + '</td>' +
      '<td><div class="grade-cell"><input class="grade-input" type="number" inputmode="decimal" min="0" max="5" step="0.5" dir="ltr" data-id="' + esc(u.id) + '" value="' + (u.grade === null ? '' : u.grade) + '" aria-label="الدرجة المستحقة من ٥ للمعلم ' + esc(u.name) + '"><span class="grade-state muted" data-for="' + esc(u.id) + '"></span></div></td>' +
      '<td><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" type="button" data-act="open" data-id="' + esc(u.id) + '"' +
      (S.me.role === 'principal' && !u.submitted ? ' disabled title="يفتح بعد إرسال المعلم ملفه"' : '') + '>فتح الملف</button>' +
      '<button class="btn small" type="button" data-act="note" data-id="' + esc(u.id) + '" data-name="' + esc(u.name) + '">ملاحظة</button></div></td></tr>';
  }).join('');
  main().innerHTML = '<section class="card"><h2>المعلمون</h2>' +
    (list.length
      ? '<div class="table-wrap"><table><thead><tr><th>الاسم</th><th>اسم الدخول</th><th>الجاهزية</th><th>الشواهد</th><th>الحالة</th><th>الدرجة المستحقة (من ٥)</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<p class="muted" style="margin:0">الدرجة تُحفظ تلقائيًا عند كتابتها، ولا يراها المعلم. «ملاحظة» ترسل رسالة تظهر للمعلم في تبويب «رسائل المدير».</p>'
      : '<div class="empty">' + (S.me.role === 'principal' ? 'لم يُسنَد إليك معلمون بعد. يحدد مسؤول النظام المعلمين الذين تتابعهم.' : 'لا توجد حسابات معلمين بعد. أضفها من تبويب الحسابات.') + '</div>') +
    '</section>';
}

/** حفظ الدرجة تلقائيًا بعد توقف الكتابة قليلًا. */
var gradeTimers = {};
function scheduleGrade(input) {
  var id = input.dataset.id;
  var state = document.querySelector('.grade-state[data-for="' + id + '"]');
  clearTimeout(gradeTimers[id]);
  var raw = String(input.value).trim();
  var val = raw === '' ? null : Number(raw);
  if (val !== null && (isNaN(val) || val < 0 || val > 5 || Math.round(val * 2) !== val * 2)) {
    if (state) { state.textContent = 'من ٠ إلى ٥ بخطوة نصف'; state.className = 'grade-state err'; }
    return;
  }
  if (state) { state.textContent = '…'; state.className = 'grade-state muted'; }
  gradeTimers[id] = setTimeout(function () {
    call('setGrade', [S.token, id, val]).then(function () {
      var u = S.users.filter(function (x) { return x.id === id; })[0];
      if (u) u.grade = val;
      if (state) { state.textContent = 'حُفظت ✓'; state.className = 'grade-state ok'; }
    }).catch(function (err) {
      if (state) { state.textContent = 'لم تُحفظ'; state.className = 'grade-state err'; }
      handleErr(err);
    });
  }, 700);
}

/** نافذة ملاحظات المدير لمعلم: الملاحظات السابقة مرقّمة مع حالة القراءة، ونموذج لإرسال ملاحظة جديدة. */
function openNote(teacherId, name) {
  openModal('<div class="modal-head"><div><h2>ملاحظة للمعلم</h2><span class="muted">' + esc(name) + '</span></div>' +
    '<button class="btn small" type="button" data-act="close">إغلاق</button></div>' +
    '<div id="note-history" class="notice">جارٍ التحميل…</div>' +
    '<form class="col" data-action="note" data-id="' + esc(teacherId) + '" data-name="' + esc(name) + '">' +
    '<label>نص الملاحظة<textarea name="body" rows="4" maxlength="2000" required></textarea></label>' +
    '<div class="form-actions"><button class="btn" type="button" data-act="close">إلغاء</button><button class="btn primary" type="submit">إرسال</button></div></form>');
  // مسؤول النظام يرى كل الرسائل الواردة للمعلم (من أي مدير) ويستطيع حذفها. المدير يرى ما أرسله هو.
  var admin = S.me.role === 'admin';
  call(admin ? 'messagesTo' : 'sentMessages', [S.token, teacherId]).then(function (list) {
    var box = document.getElementById('note-history');
    if (!box) return;
    box.className = 'msg-list';
    box.innerHTML = list.length
      ? list.slice().reverse().map(function (m) {
          return '<div class="msg"><div class="msg-head"><strong>' + (admin ? 'رسالة' : 'ملاحظة') + ' رقم ' + d(m.no) + '</strong><span class="muted">' +
            (admin && m.from ? esc(m.from) + ' · ' : '') + esc(fmtDate(m.createdAt)) + ' · ' + (m.read ? 'قُرئت' : 'لم تُقرأ بعد') + '</span></div><p>' + esc(m.body) + '</p>' +
            (admin ? '<div class="form-actions"><button class="btn small danger" type="button" data-act="del-msg" data-id="' + esc(m.id) + '" data-teacher="' + esc(teacherId) + '" data-name="' + esc(name) + '">حذف الرسالة</button></div>' : '') + '</div>';
        }).join('')
      : '<p class="muted" style="margin:0">' + (admin ? 'لا توجد رسائل لهذا المعلم.' : 'لم ترسل لهذا المعلم ملاحظات بعد.') + '</p>';
  }).catch(handleErr);
}

/* ---------- رسائل المدير (عند المعلم) ---------- */

function loadMessages() {
  return call('listMessages').then(function (list) {
    var unread = list.filter(function (m) { return !m.read; }).length;
    main().innerHTML = '<div class="page-head"><h2>رسائل المدير</h2></div>' +
      (list.length
        ? '<div class="msg-list">' + list.slice().reverse().map(function (m) {
            return '<article class="msg' + (m.read ? '' : ' unread') + '"><div class="msg-head"><strong>رسالة رقم ' + d(m.no) + (m.read ? '' : ' <span class="badge">جديدة</span>') + '</strong>' +
              '<span class="muted">' + esc(m.from) + ' · ' + esc(fmtDate(m.createdAt)) + '</span></div><p>' + esc(m.body) + '</p></article>';
          }).join('') + '</div>'
        : '<div class="empty">لا توجد رسائل من المدير بعد.</div>');
    if (unread) {
      return call('markMessagesRead').then(function () { S.unread = 0; renderNav(); });
    }
  }).catch(handleErr);
}

function loadAccounts() {
  return call('listUsers', [S.token]).then(function (users) {
    S.users = users;
    renderAccounts();
  }).catch(handleErr);
}

function renderAccounts() {
  var rows = S.users.map(function (u) {
    var self = u.id === S.me.id;
    var assign = u.role === 'principal'
      ? '<button class="btn small" type="button" data-act="assign" data-id="' + esc(u.id) + '">المعلمون المسندون (' + d(u.teacherIds.length) + ')</button>' : '';
    var imgCell = function (slot, has, label) {
      return '<div class="sig-slot"><span class="muted">' + label + '</span>' +
        (has ? '<img class="sig-mini" data-thumb="' + slot + '" data-user="' + esc(u.id) + '" alt="' + label + ' ' + esc(u.name) + '">' : '<span class="sig-none">—</span>') +
        '<span class="sig-btns"><button class="btn small" type="button" data-act="pick-img" data-slot="' + slot + '" data-id="' + esc(u.id) + '">رفع</button>' +
        (slot === 'ownerSig' ? '<button class="btn small" type="button" data-act="sign" data-slot="' + slot + '" data-id="' + esc(u.id) + '">رسم</button>' : '') + '</span></div>';
    };
    var sigs = '<div class="sig-cell">' + imgCell('ownerSig', u.hasSig, 'التوقيع') + (u.role === 'principal' ? imgCell('stamp', u.hasStamp, 'الختم') : '') + '</div>';
    return '<tr><td>' + esc(u.name) + '</td><td dir="ltr">' + esc(u.username) + '</td><td>' + ROLE_LABEL[u.role] + '</td>' +
      '<td>' + sigs + '</td>' +
      '<td>' + (u.active ? 'فعّال' : 'موقوف') + '</td><td><div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn small" type="button" data-act="reset" data-id="' + esc(u.id) + '" data-name="' + esc(u.name) + '">تعيين كلمة مرور</button>' +
      assign +
      (self ? '' : '<button class="btn small" type="button" data-act="toggle" data-id="' + esc(u.id) + '" data-active="' + (u.active ? '1' : '0') + '">' + (u.active ? 'إيقاف' : 'تفعيل') + '</button>') +
      (u.role === 'teacher' ? '<button class="btn small" type="button" data-act="open" data-id="' + esc(u.id) + '">فتح الملف</button>' : '') +
      (self ? '' : '<button class="btn small danger" type="button" data-act="del-user" data-id="' + esc(u.id) + '" data-name="' + esc(u.name) + '">حذف</button>') +
      '</div></td></tr>';
  }).join('');
  main().innerHTML =
    '<section class="card"><h2>إضافة حساب</h2>' +
    '<form class="row" data-action="account">' +
    '<label>الاسم الكامل<input name="name" required></label>' +
    '<label>اسم الدخول<input name="username" dir="ltr" required></label>' +
    '<label>كلمة المرور الأولية<input name="password" type="password" minlength="8" required></label>' +
    '<label>الصلاحية<select name="role"><option value="teacher">معلم</option><option value="principal">مدير</option><option value="admin">مسؤول النظام</option></select></label>' +
    '<button class="btn primary" type="submit">إنشاء الحساب</button></form>' +
    '<p class="muted">المعلم يرى ملفه فقط. المدير يرى المعلمين الذين تسندهم إليه أنت. مسؤول النظام يرى الجميع.</p></section>' +
    '<section class="card"><h2>الحسابات</h2><div class="table-wrap"><table><thead><tr><th>الاسم</th><th>اسم الدخول</th><th>الصلاحية</th><th>التوقيع والختم</th><th>الحالة</th><th></th></tr></thead><tbody>' +
    rows + '</tbody></table></div>' +
    '<p class="muted" style="margin:0">توقيع كل حساب وختم المدير يُرفعان من هنا مباشرة. توقيع المدير وختمه يظهران في ملفات معلميه لك وللمدير فقط، لا للمعلم.</p></section>';
  loadThumbs();
}

function openAssign(principalId) {
  var principal = S.users.filter(function (u) { return u.id === principalId; })[0];
  var teachers = S.users.filter(function (u) { return u.role === 'teacher'; });
  var chosen = principal ? principal.teacherIds : [];
  var list = teachers.length
    ? teachers.map(function (t) {
        return '<label class="check"><input type="checkbox" name="teacher" value="' + esc(t.id) + '"' + (chosen.indexOf(t.id) !== -1 ? ' checked' : '') + '> ' + esc(t.name) + ' <span class="muted" dir="ltr">' + esc(t.username) + '</span></label>';
      }).join('')
    : '<p class="muted">لا توجد حسابات معلمين بعد.</p>';
  openModal('<div class="modal-head"><div><h2>المعلمون الذين يتابعهم المدير</h2><span class="muted">' + esc(principal ? principal.name : '') + '</span></div>' +
    '<button class="btn small" type="button" data-act="close">إغلاق</button></div>' +
    '<form class="col" data-action="assign" data-id="' + esc(principalId) + '">' + list +
    '<div class="form-actions"><button class="btn" type="button" data-act="close">إلغاء</button><button class="btn primary" type="submit">حفظ</button></div></form>');
}

/* ---------- نوافذ كلمات المرور ---------- */

function openPasswordModal() {
  openModal('<h2>تغيير كلمة المرور</h2>' +
    '<form class="col" data-action="password">' +
    '<label>كلمة المرور الحالية<input name="old" type="password" required></label>' +
    '<label>كلمة المرور الجديدة<input name="next" type="password" minlength="8" required></label>' +
    '<label>تأكيد الجديدة<input name="confirm" type="password" minlength="8" required></label>' +
    '<div style="display:flex;gap:10px;justify-content:flex-end">' +
    '<button class="btn" type="button" data-act="close">إلغاء</button>' +
    '<button class="btn primary" type="submit">حفظ</button></div></form>');
}

function openResetModal(id, name) {
  openModal('<h2>كلمة مرور جديدة</h2><p class="muted">لـ ' + esc(name) + '</p>' +
    '<form class="col" data-action="reset" data-id="' + esc(id) + '">' +
    '<label>كلمة المرور الجديدة<input name="next" type="password" minlength="8" required></label>' +
    '<label>تأكيد الكلمة<input name="confirm" type="password" minlength="8" required></label>' +
    '<div style="display:flex;gap:10px;justify-content:flex-end">' +
    '<button class="btn" type="button" data-act="close">إلغاء</button>' +
    '<button class="btn primary" type="submit">حفظ</button></div></form>');
}

function logout() {
  var token = S.token;
  sessionStorage.removeItem('ptoken');
  S.token = null;
  S.me = null;
  S.prefetch = null;
  S.cache = { img: {}, ev: {}, pdf: {} };
  call('logout', [token]).catch(function () {}).then(renderLogin);
}

/* ---------- الأحداث ---------- */

document.addEventListener('click', function (e) {
  var t = e.target.closest('[data-act]');
  if (!t) return;
  var a = t.dataset.act;
  if (a === 'tab') return go(t.dataset.view, S.targetId);
  if (a === 'elem') return openElement(Number(t.dataset.element));
  if (a === 'idea') {
    var titleInput = document.querySelector('.sheet input[name="title"]');
    if (titleInput) { titleInput.value = t.dataset.idea; titleInput.focus(); }
    return;
  }
  if (a === 'open') return go('elements', t.dataset.id);
  if (a === 'logout') return logout();
  if (a === 'pwd') return openPasswordModal();
  if (a === 'show-register') return renderRegister();
  if (a === 'show-login') return renderLogin();
  if (a === 'close') return closeModal();
  if (a === 'confirm-yes') {
    var onYes = S.onConfirm;
    S.onConfirm = null;
    return onYes ? onYes() : closeModal();
  }
  if (a === 'print') return window.print();
  if (a === 'rate') return readRatingAndSave(Number(t.dataset.element), Number(t.dataset.value));
  if (a === 'view') return viewEvidence(t.dataset.id);
  if (a === 'del') return deleteEvidence(t.dataset.id);
  if (a === 'edit-ev') return openEvidenceEdit(t.dataset.id);
  if (a === 'clear-link') return clearLink(Number(t.dataset.element));
  if (a === 'submit-principal') return submitPrincipal();
  if (a === 'reset') return openResetModal(t.dataset.id, t.dataset.name);
  if (a === 'backup') return downloadBackup();
  if (a === 'assign') return openAssign(t.dataset.id);
  if (a === 'pick-img') return pickImage(t.dataset.slot, t.dataset.id);
  if (a === 'sign') return openSignature(t.dataset.slot, t.dataset.id);
  if (a === 'note') return openNote(t.dataset.id, t.dataset.name);
  if (a === 'del-msg') {
    var msgId = t.dataset.id, teacher = t.dataset.teacher, tname = t.dataset.name;
    return askConfirm('حذف هذه الرسالة نهائيًا؟ تختفي من حساب المعلم ومن سجل المدير.', 'حذف الرسالة', function () {
      return call('deleteMessage', [S.token, msgId]).then(function () {
        toast('حُذفت الرسالة.');
        openNote(teacher, tname);
      }).catch(handleErr);
    }, true);
  }
  if (a === 'del-user') {
    var uid = t.dataset.id, uname = t.dataset.name;
    return askConfirm('حذف حساب «' + uname + '» نهائيًا؟ يُحذف معه ملفه وشواهده وتوقيعه ورسائله ودرجته، ولا يمكن التراجع. إن أردت منعه من الدخول فقط فاستخدم «إيقاف».', 'حذف نهائي', function () {
      var btn = document.querySelector('#modal [data-act="confirm-yes"]');
      if (btn) { btn.disabled = true; btn.textContent = 'جارٍ الحذف…'; }
      return call('deleteAccount', [S.token, uid]).then(function () {
        closeModal();
        toast('حُذف الحساب.');
        return loadAccounts();
      }).catch(function (err) { closeModal(); handleErr(err); });
    }, true);
  }
  if (a === 'sig-clear') {
    if (S.sig) S.sig.getContext('2d').clearRect(0, 0, S.sig.width, S.sig.height);
    return;
  }
  if (a === 'sig-save') return saveSignature(t.dataset.slot);
  if (a === 'toggle') {
    var nowActive = t.dataset.active === '1';
    return call('setActive', [S.token, t.dataset.id, !nowActive])
      .then(function () { toast('تم تحديث الحساب.'); return loadAccounts(); })
      .catch(handleErr);
  }
});

document.addEventListener('input', function (e) {
  if (e.target.classList && e.target.classList.contains('grade-input')) scheduleGrade(e.target);
});

// إظهار حقل الكتابة عند اختيار «أخرى» في القوائم المنسدلة.
document.addEventListener('change', function (e) {
  var sel = e.target;
  if (sel.tagName !== 'SELECT' || sel.dataset.other !== '1') return;
  var other = sel.form && sel.form.querySelector('[name="' + sel.name + '__other"]');
  if (other) {
    other.hidden = sel.value !== OTHER;
    if (!other.hidden) other.focus();
  }
  if (sel.name === 'school') applySchool(sel.form);
});

document.addEventListener('submit', function (e) {
  var form = e.target;
  var action = form.dataset.action;
  if (!action) return;
  e.preventDefault();
  var fd = new FormData(form);
  var val = function (k) { return String(fd.get(k) || '').trim(); };
  var raw = function (k) { return String(fd.get(k) || ''); };

  if (action === 'upload') return upload(form);

  if (action === 'link') {
    return call('setElementLink', [S.token, Number(form.dataset.element), val('url')]).then(function () {
      toast('تم حفظ رابط المجلد.');
      closeModal();
      return loadElements();
    }).catch(handleErr);
  }

  if (action === 'edit-ev') {
    return call('updateEvidence', [S.token, form.dataset.id, val('title'), raw('description').trim()]).then(function () {
      toast('تم حفظ الشاهد.');
      closeModal();
      return loadElements();
    }).catch(handleErr);
  }

  if (action === 'setup') {
    if (raw('password') !== raw('confirm')) return toast('كلمتا المرور غير متطابقتين.', 'err');
    return call('setupAdmin', [val('name'), val('username'), raw('password')]).then(function () {
      toast('تم إنشاء حساب المسؤول. سجّل الدخول الآن.');
      renderLogin();
    }).catch(handleErr);
  }

  if (action === 'register') {
    if (raw('password') !== raw('confirm')) return toast('كلمتا المرور غير متطابقتين.', 'err');
    var regBtn = form.querySelector('button[type="submit"]');
    regBtn.disabled = true;
    regBtn.textContent = 'جارٍ إنشاء الحساب…';
    return call('register', [val('name'), val('username'), raw('password')]).then(function (r) {
      S.token = r.token;
      S.me = r.user;
      S.prefetch = r.file;
      toast('تم إنشاء حسابك. أهلًا بك.');
      enter();
    }).catch(function (err) {
      regBtn.disabled = false;
      regBtn.textContent = 'إنشاء الحساب والدخول';
      handleErr(err);
    });
  }

  if (action === 'login') {
    var loginBtn = form.querySelector('button[type="submit"]');
    loginBtn.disabled = true;
    loginBtn.textContent = 'جارٍ الدخول…';
    return call('login', [val('username'), raw('password')]).then(function (r) {
      S.token = r.token;
      S.me = r.user;
      S.prefetch = r.file;
      sessionStorage.setItem('ptoken', r.token);
      enter();
    }).catch(function (err) {
      loginBtn.disabled = false;
      loginBtn.textContent = 'دخول';
      handleErr(err);
    });
  }

  if (action === 'account') {
    return call('createAccount', [S.token, val('name'), val('username'), raw('password'), val('role')]).then(function () {
      toast('تم إنشاء الحساب.');
      form.reset();
      return loadAccounts();
    }).catch(handleErr);
  }

  if (action === 'password') {
    if (raw('next') !== raw('confirm')) return toast('كلمتا المرور الجديدتان غير متطابقتين.', 'err');
    return call('changeMyPassword', [S.token, raw('old'), raw('next')]).then(function () {
      closeModal();
      toast('تم تغيير كلمة المرور.');
    }).catch(handleErr);
  }

  if (action === 'reset') {
    if (raw('next') !== raw('confirm')) return toast('كلمتا المرور غير متطابقتين.', 'err');
    return call('resetPassword', [S.token, form.dataset.id, raw('next')]).then(function () {
      closeModal();
      toast('تم تعيين كلمة المرور الجديدة.');
      return loadAccounts();
    }).catch(handleErr);
  }

  if (action === 'profile') {
    var data = {};
    // نموذج المدير يحوي بعض الحقول فقط (data-fields)، فلا تُمسح الحقول الأخرى.
    var only = form.dataset.fields ? form.dataset.fields.split(',') : null;
    var fieldsIn = PROFILE_FIELDS.filter(function (f) { return !only || only.indexOf(f.key) !== -1; });
    fieldsIn.forEach(function (f) {
      data[f.key] = val(f.key) === OTHER ? val(f.key + '__other') : val(f.key);
    });
    var missing = fieldsIn.filter(function (f) { return f.other && val(f.key) === OTHER && !val(f.key + '__other'); })[0];
    if (missing) return toast('اكتب ' + missing.label + ' في الحقل الظاهر تحت «أخرى».', 'err');
    if (!only) data.message = raw('message').trim();
    // اسم المدير من الدليل إن كانت المدرسة مسجلة (ولو عُدّل الحقل بطريقة ما).
    var entry = !only && schoolEntry(data.school);
    if (entry) data.principalName = entry.principalName;
    return call('saveProfile', [S.token, data, S.targetId]).then(function () {
      toast('تم حفظ بيانات الملف.');
      return loadProfileView();
    }).catch(handleErr);
  }

  if (action === 'note') {
    var noteBtn = form.querySelector('button[type="submit"]');
    noteBtn.disabled = true;
    return call('sendMessage', [S.token, form.dataset.id, raw('body')]).then(function () {
      toast('أُرسلت الملاحظة إلى المعلم.');
      openNote(form.dataset.id, form.dataset.name);
    }).catch(function (err) {
      noteBtn.disabled = false;
      handleErr(err);
    });
  }

  if (action === 'assign') {
    var ids = fd.getAll('teacher').map(String);
    return call('setPrincipalTeachers', [S.token, form.dataset.id, ids]).then(function () {
      closeModal();
      toast('تم حفظ المعلمين المسندين.');
      return loadAccounts();
    }).catch(handleErr);
  }
});

boot();
