/* طبقة الاتصال بـ Supabase.
 * تحل محل خادم Google Apps Script، وتوفر الدالة call(fn, args) بالأسماء والردود نفسها
 * التي كانت الشاشات تستخدمها، حتى تبقى الشاشات في app.js دون تغيير يُذكر.
 * المفتاح هنا عام (publishable)، والحماية الفعلية في قواعد RLS داخل قاعدة البيانات. */

var SUPABASE_URL = 'https://ejlcjmqsxqjztampixpq.supabase.co';
var SUPABASE_KEY = 'sb_publishable_Eyv09toudVtIvWs3gPStig_okTgIVu2';

/* يجب أن تطابق supabase/functions/_shared/auth-email.ts حرفيًا. */
var AUTH_EMAIL_DOMAIN = 'users.performance-file.invalid';

/* عناصر الأداء حسب صفة صاحب الملف: ELEMENT_SETS وelementsFor في lists.js. */

/* مسارات الصور في حاوية images، وأعمدتها في جدول profiles. */
var IMAGE_SLOTS = {
  ownerSig: { file: 'owner_sig', column: 'owner_sig_path' },
  principalSig: { file: 'principal_sig', column: 'principal_sig_path' },
  stamp: { file: 'stamp', column: 'stamp_path' }
};
var IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

var PROFILE_MAP = {
  ownerType: 'owner_type', ownerName: 'owner_name', stage: 'stage', subject: 'subject', school: 'school',
  principalName: 'principal_name', reviewerTitle: 'reviewer_title', eduOffice: 'edu_office', jobNo: 'job_no', year: 'year', term: 'term', message: 'message'
};

var SESSION_EXPIRED = 'انتهت الجلسة، سجّل الدخول من جديد.';

var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true }
});

/* ---------- أدوات داخلية ---------- */

function sbUsernameToEmail(username) {
  var bytes = new TextEncoder().encode(String(username == null ? '' : username).trim().toLowerCase());
  return crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
    var hex = Array.from(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return 'u' + hex.slice(0, 40) + '@' + AUTH_EMAIL_DOMAIN;
  });
}

/** يحوّل خطأ Supabase إلى رسالة عربية مفهومة. */
function sbFail(error, fallback) {
  if (!error) return;
  var status = error.status || error.code;
  var msg = String(error.message || '');
  if (status === 401 || status === 'PGRST301' || /JWT|jwt|session/i.test(msg)) throw new Error(SESSION_EXPIRED);
  if (status === '42501' || /row-level security|permission denied/i.test(msg)) throw new Error('لا تملك صلاحية تنفيذ هذه العملية.');
  if (/Failed to fetch|NetworkError|network/i.test(msg)) throw new Error('تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.');
  throw new Error(fallback || 'حدث خطأ في الخادم.');
}

function sbData(res, fallback) {
  sbFail(res.error, fallback);
  return res.data;
}

function sbMe() {
  return sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (!s) throw new Error(SESSION_EXPIRED);
    return s.user.id;
  });
}

function sbB64ToBlob(b64, mime) {
  var bytes = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}

function sbBlobToB64(blob) {
  return new Promise(function (resolve, reject) {
    var fr = new FileReader();
    fr.onload = function () { resolve(String(fr.result).split(',')[1] || ''); };
    fr.onerror = function () { reject(new Error('تعذّرت قراءة الملف.')); };
    fr.readAsDataURL(blob);
  });
}

function sbUuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  var b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = Array.from(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

/** الجاهزية: شاهدان لكل عنصر يكملانه، موزونة بوزن العنصر. التقدير الذاتي: التقدير من ٥ موزونًا بالوزن. */
function sbSummary(counts, ratings, elements) {
  var ready = 0, self = 0, total = 0;
  elements.forEach(function (el, i) {
    ready += el.weight * Math.min(counts[i], 2) / 2;
    self += el.weight * (ratings[i] || 0) / 5;
    total += counts[i];
  });
  return { counts: counts, readiness: Math.round(ready), evidenceTotal: total, selfScore: Math.round(self) };
}

function sbUserRow(id) {
  return sb.from('users').select('id, username, name, role, active').eq('id', id).maybeSingle().then(function (r) {
    var u = sbData(r);
    if (!u) throw new Error('الحساب غير موجود أو لا تملك صلاحية عرضه.');
    return u;
  });
}

function sbFunction(name, body) {
  return sb.functions.invoke(name, { body: body }).then(function (r) {
    if (!r.error) return r.data;
    var ctx = r.error.context;
    if (ctx && typeof ctx.json === 'function') {
      return ctx.json().then(function (j) { throw new Error((j && j.error) || 'حدث خطأ في الخادم.'); },
        function () { throw new Error('حدث خطأ في الخادم.'); });
    }
    throw new Error('تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.');
  });
}

/* ---------- العمليات (بالأسماء التي تستخدمها الشاشات) ---------- */

var API = {};

API.getState = function () { return Promise.resolve({ setupNeeded: false }); };

API.setupAdmin = function (name, username, password) {
  return sbFunction('setup-admin', { name: name, username: username, password: password });
};

/** التسجيل الذاتي: ينشئ حساب معلم ثم يسجّل دخوله. */
API.register = function (name, username, password) {
  return sbFunction('register', { name: name, username: username, password: password }).then(function () {
    return API.login(username, password);
  });
};

API.login = function (username, password) {
  return sbUsernameToEmail(username).then(function (email) {
    return sb.auth.signInWithPassword({ email: email, password: password });
  }).then(function (r) {
    if (r.error) {
      if (/Failed to fetch|network/i.test(r.error.message || '')) throw new Error('تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.');
      throw new Error('اسم الدخول أو كلمة المرور غير صحيحة، أو الحساب موقوف.');
    }
    return API.resume();
  });
};

/** يستأنف الجلسة المحفوظة في المتصفح. */
API.resume = function () {
  return sbMe().then(function (id) {
    return sb.from('users').select('id, username, name, role, active').eq('id', id).maybeSingle();
  }).then(function (r) {
    var u = sbData(r);
    if (!u || !u.active) {
      return sb.auth.signOut().then(function () { throw new Error('الحساب موقوف. راجع مسؤول النظام.'); });
    }
    return { token: 'supabase', user: u, file: null };
  });
};

API.logout = function () { return sb.auth.signOut(); };

API.getFile = function (_t, targetId) {
  var me;
  return sbMe().then(function (id) {
    me = id;
    return Promise.all([
      sbUserRow(targetId),
      sb.from('evidence').select('id, element, title, description, file_name, mime, size, uploaded_at').eq('user_id', targetId).order('uploaded_at'),
      sb.from('ratings').select('element, rating').eq('user_id', targetId),
      sb.from('links').select('element, url').eq('user_id', targetId),
      sb.from('profiles').select('owner_type').eq('user_id', targetId).maybeSingle()
    ]);
  }).then(function (r) {
    var owner = r[0], evs = sbData(r[1]), rts = sbData(r[2]), lks = sbData(r[3]);
    // بلا صفة محفوظة: حساب المدير «مدير مدرسة»، وغيره «معلم».
    var ownerType = (sbData(r[4]) || {}).owner_type || (owner.role === 'principal' ? 'مدير مدرسة' : 'معلم');
    var elements = elementsFor(ownerType).map(function (el) {
      var rating = rts.filter(function (x) { return x.element === el.no; })[0];
      var link = lks.filter(function (x) { return x.element === el.no; })[0];
      return {
        no: el.no, name: el.name, weight: el.weight,
        rating: rating ? rating.rating : 0,
        link: link ? link.url : '',
        evidence: evs.filter(function (x) { return x.element === el.no; }).map(function (x) {
          return { id: x.id, title: x.title, description: x.description, fileName: x.file_name, mime: x.mime, size: x.size, uploadedAt: x.uploaded_at };
        })
      };
    });
    var summary = sbSummary(
      elements.map(function (el) { return el.evidence.length; }),
      elements.map(function (el) { return el.rating; }),
      elements
    );
    return { owner: { id: owner.id, name: owner.name, username: owner.username }, ownerType: ownerType, editable: targetId === me, elements: elements, summary: summary };
  });
};

API.setRating = function (_t, no, value) {
  return sbMe().then(function (id) {
    return sb.from('ratings').upsert({ user_id: id, element: no, rating: value }, { onConflict: 'user_id,element' });
  }).then(function (r) { sbData(r, 'تعذّر حفظ التقدير.'); return true; });
};

API.uploadEvidence = function (_t, element, title, fileName, mime, b64, desc) {
  var me, path, blob = sbB64ToBlob(b64, mime);
  return sbMe().then(function (id) {
    me = id;
    var ext = String(fileName).split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
    path = me + '/' + sbUuid() + '.' + ext;
    return sb.storage.from('evidence').upload(path, blob, { contentType: mime || 'application/octet-stream', upsert: false });
  }).then(function (r) {
    sbData(r, 'تعذّر رفع الملف.');
    return sb.from('evidence').insert({
      user_id: me, element: element, title: title, description: desc || '',
      file_path: path, file_name: fileName, mime: mime || 'application/octet-stream', size: blob.size
    });
  }).then(function (r) {
    if (r.error) {
      return sb.storage.from('evidence').remove([path]).then(function () { sbFail(r.error, 'تعذّر حفظ الشاهد.'); });
    }
    return true;
  });
};

API.updateEvidence = function (_t, id, title, desc) {
  return sb.from('evidence').update({ title: title, description: desc || '' }).eq('id', id).select('id').then(function (r) {
    if (!sbData(r, 'تعذّر حفظ الشاهد.').length) throw new Error('لا تملك صلاحية تعديل هذا الشاهد.');
    return true;
  });
};

API.deleteEvidence = function (_t, id) {
  return sb.from('evidence').delete().eq('id', id).select('file_path').then(function (r) {
    var rows = sbData(r, 'تعذّر حذف الشاهد.');
    if (!rows.length) throw new Error('لا تملك صلاحية حذف هذا الشاهد.');
    return sb.storage.from('evidence').remove([rows[0].file_path]).then(function () { return true; });
  });
};

API.getEvidenceFile = function (_t, id) {
  var meta;
  return sb.from('evidence').select('file_path, file_name, mime').eq('id', id).maybeSingle().then(function (r) {
    meta = sbData(r);
    if (!meta) throw new Error('الشاهد غير موجود أو لا تملك صلاحية عرضه.');
    return sb.storage.from('evidence').download(meta.file_path);
  }).then(function (r) {
    return sbBlobToB64(sbData(r, 'تعذّر تنزيل الملف.'));
  }).then(function (b64) {
    return { base64: b64, mime: meta.mime, fileName: meta.file_name };
  });
};

API.setElementLink = function (_t, no, url) {
  return sbMe().then(function (id) {
    if (!url) return sb.from('links').delete().eq('user_id', id).eq('element', no);
    if (!/^https:\/\/(drive|docs)\.google\.com\//.test(url) || url.length > 300) {
      throw new Error('الرابط يجب أن يكون رابط Google Drive أو Docs يبدأ بـ https.');
    }
    return sb.from('links').upsert({ user_id: id, element: no, url: url }, { onConflict: 'user_id,element' });
  }).then(function (r) { sbData(r, 'تعذّر حفظ الرابط.'); return true; });
};

API.getProfile = function (_t, targetId) {
  var me;
  return sbMe().then(function (id) {
    me = id;
    return Promise.all([
      sbUserRow(targetId),
      sb.from('profiles').select('*').eq('user_id', targetId).maybeSingle(),
      sb.from('submissions').select('sent_at').eq('user_id', targetId).maybeSingle()
    ]);
  }).then(function (r) {
    var owner = r[0], p = sbData(r[1]) || {}, sub = sbData(r[2]);
    var profile = {};
    Object.keys(PROFILE_MAP).forEach(function (k) { profile[k] = p[PROFILE_MAP[k]] || ''; });
    if (!profile.ownerType) profile.ownerType = owner.role === 'principal' ? 'مدير مدرسة' : 'معلم';
    return {
      owner: { id: owner.id, name: owner.name, username: owner.username, role: owner.role },
      editable: targetId === me,
      profile: profile,
      images: { ownerSig: !!p.owner_sig_path, principalSig: !!p.principal_sig_path, stamp: !!p.stamp_path },
      sentAt: sub ? sub.sent_at : null
    };
  });
};

/** يحفظ الحقول المرسلة فقط. targetId لمسؤول النظام حين يعدّل ملف غيره (وإلا فملف المستخدم نفسه). */
API.saveProfile = function (_t, data, targetId) {
  return sbMe().then(function (id) {
    var row = {};
    Object.keys(PROFILE_MAP).forEach(function (k) {
      if (k in data) row[PROFILE_MAP[k]] = String(data[k] == null ? '' : data[k]).slice(0, k === 'message' ? 2000 : 150);
    });
    return sb.from('profiles').update(row).eq('user_id', targetId || id).select('user_id');
  }).then(function (r) {
    if (!sbData(r, 'تعذّر حفظ بيانات الملف.').length) throw new Error('لا تملك صلاحية تعديل هذا الملف.');
    return true;
  });
};

/** دليل المدارس: { school, principalName, eduOffice } من ملفات المديرين. */
API.schoolDirectory = function () {
  return sb.rpc('school_directory').then(function (r) {
    return (sbData(r) || []).map(function (x) { return { school: x.school, principalName: x.principal_name, eduOffice: x.edu_office }; });
  });
};

/** كل الرسائل الواردة لمعلم (لمسؤول النظام)، مع اسم المرسل. */
API.messagesTo = function (_t, teacherId) {
  return sb.from('messages').select('id, from_id, body, created_at, read_at').eq('to_id', teacherId).order('created_at').then(function (r) {
    var rows = sbData(r, 'تعذّر تحميل الرسائل.');
    var ids = rows.map(function (m) { return m.from_id; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    return (ids.length ? sb.from('users').select('id, name').in('id', ids) : Promise.resolve({ data: [] })).then(function (n) {
      var map = {};
      (n.data || []).forEach(function (u) { map[u.id] = u.name; });
      return rows.map(function (m, i) {
        return { id: m.id, no: i + 1, from: m.from_id ? (map[m.from_id] || '') : 'مدير محذوف', body: m.body, createdAt: m.created_at, read: !!m.read_at };
      });
    });
  });
};

API.deleteMessage = function (_t, id) {
  return sb.from('messages').delete().eq('id', id).select('id').then(function (r) {
    if (!sbData(r, 'تعذّر حذف الرسالة.').length) throw new Error('لا تملك صلاحية حذف هذه الرسالة.');
    return true;
  });
};

/** حذف حساب نهائيًا (لمسؤول النظام): ملفاته في التخزين أولًا، ثم الحساب وكل سجلاته. */
API.deleteAccount = function (_t, userId) {
  var wipe = function (bucket) {
    return sb.storage.from(bucket).list(userId, { limit: 1000 }).then(function (r) {
      var names = (r.data || []).map(function (o) { return userId + '/' + o.name; });
      return names.length ? sb.storage.from(bucket).remove(names) : null;
    });
  };
  return Promise.all([wipe('evidence'), wipe('images')]).then(function () {
    return sbFunction('admin-users', { action: 'delete', id: userId });
  });
};

API.uploadProfileImage = function (_t, targetId, slot, mime, b64) {
  var s = IMAGE_SLOTS[slot], ext = IMAGE_EXT[mime];
  if (!s) return Promise.reject(new Error('نوع الصورة غير معروف.'));
  if (!ext) return Promise.reject(new Error('الصيغ المسموحة: PNG وJPEG وWebP.'));
  var path = targetId + '/' + s.file + '.' + ext;
  return sb.storage.from('images').upload(path, sbB64ToBlob(b64, mime), { contentType: mime, upsert: true }).then(function (r) {
    sbData(r, 'تعذّر رفع الصورة. تأكد من الصلاحية وأن حجمها أقل من ١ ميغابايت.');
    var row = {};
    row[s.column] = path;
    return sb.from('profiles').update(row).eq('user_id', targetId).select('user_id');
  }).then(function (r) {
    if (!sbData(r, 'تعذّر حفظ الصورة في الملف.').length) throw new Error('لا تملك صلاحية تعديل هذا الملف.');
    return true;
  });
};

API.getProfileImage = function (_t, targetId, slot) {
  var s = IMAGE_SLOTS[slot], mime;
  if (!s) return Promise.resolve(null);
  return sb.from('profiles').select(s.column).eq('user_id', targetId).maybeSingle().then(function (r) {
    var p = sbData(r);
    var path = p && p[s.column];
    if (!path) return null;
    var ext = path.split('.').pop();
    mime = ext === 'jpg' ? 'image/jpeg' : 'image/' + ext;
    return sb.storage.from('images').download(path).then(function (d) {
      if (d.error) return null;
      return sbBlobToB64(d.data).then(function (b64) { return { mime: mime, base64: b64 }; });
    });
  });
};

/** توقيع المدير المسند للمعلم وختمه (من ملف المدير). لا يصل إليهما المعلم أصلًا (principal_of تعيد null له). */
API.getPrincipalImages = function (_t, teacherId) {
  return sb.rpc('principal_of', { teacher: teacherId }).then(function (r) {
    var pid = sbData(r);
    if (!pid) return {};
    return Promise.all([
      API.getProfileImage(null, pid, 'ownerSig'),
      API.getProfileImage(null, pid, 'stamp'),
      sb.from('users').select('name').eq('id', pid).maybeSingle()
    ]).then(function (x) {
      var u = x[2] && x[2].data;
      return { sig: x[0], stamp: x[1], name: u ? u.name : '' };
    });
  });
};

/** أسماء المدارس المسجلة في النظام (لقائمة «المدرسة»). */
API.schoolNames = function () {
  return sb.rpc('school_names').then(function (r) {
    return (sbData(r) || []).map(function (x) { return typeof x === 'string' ? x : x.school_names; }).filter(Boolean);
  });
};

/* ---------- الرسائل ---------- */

/** رسائل المستخدم الواردة، مرقّمة من الأقدم (رقم ١) إلى الأحدث. */
API.listMessages = function () {
  return sbMe().then(function (id) {
    return sb.from('messages').select('id, from_id, body, created_at, read_at').eq('to_id', id).order('created_at');
  }).then(function (r) {
    var rows = sbData(r, 'تعذّر تحميل الرسائل.');
    var ids = rows.map(function (m) { return m.from_id; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var names = ids.length ? sb.from('users').select('id, name').in('id', ids) : Promise.resolve({ data: [] });
    return names.then(function (n) {
      var map = {};
      (n.data || []).forEach(function (u) { map[u.id] = u.name; });
      return rows.map(function (m, i) {
        return { id: m.id, no: i + 1, from: m.from_id ? (map[m.from_id] || 'المدير') : 'مدير محذوف', body: m.body, createdAt: m.created_at, read: !!m.read_at };
      });
    });
  });
};

API.unreadCount = function () {
  return sbMe().then(function (id) {
    return sb.from('messages').select('id', { count: 'exact', head: true }).eq('to_id', id).is('read_at', null);
  }).then(function (r) { sbFail(r.error); return r.count || 0; });
};

API.markMessagesRead = function () {
  return sbMe().then(function (id) {
    return sb.from('messages').update({ read_at: new Date().toISOString() }).eq('to_id', id).is('read_at', null);
  }).then(function (r) { sbFail(r.error); return true; });
};

API.sendMessage = function (_t, toId, body) {
  body = String(body || '').trim();
  if (!body) return Promise.reject(new Error('اكتب نص الملاحظة.'));
  return sbMe().then(function (id) {
    return sb.from('messages').insert({ from_id: id, to_id: toId, body: body.slice(0, 2000) });
  }).then(function (r) { sbData(r, 'تعذّر إرسال الملاحظة.'); return true; });
};

/** الملاحظات التي أرسلها المستخدم إلى معلم معيّن، مع حالة القراءة. */
API.sentMessages = function (_t, toId) {
  return sbMe().then(function (id) {
    return sb.from('messages').select('id, body, created_at, read_at').eq('from_id', id).eq('to_id', toId).order('created_at');
  }).then(function (r) {
    return sbData(r, 'تعذّر تحميل الملاحظات.').map(function (m, i) {
      return { id: m.id, no: i + 1, body: m.body, createdAt: m.created_at, read: !!m.read_at };
    });
  });
};

/* ---------- الدرجة المستحقة من ٥ ---------- */

/** grade رقم من ٠ إلى ٥ (بخطوة نصف)، أو null لحذف الدرجة. */
API.setGrade = function (_t, teacherId, grade) {
  return sbMe().then(function (id) {
    if (grade === null) return sb.from('grades').delete().eq('teacher_id', teacherId);
    if (!(grade >= 0 && grade <= 5)) throw new Error('الدرجة من ٠ إلى ٥.');
    return sb.from('grades').upsert({ teacher_id: teacherId, grade: grade, principal_id: id }, { onConflict: 'teacher_id' });
  }).then(function (r) { sbData(r, 'تعذّر حفظ الدرجة.'); return true; });
};

API.submitToPrincipal = function () {
  return sbMe().then(function (id) {
    return sb.from('submissions').upsert({ user_id: id, sent_at: new Date().toISOString() }, { onConflict: 'user_id' });
  }).then(function (r) { sbData(r, 'تعذّر إرسال الملف.'); return true; });
};

API.listUsers = function () {
  return Promise.all([
    sb.from('users').select('id, username, name, role, active').order('name'),
    sb.rpc('file_summaries'),
    sb.from('submissions').select('user_id'),
    sb.from('access').select('principal_id, teacher_id'),
    sb.from('grades').select('teacher_id, grade'),
    sb.from('profiles').select('user_id, owner_sig_path, stamp_path')
  ]).then(function (r) {
    var users = sbData(r[0]), sums = sbData(r[1]) || [], subs = sbData(r[2]) || [], acc = sbData(r[3]) || [];
    var grades = sbData(r[4]) || [], profs = sbData(r[5]) || [];
    return users.map(function (u) {
      var counts = [], ratings = [];
      var mine = sums.filter(function (x) { return x.user_id === u.id; });
      var els = elementsFor(mine.length ? mine[0].owner_type : '');
      els.forEach(function (el, i) {
        var row = sums.filter(function (x) { return x.user_id === u.id && x.element === el.no; })[0];
        counts[i] = row ? row.evidence_count : 0;
        ratings[i] = row ? row.rating : 0;
      });
      return {
        id: u.id, username: u.username, name: u.name, role: u.role, active: u.active,
        submitted: subs.some(function (s) { return s.user_id === u.id; }),
        summary: sbSummary(counts, ratings, els), ownerType: mine.length ? mine[0].owner_type : "",
        teacherIds: acc.filter(function (a) { return a.principal_id === u.id; }).map(function (a) { return a.teacher_id; }),
        grade: (function () { var g = grades.filter(function (x) { return x.teacher_id === u.id; })[0]; return g ? Number(g.grade) : null; })(),
        hasSig: profs.some(function (p) { return p.user_id === u.id && p.owner_sig_path; }),
        hasStamp: profs.some(function (p) { return p.user_id === u.id && p.stamp_path; })
      };
    });
  });
};

API.setPrincipalTeachers = function (_t, principalId, ids) {
  return sb.from('access').delete().eq('principal_id', principalId).then(function (r) {
    sbData(r, 'تعذّر حفظ الإسناد.');
    if (!ids.length) return { error: null };
    return sb.from('access').insert(ids.map(function (t) { return { principal_id: principalId, teacher_id: t }; }));
  }).then(function (r) { sbData(r, 'تعذّر حفظ الإسناد.'); return true; });
};

API.createAccount = function (_t, name, username, password, role) {
  return sbFunction('admin-users', { action: 'create', name: name, username: username, password: password, role: role });
};

API.resetPassword = function (_t, id, password) {
  return sbFunction('admin-users', { action: 'reset_password', id: id, password: password });
};

API.setActive = function (_t, id, active) {
  return sbFunction('admin-users', { action: 'set_active', id: id, active: active });
};

/** يتحقق من كلمة المرور الحالية بتسجيل دخول جديد، ثم يغيّرها. */
API.changeMyPassword = function (_t, oldPassword, newPassword) {
  var email;
  return sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (!s) throw new Error(SESSION_EXPIRED);
    email = s.user.email;
    return sb.auth.signInWithPassword({ email: email, password: oldPassword });
  }).then(function (r) {
    if (r.error) throw new Error('كلمة المرور الحالية غير صحيحة.');
    return sb.auth.updateUser({ password: newPassword });
  }).then(function (r) {
    if (r.error) throw new Error('تعذّر تغيير كلمة المرور. استخدم ٨ أحرف على الأقل.');
    return true;
  });
};

/** نسخة احتياطية بما يسمح به الدور: كل شيء لمسؤول النظام، وملف المستخدم وحده لغيره. */
API.exportBackup = function () {
  var tables = ['users', 'profiles', 'evidence', 'ratings', 'links', 'access', 'submissions', 'messages', 'grades'];
  return Promise.all(tables.map(function (t) { return sb.from(t).select('*'); })).then(function (r) {
    var out = { exportedAt: new Date().toISOString(), source: 'supabase', elementSets: ELEMENT_SETS };
    tables.forEach(function (t, i) { out[t] = sbData(r[i], 'تعذّر تجهيز النسخة الاحتياطية.'); });
    return out;
  });
};

/** نقطة الدخول التي تستدعيها الشاشات. */
function call(fn, args) {
  var f = API[fn];
  if (!f) return Promise.reject(new Error('عملية غير معروفة: ' + fn));
  var timer;
  var timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () { reject(new Error('تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.')); }, 30000);
  });
  return Promise.race([Promise.resolve().then(function () { return f.apply(null, args || []); }), timeout])
    .then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; });
}
