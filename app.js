/* مشروع الاداء الوظيفي — واجهة التطبيق (PWA).
 * تتصل بخادم Google Apps Script عبر طلبات POST بصيغة JSON.
 * عدّل API_URL بعد كل نشر جديد لخادم Apps Script إذا تغير الرابط. */

var API_URL = 'https://script.google.com/macros/s/AKfycbyVtKFCBZGYzVaj5o7JwxljHpfO234jgEbtmkC0mll0DrVvxWOe3maGosskzKZu4txRjg/exec';
var SCHOOL = 'عروة بن الزبير الابتدائية';
var EDU = 'الإدارة العامة للتعليم بمحافظة جدة';
var MAX_BYTES = 4 * 1024 * 1024;
var ROLE_LABEL = { teacher: 'معلم', principal: 'مدير', admin: 'مسؤول النظام' };
var RATING_LABEL = ['لم يُقيَّم', 'ضعيف', 'مقبول', 'جيد', 'جيد جدًا', 'ممتاز'];
var MIME = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};
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
var S = { token: null, me: null, view: null, file: null, users: [] };

/* ---------- الاتصال بالخادم ---------- */

function call(fn, args) {
  return fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ fn: fn, args: args || [] })
  }).then(function (r) {
    if (!r.ok) throw new Error('تعذّر الوصول إلى الخادم (' + r.status + ').');
    return r.json();
  }).then(function (res) {
    if (res.error) throw new Error(res.error);
    return res.result;
  }, function () {
    throw new Error('تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.');
  });
}

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
}

function readBase64(file) {
  return new Promise(function (resolve, reject) {
    var fr = new FileReader();
    fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
    fr.onerror = function () { reject(new Error('تعذّرت قراءة الملف.')); };
    fr.readAsDataURL(file);
  });
}

/* ---------- الدخول والإعداد ---------- */

function boot() {
  call('getState').then(function (st) {
    if (st.setupNeeded) return renderSetup();
    S.token = sessionStorage.getItem('ptoken');
    if (!S.token) return renderLogin();
    return call('whoami', [S.token]).then(function (me) {
      S.me = me;
      enter();
    }, function () {
      sessionStorage.removeItem('ptoken');
      S.token = null;
      renderLogin();
    });
  }).catch(function (err) {
    document.getElementById('app').innerHTML = '<div class="error-box">' + esc(err.message) + '</div>';
  });
}

function renderSetup() {
  document.getElementById('app').innerHTML =
    '<section class="card auth">' +
    '<div class="brand"><h1>ملف الأداء الوظيفي</h1><span class="muted">' + esc(SCHOOL) + '</span></div>' +
    '<p class="muted">أول تشغيل للنظام: أنشئ حساب مسؤول النظام. يُنشأ هذا الحساب مرة واحدة فقط، ومنه تُضاف حسابات المعلمين.</p>' +
    '<form class="col" data-action="setup">' +
    '<label>الاسم الكامل<input name="name" required></label>' +
    '<label>اسم الدخول<input name="username" dir="ltr" required pattern="[a-z][a-z0-9._-]{2,29}" title="حروف إنجليزية صغيرة وأرقام، ويبدأ بحرف"></label>' +
    '<label>كلمة المرور<input name="password" type="password" minlength="6" required></label>' +
    '<label>تأكيد كلمة المرور<input name="confirm" type="password" minlength="6" required></label>' +
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
    '</section>';
}

function enter() {
  shell();
  S.view = S.me.role === 'teacher' ? 'mine' : 'teachers';
  go(S.view);
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

function renderNav() {
  var nav = document.getElementById('nav');
  if (!nav) return;
  var items = [];
  if (S.me.role !== 'teacher') items.push(['teachers', 'المعلمون']);
  if (S.me.role === 'admin') items.push(['accounts', 'الحسابات']);
  items.push(['mine', 'ملفي']);
  nav.innerHTML = items.map(function (it) {
    return '<button class="tab" type="button" data-act="tab" data-view="' + it[0] + '" aria-current="' +
      (S.view === it[0] ? 'true' : 'false') + '">' + it[1] + '</button>';
  }).join('');
}

function go(view, id) {
  S.view = view;
  renderNav();
  if (view === 'teachers') return loadTeachers();
  if (view === 'accounts') return loadAccounts();
  return loadFile(view === 'mine' ? S.me.id : id);
}

/* ---------- ملف المعلم ---------- */

function loadFile(id) {
  main().classList.add('busy');
  return call('getFile', [S.token, id]).then(function (f) {
    S.file = f;
    renderFile();
  }).catch(handleErr).then(function () {
    main().classList.remove('busy');
  });
}

function statusOf(c) {
  return c >= 2 ? ['pill-done', 'مكتمل'] : (c === 1 ? ['pill-partial', 'ناقص شاهد'] : ['pill-none', 'بلا شواهد']);
}

function renderFile() {
  var f = S.file, s = f.summary, mine = f.editable;
  var complete = s.counts.filter(function (c) { return c >= 2; }).length;
  var cards = f.elements.map(function (el, i) { return renderElement(el, s.counts[i]); }).join('');
  var rows = f.elements.map(function (el, i) {
    var c = s.counts[i];
    return '<tr><td>' + d(el.no) + '</td><td>' + esc(el.name) + '</td><td>' + d(el.weight) + '٪</td><td>' + d(c) +
      '</td><td>' + statusOf(c)[1] + '</td><td>' + RATING_LABEL[el.rating] + '</td></tr>';
  }).join('');
  main().innerHTML =
    '<div class="page-head no-print"><h2>' + esc(mine ? 'عناصر الأداء والشواهد' : 'ملف ' + f.owner.name) + '</h2>' +
    '<button class="btn primary" type="button" data-act="print">طباعة / PDF</button></div>' +
    '<div class="notice no-print">' + (mine ? 'أنت تستعرض ملفك. اضغط على أي عنصر لرفع شواهده وتقييم نفسك فيه.' : 'تعرض هذه الصفحة ملف المعلم للقراءة فقط.') + '</div>' +
    '<div class="print-only cover"><h2>' + esc(SCHOOL) + '</h2><p>ملف الأداء الوظيفي: ' + esc(f.owner.name) + '</p><p class="muted">' + esc(EDU) + '</p></div>' +
    '<div class="stats">' +
    '<div class="card stat"><span class="muted">جاهزية الشواهد</span><span class="stat-num">' + pct(s.readiness) + '</span><div class="meter"><span style="width:' + s.readiness + '%"></span></div></div>' +
    '<div class="card stat"><span class="muted">عناصر مكتملة</span><span class="stat-num">' + d(complete) + ' / ' + d(11) + '</span><span class="muted">شاهدان فأكثر لكل عنصر</span></div>' +
    '<div class="card stat"><span class="muted">الشواهد المضافة</span><span class="stat-num">' + d(s.evidenceTotal) + '</span><span class="muted">التقدير الذاتي الاسترشادي: ' + pct(s.selfScore) + '</span></div>' +
    '</div>' +
    '<div class="grid no-print">' + cards + '</div>' +
    '<div class="print-only card"><table class="print-table"><thead><tr><th>#</th><th>العنصر</th><th>الوزن</th><th>الشواهد</th><th>الحالة</th><th>التقدير الذاتي</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function renderElement(el, count) {
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
        return '<li><span><strong>' + esc(x.title) + '</strong><br><span class="muted">' + esc(x.fileName) + ' · ' + fmtSize(x.size) + ' · ' + fmtDate(x.uploadedAt) + '</span></span>' +
          '<span style="display:flex;gap:8px"><button class="btn small" type="button" data-act="view" data-id="' + esc(x.id) + '">عرض</button>' +
          (mine ? '<button class="btn small danger" type="button" data-act="del" data-id="' + esc(x.id) + '">حذف</button>' : '') + '</span></li>';
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
      '<label>الملف<input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx"></label>' +
      '<button class="btn primary" type="submit">رفع الشاهد</button></form>' +
      '<p class="muted" style="margin:0">الحد الأقصى ٤ ميغابايت. الصيغ: PDF وصور وWord وExcel وPowerPoint.</p></div>'
    : '';
  var ratings = mine
    ? '<div class="section-box"><h3>التقدير الذاتي</h3><div class="ratings" role="group" aria-label="التقدير الذاتي">' +
      [1, 2, 3, 4, 5].map(function (v) {
        return '<button type="button" data-act="rate" data-element="' + no + '" data-value="' + v + '" aria-pressed="' +
          (el.rating === v ? 'true' : 'false') + '" title="' + RATING_LABEL[v] + '">' + d(v) + '</button>';
      }).join('') + '<span class="muted">' + RATING_LABEL[el.rating] + '</span></div></div>'
    : '<p class="muted">التقدير الذاتي: ' + RATING_LABEL[el.rating] + '</p>';
  openModal('<div class="modal-head"><div><span class="muted">العنصر ' + d(no) + ' · الوزن ' + d(el.weight) + '٪</span><h2>' + esc(el.name) + '</h2></div>' +
    '<button class="btn small" type="button" data-act="close">إغلاق</button></div>' +
    '<div class="section-box"><h3>الشواهد</h3>' + list + '</div>' + ideaBox + upload + ratings);
}

function readRatingAndSave(el, value) {
  var cur = S.file.elements[el - 1].rating;
  var next = cur === value ? 0 : value;
  return call('setRating', [S.token, el, next]).then(function () {
    closeModal();
    return loadFile(S.me.id);
  }).catch(handleErr);
}

function upload(form) {
  var file = form.file.files[0];
  var title = form.title.value.trim();
  if (!file) return toast('اختر ملفًا أولًا.', 'err');
  if (file.size > MAX_BYTES) return toast('حجم الملف أكبر من ٤ ميغابايت.', 'err');
  var mime = file.type === 'image/jpg' ? 'image/jpeg' : (file.type || MIME[ext(file.name)] || '');
  var btn = form.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'جارٍ الرفع…';
  return readBase64(file).then(function (b64) {
    return call('uploadEvidence', [S.token, Number(form.dataset.element), title, file.name, mime, b64]);
  }).then(function () {
    toast('تم رفع الشاهد.');
    closeModal();
    return loadFile(S.me.id);
  }).catch(function (err) {
    btn.disabled = false;
    btn.textContent = 'رفع الشاهد';
    handleErr(err);
  });
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
  if (!confirm('حذف هذا الشاهد نهائيًا؟')) return;
  return call('deleteEvidence', [S.token, id]).then(function () {
    toast('تم حذف الشاهد.');
    closeModal();
    return loadFile(S.me.id);
  }).catch(handleErr);
}

function printFile() { window.print(); }

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
    return '<tr><td>' + esc(u.name) + '</td><td dir="ltr">' + esc(u.username) + '</td>' +
      '<td><div class="meter"><span style="width:' + s.readiness + '%"></span></div><span class="muted">' + pct(s.readiness) + '</span></td>' +
      '<td>' + d(s.evidenceTotal) + '</td><td>' + (u.active ? 'فعّال' : 'موقوف') + '</td>' +
      '<td><button class="btn small" type="button" data-act="open" data-id="' + esc(u.id) + '">فتح الملف</button></td></tr>';
  }).join('');
  main().innerHTML = '<section class="card"><h2>المعلمون</h2>' +
    (list.length
      ? '<div class="table-wrap"><table><thead><tr><th>الاسم</th><th>اسم الدخول</th><th>الجاهزية</th><th>الشواهد</th><th>الحالة</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<div class="empty">لا توجد حسابات معلمين بعد. أضفها من تبويب الحسابات.</div>') +
    '</section>';
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
    return '<tr><td>' + esc(u.name) + '</td><td dir="ltr">' + esc(u.username) + '</td><td>' + ROLE_LABEL[u.role] + '</td>' +
      '<td>' + (u.active ? 'فعّال' : 'موقوف') + '</td><td><div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn small" type="button" data-act="reset" data-id="' + esc(u.id) + '" data-name="' + esc(u.name) + '">تعيين كلمة مرور</button>' +
      (self ? '' : '<button class="btn small" type="button" data-act="toggle" data-id="' + esc(u.id) + '" data-active="' + (u.active ? '1' : '0') + '">' + (u.active ? 'إيقاف' : 'تفعيل') + '</button>') +
      '</div></td></tr>';
  }).join('');
  main().innerHTML =
    '<section class="card"><h2>إضافة حساب</h2>' +
    '<form class="row" data-action="account">' +
    '<label>الاسم الكامل<input name="name" required></label>' +
    '<label>اسم الدخول<input name="username" dir="ltr" required pattern="[a-z][a-z0-9._-]{2,29}" title="حروف إنجليزية صغيرة وأرقام، ويبدأ بحرف"></label>' +
    '<label>كلمة المرور الأولية<input name="password" type="password" minlength="6" required></label>' +
    '<label>الصلاحية<select name="role"><option value="teacher">معلم</option><option value="principal">مدير</option><option value="admin">مسؤول النظام</option></select></label>' +
    '<button class="btn primary" type="submit">إنشاء الحساب</button></form>' +
    '<p class="muted">المعلم يرى ملفه فقط. المدير ومسؤول النظام يرون ملفات الجميع.</p></section>' +
    '<section class="card"><h2>الحسابات</h2><div class="table-wrap"><table><thead><tr><th>الاسم</th><th>اسم الدخول</th><th>الصلاحية</th><th>الحالة</th><th></th></tr></thead><tbody>' +
    rows + '</tbody></table></div></section>';
}

/* ---------- نوافذ الكلمات ---------- */

function openPasswordModal() {
  openModal('<h2>تغيير كلمة المرور</h2>' +
    '<form class="col" data-action="password">' +
    '<label>كلمة المرور الحالية<input name="old" type="password" required></label>' +
    '<label>كلمة المرور الجديدة<input name="next" type="password" minlength="6" required></label>' +
    '<label>تأكيد الجديدة<input name="confirm" type="password" minlength="6" required></label>' +
    '<div style="display:flex;gap:10px;justify-content:flex-end">' +
    '<button class="btn" type="button" data-act="close">إلغاء</button>' +
    '<button class="btn primary" type="submit">حفظ</button></div></form>');
}

function openResetModal(id, name) {
  openModal('<h2>كلمة مرور جديدة</h2><p class="muted">لـ ' + esc(name) + '</p>' +
    '<form class="col" data-action="reset" data-id="' + esc(id) + '">' +
    '<label>كلمة المرور الجديدة<input name="next" type="password" minlength="6" required></label>' +
    '<label>تأكيد الكلمة<input name="confirm" type="password" minlength="6" required></label>' +
    '<div style="display:flex;gap:10px;justify-content:flex-end">' +
    '<button class="btn" type="button" data-act="close">إلغاء</button>' +
    '<button class="btn primary" type="submit">حفظ</button></div></form>');
}

function logout() {
  var token = S.token;
  sessionStorage.removeItem('ptoken');
  S.token = null;
  S.me = null;
  call('logout', [token]).catch(function () {}).then(renderLogin);
}

/* ---------- الأحداث ---------- */

document.addEventListener('click', function (e) {
  var t = e.target.closest('[data-act]');
  if (!t) return;
  var a = t.dataset.act;
  if (a === 'tab') return go(t.dataset.view);
  if (a === 'elem') return openElement(Number(t.dataset.element));
  if (a === 'idea') {
    var titleInput = document.querySelector('.sheet input[name="title"]');
    if (titleInput) { titleInput.value = t.dataset.idea; titleInput.focus(); }
    return;
  }
  if (a === 'open') return go('file', t.dataset.id);
  if (a === 'logout') return logout();
  if (a === 'pwd') return openPasswordModal();
  if (a === 'close') return closeModal();
  if (a === 'print') return printFile();
  if (a === 'rate') return readRatingAndSave(Number(t.dataset.element), Number(t.dataset.value));
  if (a === 'view') return viewEvidence(t.dataset.id);
  if (a === 'del') return deleteEvidence(t.dataset.id);
  if (a === 'reset') return openResetModal(t.dataset.id, t.dataset.name);
  if (a === 'toggle') {
    var nowActive = t.dataset.active === '1';
    return call('setActive', [S.token, t.dataset.id, !nowActive])
      .then(function () { toast('تم تحديث الحساب.'); return loadAccounts(); })
      .catch(handleErr);
  }
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

  if (action === 'setup') {
    if (raw('password') !== raw('confirm')) return toast('كلمتا المرور غير متطابقتين.', 'err');
    return call('setupAdmin', [val('name'), val('username'), raw('password')]).then(function () {
      toast('تم إنشاء حساب المسؤول. سجّل الدخول الآن.');
      renderLogin();
    }).catch(handleErr);
  }

  if (action === 'login') {
    return call('login', [val('username'), raw('password')]).then(function (r) {
      S.token = r.token;
      S.me = r.user;
      sessionStorage.setItem('ptoken', r.token);
      enter();
    }).catch(handleErr);
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
});

boot();
