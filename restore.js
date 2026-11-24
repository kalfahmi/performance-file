/* الاستعادة من ملف النسخة الاحتياطية (لمسؤول النظام).
 * القاعدة: تُضاف السجلات الناقصة فقط، ولا يُعدَّل الموجود ولا يُحذف.
 *  - الحسابات المحذوفة تُعاد بالاسم واسم الدخول نفسيهما وكلمة مرور مؤقتة (كلمات المرور لا تُحفظ في النسخة).
 *    إن وُجد حساب بالاسم نفسه للدخول بمعرّف مختلف، تُربط بياناته به.
 *  - بيانات الملف: تُملأ الحقول الفارغة فقط.
 *  - الشواهد والتوقيعات: تُعاد سجلاتها فقط إن كان ملفها ما زال في التخزين (النسخة لا تحوي الملفات نفسها).
 * يعتمد على sb وsbData وsbFunction وAPI.exportBackup في api.js. */

var RESTORE_TABLES = ['users', 'profiles', 'archives', 'evidence', 'ratings', 'links', 'access', 'submissions', 'messages', 'grades'];
var RESTORE_PROFILE_TEXT = ['owner_type', 'owner_name', 'stage', 'subject', 'school', 'principal_name', 'reviewer_title', 'edu_office', 'job_no', 'year', 'term', 'message'];
var RESTORE_PROFILE_IMAGES = ['owner_sig_path', 'principal_sig_path', 'stamp_path'];

function restoreTempPassword() {
  var chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, function (b) { return chars[b % chars.length]; }).join('');
}

/** مفاتيح كل جدول لمعرفة السجل الموجود (بعد تحويل المعرّفات). */
var RESTORE_KEYS = {
  archives: function (r) { return r.id; },
  evidence: function (r) { return r.id; },
  ratings: function (r) { return r.user_id + ':' + r.element; },
  links: function (r) { return r.user_id + ':' + r.element; },
  access: function (r) { return r.principal_id + ':' + r.teacher_id; },
  submissions: function (r) { return r.user_id; },
  messages: function (r) { return r.id; },
  grades: function (r) { return r.teacher_id; }
};
/** أعمدة المعرّفات التي تشير إلى حسابات في كل جدول. */
var RESTORE_USER_COLS = {
  archives: ['user_id'], evidence: ['user_id'], ratings: ['user_id'], links: ['user_id'], access: ['principal_id', 'teacher_id'],
  submissions: ['user_id'], messages: ['from_id', 'to_id'], grades: ['teacher_id', 'principal_id']
};
/** أعمدة حسابات يجوز أن تكون فارغة: المدير المحذوف تبقى رسائله ودرجاته بلا اسمه. */
var RESTORE_NULLABLE = { messages: { from_id: true }, grades: { principal_id: true } };
var RESTORE_LABELS = {
  users: 'الحسابات', profiles: 'بيانات الملفات', archives: 'الملفات السابقة', evidence: 'الشواهد', ratings: 'التقديرات الذاتية', links: 'روابط المجلدات',
  access: 'إسناد المعلمين', submissions: 'إرسال الملفات', messages: 'رسائل المدير', grades: 'الدرجات'
};

/** يتحقق من أن الملف نسخة احتياطية من هذا النظام. */
function restoreValidate(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error('الملف ليس نسخة احتياطية صحيحة.');
  if (b.source !== 'supabase') throw new Error('هذه النسخة ليست من النظام الحالي (لا تحمل علامة المصدر).');
  if (!Array.isArray(b.users) || !b.users.length) throw new Error('النسخة لا تحوي حسابات.');
  RESTORE_TABLES.forEach(function (t) { if (b[t] != null && !Array.isArray(b[t])) throw new Error('جدول «' + t + '» في النسخة غير صحيح.'); });
}

/** يحوّل معرّفات الحسابات في السجل حسب الخريطة، أو يعيد null إن كان فيه حساب غير معروف. */
function restoreMapRow(table, row, idMap) {
  var out = Object.assign({}, row);
  var cols = RESTORE_USER_COLS[table] || [];
  for (var i = 0; i < cols.length; i++) {
    var v = row[cols[i]];
    if (v == null && RESTORE_NULLABLE[table] && RESTORE_NULLABLE[table][cols[i]]) { out[cols[i]] = null; continue; }
    var mapped = idMap[v];
    if (!mapped) return null;
    out[cols[i]] = mapped;
  }
  return out;
}

/** أسماء الملفات الموجودة في مجلدات الحسابات في حاوية تخزين. */
function restoreListFiles(bucket, userIds) {
  var set = {};
  return Promise.all(userIds.map(function (uid) {
    return sb.storage.from(bucket).list(uid, { limit: 1000 }).then(function (r) {
      (r.data || []).forEach(function (o) { set[uid + '/' + o.name] = true; });
    });
  })).then(function () { return set; });
}

/**
 * يقرأ النسخة ويقارنها بالموجود، ولا يغيّر شيئًا.
 * يعيد خطة: الحسابات الناقصة، وخريطة المعرّفات، وعدد السجلات في النسخة والموجود منها والناقص لكل جدول.
 */
API.restoreAnalyze = function (_t, backup) {
  restoreValidate(backup);
  return API.exportBackup().then(function (cur) {
    var curById = {}, curByUsername = {};
    cur.users.forEach(function (u) { curById[u.id] = u; curByUsername[u.username] = u; });
    var idMap = {}, missingUsers = [], relinked = [];
    backup.users.forEach(function (u) {
      if (curById[u.id]) idMap[u.id] = u.id;
      else if (curByUsername[u.username]) { idMap[u.id] = curByUsername[u.username].id; relinked.push(u); }
      else missingUsers.push(u);
    });
    // لأغراض العدّ: الحسابات الناقصة ستُنشأ، فتُعدّ سجلاتها ناقصة.
    var planMap = Object.assign({}, idMap);
    missingUsers.forEach(function (u) { planMap[u.id] = 'new:' + u.id; });

    var tables = {};
    tables.users = { total: backup.users.length, present: backup.users.length - missingUsers.length, missing: missingUsers.length };
    Object.keys(RESTORE_KEYS).forEach(function (t) {
      var rows = backup[t] || [];
      var have = {};
      (cur[t] || []).forEach(function (r) { have[RESTORE_KEYS[t](r)] = true; });
      var missing = 0, present = 0;
      rows.forEach(function (r) {
        var m = restoreMapRow(t, r, planMap);
        if (m && have[RESTORE_KEYS[t](m)]) present++; else missing++;
      });
      tables[t] = { total: rows.length, present: present, missing: missing };
    });
    var profCount = (backup.profiles || []).length;
    tables.profiles = { total: profCount, present: profCount, missing: 0, note: 'تُملأ الحقول الفارغة فقط' };
    return {
      exportedAt: backup.exportedAt || '',
      idMap: idMap, missingUsers: missingUsers, relinked: relinked,
      tables: tables, backup: backup
    };
  });
};

/** إدخال سجلات على دفعات، ثم سجلًا سجلًا إن فشلت الدفعة، مع عدّ الناجح والفاشل. */
function restoreInsert(table, rows) {
  var ok = 0, failed = 0;
  var chunks = [];
  for (var i = 0; i < rows.length; i += 100) chunks.push(rows.slice(i, i + 100));
  return chunks.reduce(function (p, chunk) {
    return p.then(function () {
      return sb.from(table).insert(chunk).then(function (r) {
        if (!r.error) { ok += chunk.length; return; }
        return chunk.reduce(function (q, row) {
          return q.then(function () {
            return sb.from(table).insert(row).then(function (x) { if (x.error) failed++; else ok++; });
          });
        }, Promise.resolve());
      });
    });
  }, Promise.resolve()).then(function () { return { ok: ok, failed: failed }; });
}

/**
 * ينفّذ الخطة. onStep(نص) لعرض التقدم.
 * يعيد تقريرًا: لكل جدول عدد المستعاد والمتعذر والمتخطى، وكلمات المرور المؤقتة للحسابات المعادة.
 */
API.restoreApply = function (_t, plan, onStep) {
  var b = plan.backup, idMap = Object.assign({}, plan.idMap);
  var report = { users: { ok: 0, failed: 0 }, passwords: [], tables: {} };
  var step = function (msg) { if (onStep) onStep(msg); };

  // ١) الحسابات المحذوفة: تُنشأ من جديد بكلمة مرور مؤقتة.
  return plan.missingUsers.reduce(function (p, u) {
    return p.then(function () {
      step('إعادة حساب ' + u.name + '…');
      var pw = restoreTempPassword();
      return sbFunction('admin-users', { action: 'create', name: u.name, username: u.username, password: pw, role: u.role }).then(function (r) {
        idMap[u.id] = r.id;
        report.users.ok++;
        report.passwords.push({ name: u.name, username: u.username, role: u.role, password: pw });
        if (u.active === false) return sbFunction('admin-users', { action: 'set_active', id: r.id, active: false }).catch(function () {});
      }).catch(function () { report.users.failed++; });
    });
  }, Promise.resolve()).then(function () {
    // ٢) بيانات الملفات: الحقول الفارغة فقط، والصور إن كان ملفها موجودًا.
    step('إكمال بيانات الملفات…');
    var uids = Object.keys(idMap).map(function (k) { return idMap[k]; });
    return Promise.all([
      sb.from('profiles').select('*'),
      restoreListFiles('images', uids),
      restoreListFiles('evidence', uids)
    ]);
  }).then(function (res) {
    var curProfiles = {};
    (sbData(res[0]) || []).forEach(function (p) { curProfiles[p.user_id] = p; });
    var imageFiles = res[1], evidenceFiles = res[2];
    var ok = 0, failed = 0;
    return (b.profiles || []).reduce(function (p, bp) {
      return p.then(function () {
        var uid = idMap[bp.user_id];
        var cur = uid && curProfiles[uid];
        if (!cur) return;
        var patch = {};
        RESTORE_PROFILE_TEXT.forEach(function (c) { if (!cur[c] && bp[c]) patch[c] = bp[c]; });
        RESTORE_PROFILE_IMAGES.forEach(function (c) {
          if (!cur[c] && bp[c] && imageFiles[bp[c]] && bp[c].indexOf(uid + '/') === 0) patch[c] = bp[c];
        });
        if (!Object.keys(patch).length) return;
        return sb.from('profiles').update(patch).eq('user_id', uid).then(function (r) { if (r.error) failed++; else ok++; });
      });
    }, Promise.resolve()).then(function () {
      report.tables.profiles = { ok: ok, failed: failed, skipped: 0 };
      return evidenceFiles;
    });
  }).then(function (evidenceFiles) {
    // ٣) بقية الجداول بالترتيب: ما يعتمد على الحسابات فقط.
    return ['archives', 'evidence', 'ratings', 'links', 'access', 'submissions', 'grades', 'messages'].reduce(function (p, t) {
      return p.then(function () {
        step('استعادة ' + RESTORE_LABELS[t] + '…');
        return sb.from(t).select('*').then(function (r) {
          var have = {};
          (sbData(r) || []).forEach(function (x) { have[RESTORE_KEYS[t](x)] = true; });
          var rows = [], skipped = 0;
          (b[t] || []).forEach(function (row) {
            var m = restoreMapRow(t, row, idMap);
            if (!m) { skipped++; return; }
            if (have[RESTORE_KEYS[t](m)]) return;
            // الشاهد لا يُعاد إلا إن كان ملفه في التخزين وفي مجلد صاحبه.
            if (t === 'evidence' && (!evidenceFiles[m.file_path] || m.file_path.indexOf(m.user_id + '/') !== 0)) { skipped++; return; }
            rows.push(m);
          });
          return restoreInsert(t, rows).then(function (x) {
            report.tables[t] = { ok: x.ok, failed: x.failed, skipped: skipped };
          });
        });
      });
    }, Promise.resolve());
  }).then(function () {
    step('اكتملت الاستعادة.');
    return report;
  });
};
