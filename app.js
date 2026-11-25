/* صفحة التفقد — امتحان التمكين 2026 — إدارة التنمية الثقافية وتعليم الكبار
   إعداد: محمد خشانه
   تعمل بلا إنترنت: قائمة المقر والمسحات محفوظة في الجهاز، وتُرفع إلى البوابة حين يتوفر الاتصال.
   المستودع لا يحوي أي بيانات طلاب؛ كل البيانات تأتي من البوابة بعد الدخول. */
(function () {
  'use strict';
  var CFG = window.ATT_CONFIG || {};
  var K = { auth: 'att_auth', pkg: 'att_pkg', queue: 'att_queue', local: 'att_local', prefs: 'att_prefs', dev: 'att_dev' };
  var S = { auth: null, pkg: null, queue: [], local: {}, prefs: {}, stu: {}, mon: {}, server: {}, tab: 'absent',
            syncing: false, lastSync: '', lastErr: '', cam: null, camOn: false, lastCode: '', lastAt: 0, keyTimes: [] };

  /* ---------- أدوات ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('ذاكرة الجهاز ممتلئة!'); } }
  function digits(s) { return String(s || '').replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }).replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); }); }
  function strip0(s) { return String(s).replace(/^0+/, ''); }
  function norm(s) { return String(s || '').replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim(); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function hm(iso) { var d = new Date(iso); return isNaN(d) ? String(iso || '').slice(-8, -3) : pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function luhnOk(n) {               // n: 10 خانات (الرقم + خانة التحقق)
    var sum = 0, dbl = false;
    for (var i = n.length - 1; i >= 0; i--) { var x = +n.charAt(i); if (dbl) { x *= 2; if (x > 9) x -= 9; } sum += x; dbl = !dbl; }
    return sum % 10 === 0;
  }
  function devId() {
    var d = load(K.dev, '');
    if (!d) { d = 'D' + Math.random().toString(36).slice(2, 8).toUpperCase(); save(K.dev, d); }
    return d;
  }
  function devTxt() { var ua = navigator.userAgent || ''; var m = ua.match(/\(([^)]+)\)/); return devId() + ' ' + (m ? m[1].split(';').slice(0, 2).join(';') : '').slice(0, 45); }

  function api(action, data) {
    data = data || {}; data.action = action;
    if (!CFG.API_URL) return Promise.reject(new Error('رابط البوابة غير مضبوط في config.js'));
    return fetch(CFG.API_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) })
      .then(function (r) { if (!r.ok) throw new Error('خطأ في الاتصال (' + r.status + ')'); return r.json(); })
      .then(function (j) { if (!j.ok) { var e = new Error(j.error || 'خطأ غير معروف'); e.expired = j.expired; throw e; } return j; });
  }

  /* ---------- صوت واهتزاز ---------- */
  var AC = null;
  function beep(kind) {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      var o = AC.createOscillator(), g = AC.createGain();
      o.frequency.value = kind === 'ok' ? 1250 : kind === 'warn' ? 700 : 260;
      o.type = kind === 'bad' ? 'square' : 'sine';
      g.gain.value = 0.15; o.connect(g); g.connect(AC.destination);
      o.start(); o.stop(AC.currentTime + (kind === 'ok' ? 0.12 : kind === 'warn' ? 0.25 : 0.45));
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 60 : kind === 'warn' ? [80, 60, 80] : [250, 80, 250]); } catch (e) {}
  }
  function toast(m) { setStatus('warn', '!', m, '', ''); }

  /* ---------- الحالة المحفوظة ---------- */
  function restore() {
    S.auth = load(K.auth, null); S.pkg = load(K.pkg, null); S.queue = load(K.queue, []); S.local = load(K.local, {}); S.prefs = load(K.prefs, {});
  }
  function index() {
    S.stu = {}; S.mon = {}; S.server = {};
    if (!S.pkg) return;
    S.pkg.students.forEach(function (s) { S.stu[strip0(s.c)] = s; });
    S.pkg.monitors.forEach(function (m) { S.mon[m.c] = m; });
    (S.pkg.server || []).forEach(function (r) { S.server[r[0] + '|' + strip0(r[1])] = { pt: r[2], t: r[3] }; });
  }

  /* ---------- الشاشات ---------- */
  function view(v) {
    ['vLogin', 'vVenue', 'vScan'].forEach(function (id) { $(id).classList.toggle('hidden', id !== v); });
    $('net').classList.toggle('hidden', v !== 'vScan');
  }

  function start() {
    restore();
    if (S.auth && S.pkg) { index(); openScan(); }
    else if (S.auth && S.auth.venues) showVenues();
    else view('vLogin');
  }

  /* ---------- الدخول ---------- */
  $('swLogin').onclick = function () {
    var acct = $('fAcct').classList.contains('hidden');
    $('fAcct').classList.toggle('hidden', !acct); $('fPin').classList.toggle('hidden', acct);
    this.textContent = acct ? 'الدخول برمز المقر' : 'الدخول بحساب رئيس دائرة أو مسؤول';
    $('lErr').textContent = '';
  };
  $('pin').oninput = function () { this.value = digits(this.value).replace(/\D/g, '').slice(0, 6); };
  $('fPin').onsubmit = function (e) {
    e.preventDefault();
    var b = $('bPin'); b.disabled = true; b.textContent = 'جارٍ التنزيل…'; $('lErr').textContent = '';
    api('pin', { pin: $('pin').value, dev: devTxt() }).then(function (j) {
      gotPackage(j, { token: j.token, user: j.user });
    }).catch(function (e) { $('lErr').textContent = e.message; })
      .then(function () { b.disabled = false; b.textContent = 'دخول وتنزيل قائمة المقر'; });
  };
  $('fAcct').onsubmit = function (e) {
    e.preventDefault();
    var b = $('bAcct'); b.disabled = true; b.textContent = 'جارٍ التحقق…'; $('lErr').textContent = '';
    api('acct', { login: $('lg').value.trim(), pass: $('pw').value }).then(function (j) {
      $('pw').value = '';
      S.auth = { token: j.token, user: j.user, venues: j.venues }; save(K.auth, S.auth);
      showVenues();
    }).catch(function (e) { $('lErr').textContent = e.message; })
      .then(function () { b.disabled = false; b.textContent = 'دخول'; });
  };

  function showVenues() {
    view('vVenue');
    var v = S.auth.venues || [];
    $('vlist').innerHTML = v.length ? v.map(function (x) {
      return '<button type="button" data-v="' + esc(x.code) + '"><b>' + esc(x.name) + '</b> — ' + esc(x.code) + '<br><span>' + esc(x.gov) + ' • ' + x.students + ' طالباً</span></button>';
    }).join('') : '<p>لا توجد مقرات فيها طلاب موزعون.</p>';
    Array.prototype.forEach.call($('vlist').querySelectorAll('button'), function (b) {
      b.onclick = function () {
        b.disabled = true; b.querySelector('span').textContent = 'جارٍ التنزيل…';
        api('package', { token: S.auth.token, venue: b.getAttribute('data-v') }).then(function (j) { gotPackage(j, S.auth); })
          .catch(function (e) { if (e.expired) return logout(true, 'انتهت صلاحية الدخول.'); alert(e.message); b.disabled = false; });
      };
    });
  }

  function gotPackage(j, auth) {
    var token = j.token; delete j.token; delete j.ok;
    if (S.pkg && S.pkg.venue !== j.venue && S.queue.length) {
      if (!confirm('في ' + S.queue.length + ' مسحاً من مقر ' + S.pkg.venue + ' لم تُرفع بعد. متابعة ستحذفها؟')) return;
      S.queue = []; save(K.queue, S.queue);
    }
    if (!S.pkg || S.pkg.venue !== j.venue) { S.local = {}; save(K.local, S.local); }
    S.auth = { token: token || auth.token, user: auth.user || j.user, venues: auth.venues };
    S.pkg = j; save(K.auth, S.auth); save(K.pkg, S.pkg);
    index(); openScan();
  }

  function logout(force, msg) {
    if (!force && S.queue.length && !confirm('في ' + S.queue.length + ' مسحاً لم تُرفع بعد. الخروج سيحذفها من هذا الجهاز. متابعة؟')) return;
    if (!force && !confirm('الخروج يحذف قائمة المقر من هذا الجهاز. متابعة؟')) return;
    stopCam();
    [K.auth, K.pkg, K.queue, K.local].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    S.auth = S.pkg = null; S.queue = []; S.local = {};
    view('vLogin'); $('lErr').textContent = msg || '';
  }
  window.logout = logout;

  /* ---------- شاشة التفقد ---------- */
  function openScan() {
    view('vScan');
    var p = S.pkg;
    $('hdr').textContent = p.venueName + ' — ' + p.venue;
    var td = today(), dayNow = 0;
    p.days.forEach(function (d) { if (d.date === td) dayNow = d.d; });
    var sel = S.prefs.venue === p.venue && S.prefs.day ? S.prefs.day : (dayNow || 1);
    if (dayNow) sel = dayNow;
    $('day').innerHTML = p.days.map(function (d) { return '<option value="' + d.d + '"' + (d.d == sel ? ' selected' : '') + '>' + esc(d.label.split(' — ')[0]) + ' — ' + esc(d.subjects) + '</option>'; }).join('');
    $('day').disabled = !!dayNow;
    $('trial').classList.toggle('hidden', !!dayNow);
    $('trial').textContent = 'وضع التجربة: اليوم ليس من أيام الامتحان، فكل مسح يُعلَّم «تجريبي» ويُحذف قبل الامتحان.';
    var pts = '<option value="مدخل">مدخل المقر (كل القاعات)</option>' + p.halls.map(function (h) {
      return '<option value="' + esc(h.code) + '">القاعة ' + esc(h.no) + ' — ' + h.n + ' طالباً</option>';
    }).join('');
    $('pt').innerHTML = pts;
    var pt = S.prefs.venue === p.venue && S.prefs.pt ? S.prefs.pt : (p.halls.length === 1 ? p.halls[0].code : 'مدخل');
    $('pt').value = pt; if (!$('pt').value) $('pt').value = 'مدخل';
    savePrefs();
    setStatus('idle', '▣', 'جاهز للمسح', '', 'امسح رمز QR على بطاقة الطالب أو بطاقة المراقب');
    render(); syncNow(true);
  }
  function savePrefs() { S.prefs = { venue: S.pkg.venue, day: +$('day').value, pt: $('pt').value }; save(K.prefs, S.prefs); }
  $('day').onchange = function () { savePrefs(); render(); };
  $('pt').onchange = function () { savePrefs(); render(); };

  function day() { return +$('day').value || 1; }
  function point() { return $('pt').value || 'مدخل'; }
  function presentRec(d, code) { var k = d + '|' + strip0(code); return S.local[k] || S.server[k] || null; }

  function setStatus(cls, icon, head, big, sub) {
    var el = $('st'); el.className = 'status ' + cls;
    el.innerHTML = '<div class="i">' + icon + '</div><div class="h">' + esc(head) + '</div>' + (big ? '<div>' + big + '</div>' : '') + (sub ? '<div class="x">' + esc(sub) + '</div>' : '');
  }

  /* ---------- المسح ---------- */
  function parse(raw) {
    var s = digits(String(raw || '')).trim().toUpperCase().replace(/\s+/g, '');
    if (/^M[0-9A-F]{8}$/.test(s)) return { k: 'M', c: s };
    var d = s.replace(/\D/g, '');
    if (d.length === 10 && /^\d+$/.test(s)) return luhnOk(d) ? { k: 'S', c: d.slice(0, 9) } : { err: 'رمز البطاقة غير صالح (خانة التحقق لا تطابق).' };
    if (d.length === 9 && /^\d+$/.test(s)) return { k: 'S', c: d };
    return { err: 'رمز غير معروف: ' + s.slice(0, 20) };
  }

  function handle(raw, how, note) {
    var p = parse(raw), d = day(), pt = point();
    if (p.err) { setStatus('bad', '✕', 'غير مقبول', '', p.err); beep('bad'); return; }
    var prev = presentRec(d, p.c);
    if (p.k === 'M') {
      var m = S.mon[p.c];
      if (prev) { setStatus('warn', '⚠', 'مسجّل مسبقاً', '<span class="s">' + esc(m ? m.nm : p.c) + '</span>', 'سُجّل الساعة ' + hm(prev.t) + (prev.pt && prev.pt !== 'مدخل' ? ' في ' + prev.pt : '')); beep('warn'); return; }
      record(p, d, pt, how, note);
      if (m) setStatus('ok', '✓', 'حضور مراقب', '<span class="s"><b>' + esc(m.nm) + '</b><br>' + esc(m.role) + ' — ' + esc(m.h) + '</span>', '');
      else setStatus('bad', '✕', 'مراقب غير معيّن في هذا المقر', '', 'سُجّل وسيُراجَع. رمز ' + p.c);
      beep(m ? 'ok' : 'bad'); render(); return;
    }
    var s = S.stu[strip0(p.c)];
    if (prev) {
      setStatus('warn', '⚠', 'مكرر — حاضر مسبقاً', '<span class="s"><b>' + esc(s ? s.nm : p.c) + '</b></span>',
        'سُجّل الساعة ' + hm(prev.t) + (prev.pt && prev.pt !== 'مدخل' ? ' في ' + prev.pt : ''));
      beep('warn'); return;
    }
    record(p, d, pt, how, note);
    if (!s) {
      setStatus('bad', '✕', 'ليس من طلاب هذا المقر', '<span class="big">' + esc(p.c) + '</span>', 'سُجّل وسيُراجَع. وجّهه إلى منسق المقر.');
      beep('bad');
    } else if (pt !== 'مدخل' && s.h !== pt) {
      setStatus('warn', '⇄', 'قاعة مختلفة — يبقى ويُوسَم', '<span class="s"><b>' + esc(s.nm) + '</b></span>', 'مخصص للقاعة ' + hallNo(s.h) + ' مقعد ' + s.s);
      beep('warn');
    } else {
      setStatus('ok', '✓', s.nm, '<span class="big">' + (pt === 'مدخل' ? 'ق' + hallNo(s.h) + ' • ' : '') + 'م ' + esc(s.s) + '</span>',
        (pt === 'مدخل' ? 'القاعة ' + hallNo(s.h) + ' — ' : '') + 'المقعد ' + s.s + (note ? ' — ' + note : ''));
      beep('ok');
    }
    render();
  }
  function hallNo(code) { var h = S.pkg.halls.filter(function (x) { return x.code === code; })[0]; return h ? h.no : code; }

  function record(p, d, pt, how, note) {
    var t = new Date().toISOString();
    var id = devId() + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    S.local[d + '|' + strip0(p.c)] = { t: t, pt: pt, how: how, k: p.k };
    S.queue.push({ id: id, t: t, d: d, pt: pt, k: p.k, c: p.c, how: how, note: note || '', dev: devTxt() });
    save(K.local, S.local); save(K.queue, S.queue);
    clearTimeout(S.syncT); S.syncT = setTimeout(function () { syncNow(); }, 1500);
  }

  $('fMan').onsubmit = function (e) {
    e.preventDefault();
    var v = $('code').value; if (!v.trim()) return;
    var fast = S.keyTimes.length >= 6 && (S.keyTimes[S.keyTimes.length - 1] - S.keyTimes[0]) / (S.keyTimes.length - 1) < 45;
    handle(v, fast ? 'قارئ' : 'يدوي');
    $('code').value = ''; S.keyTimes = [];
  };
  $('code').addEventListener('keydown', function (e) { if (e.key !== 'Enter') S.keyTimes.push(Date.now()); if (S.keyTimes.length > 20) S.keyTimes.shift(); });

  /* ---------- الكاميرا ---------- */
  $('bCam').onclick = function () { S.camOn ? stopCam() : startCam(); };
  function startCam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('هذا المتصفح لا يدعم الكاميرا. استعمل الإدخال اليدوي أو قارئ USB.'); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then(function (stream) {
        var v = $('vid'); v.srcObject = stream; v.setAttribute('playsinline', ''); v.play();
        S.cam = stream; S.camOn = true; $('camBox').classList.remove('hidden'); $('bCam').textContent = '■ إيقاف الكاميرا';
        var det = null;
        try { if ('BarcodeDetector' in window) det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { det = null; }
        var cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true }), busy = false;
        (function loop() {
          if (!S.camOn) return;
          setTimeout(loop, 220);
          if (busy || v.readyState < 2) return;
          busy = true;
          var done = function (txt) { busy = false; if (txt) onQR(txt); };
          if (det) { det.detect(v).then(function (r) { done(r && r[0] && r[0].rawValue); }).catch(function () { det = null; busy = false; }); return; }
          var w = v.videoWidth, h = v.videoHeight, sc = Math.min(1, 640 / Math.max(w, h));
          cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
          cx.drawImage(v, 0, 0, cv.width, cv.height);
          var img = cx.getImageData(0, 0, cv.width, cv.height), r = window.jsQR ? window.jsQR(img.data, cv.width, cv.height, { inversionAttempts: 'dontInvert' }) : null;
          done(r && r.data);
        })();
      }).catch(function () { toast('لم يُسمح بالكاميرا. اسمح بها من إعدادات المتصفح، أو استعمل الإدخال اليدوي.'); });
  }
  function stopCam() {
    S.camOn = false;
    if (S.cam) S.cam.getTracks().forEach(function (t) { t.stop(); });
    S.cam = null; $('camBox').classList.add('hidden'); $('bCam').textContent = '📷 تشغيل الكاميرا';
  }
  function onQR(txt) {
    var now = Date.now();
    if (txt === S.lastCode && now - S.lastAt < 3000) return;   // نفس البطاقة أمام الكاميرا
    S.lastCode = txt; S.lastAt = now;
    handle(txt, 'QR');
  }

  /* ---------- البحث بالاسم ---------- */
  var picked = null;
  $('bFind').onclick = function () { $('mFind').classList.remove('hidden'); $('q').value = ''; $('res').innerHTML = ''; $('pick').classList.add('hidden'); picked = null; setTimeout(function () { $('q').focus(); }, 60); };
  window.closeFind = function () { $('mFind').classList.add('hidden'); };
  $('q').oninput = function () {
    var q = norm(digits(this.value)); picked = null; $('pick').classList.add('hidden');
    if (q.length < 2) { $('res').innerHTML = ''; return; }
    var isNum = /^\d+$/.test(q), out = [];
    for (var i = 0; i < S.pkg.students.length && out.length < 25; i++) {
      var s = S.pkg.students[i];
      if (isNum ? s.c.indexOf(q) >= 0 : norm(s.nm).indexOf(q) >= 0) out.push(s);
    }
    $('res').innerHTML = out.length ? out.map(function (s) {
      var pr = presentRec(day(), s.c);
      return '<button type="button" data-c="' + s.c + '"><b>' + esc(s.nm) + '</b>' + (pr ? ' <span class="tag w">حاضر</span>' : '') + '<br><small>' + s.c + ' • الأم: ' + esc(s.m || '—') + ' • القاعة ' + esc(hallNo(s.h)) + ' مقعد ' + esc(s.s) + '</small></button>';
    }).join('') : '<p class="note">لا نتائج في قائمة هذا المقر.</p>';
    Array.prototype.forEach.call($('res').querySelectorAll('button'), function (b) {
      b.onclick = function () {
        picked = S.stu[strip0(b.getAttribute('data-c'))];
        $('who').innerHTML = '<b>' + esc(picked.nm) + '</b><br>الأم: ' + esc(picked.m || '—') + '<br>الرقم ' + picked.c + ' • القاعة ' + esc(hallNo(picked.h)) + ' • المقعد ' + esc(picked.s) +
          '<br><small>طابِق الاسم واسم الأم مع الوثيقة قبل التسجيل.</small>';
        $('pick').classList.remove('hidden'); $('res').innerHTML = '';
      };
    });
  };
  $('bMark').onclick = function () {
    if (!picked) return;
    var why = document.querySelector('input[name=why]:checked').value;
    closeFind(); handle(picked.c, 'بحث', why);
  };

  /* ---------- القوائم والعدادات ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
    b.onclick = function () {
      S.tab = b.getAttribute('data-t');
      Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (x) { x.classList.toggle('on', x === b); });
      render();
    };
  });

  function render() {
    if (!S.pkg) return;
    var d = day(), pt = point();
    var stu = S.pkg.students.filter(function (s) { return pt === 'مدخل' || s.h === pt; });
    var pres = [], abs = [];
    stu.forEach(function (s) { var r = presentRec(d, s.c); if (r) pres.push({ s: s, r: r }); else abs.push(s); });
    var mons = S.pkg.monitors.filter(function (m) { return pt === 'مدخل' || m.h === pt; });
    var monP = mons.filter(function (m) { return presentRec(d, m.c); }).length;
    // من سُجّل هنا وليس من هذه القاعة/المقر
    var extra = [];
    Object.keys(S.local).concat(Object.keys(S.server)).forEach(function (k) {
      var parts = k.split('|'); if (+parts[0] !== d) return;
      var rec = S.local[k] || S.server[k]; if (rec.k === 'M' || /^M/.test(parts[1])) return;
      var s = S.stu[parts[1]];
      if ((!s || (pt !== 'مدخل' && s.h !== pt)) && (rec.pt === pt || (pt === 'مدخل' && !s))) {
        if (!extra.some(function (x) { return x.c === parts[1]; })) extra.push({ c: parts[1], s: s, r: rec });
      }
    });
    $('cP').textContent = pres.length + ' من ' + stu.length;
    $('cA').textContent = abs.length;
    $('cM').textContent = monP + ' من ' + mons.length;
    var h = '';
    if (S.tab === 'absent') {
      h = abs.length ? abs.map(function (s) { return row(s.s, s.nm, (pt === 'مدخل' ? 'القاعة ' + hallNo(s.h) + ' • ' : '') + s.c, '', s.c); }).join('') : '<div class="empty">لا غائبين ✔</div>';
    } else if (S.tab === 'present') {
      pres.sort(function (a, b) { return a.r.t < b.r.t ? 1 : -1; });
      h = extra.map(function (x) {
        return row('—', x.s ? x.s.nm : x.c, x.s ? 'مخصص للقاعة ' + hallNo(x.s.h) + ' مقعد ' + x.s.s : 'ليس من طلاب هذا المقر', hm(x.r.t), '', '<span class="tag w">' + (x.s ? 'قاعة مختلفة' : 'للمراجعة') + '</span>');
      }).join('') + (pres.length ? pres.map(function (x) {
        var diff = x.r.pt && x.r.pt !== 'مدخل' && x.r.pt !== x.s.h;
        var q = S.local[d + '|' + strip0(x.s.c)] && S.queue.some(function (z) { return z.d === d && strip0(z.c) === strip0(x.s.c); });
        return row(x.s.s, x.s.nm, (pt === 'مدخل' ? 'القاعة ' + hallNo(x.s.h) + ' • ' : '') + x.s.c, hm(x.r.t), '',
          (diff ? '<span class="tag w">قاعة مختلفة</span>' : '') + (q ? '<span class="tag q">لم يُرفع</span>' : ''));
      }).join('') : (extra.length ? '' : '<div class="empty">لم يُسجَّل أحد بعد.</div>'));
    } else {
      h = mons.length ? mons.map(function (m) {
        var r = presentRec(d, m.c);
        return row(r ? '✓' : '—', m.nm, m.role + ' • ' + m.h, r ? hm(r.t) : 'لم يحضر بعد', '');
      }).join('') : '<div class="empty">لا مراقبين معيّنين لهذا المكان بعد.</div>';
    }
    $('list').innerHTML = h;
    Array.prototype.forEach.call($('list').querySelectorAll('.row.click'), function (el) {
      el.onclick = function () {
        var s = S.stu[strip0(el.getAttribute('data-c'))]; if (!s) return;
        if (confirm('تسجيل حضور ' + s.nm + ' يدوياً؟\n(استعمله فقط بعد التحقق من هويته)')) handle(s.c, 'يدوي', 'من قائمة الغائبين');
      };
    });
    syncLine();
  }
  function row(seat, nm, sub, tm, code, tags) {
    return '<div class="row' + (code ? ' click" data-c="' + esc(code) : '') + '"><span class="seat">' + esc(seat) + '</span><span class="nm">' + esc(nm) + (tags || '') + '<small>' + esc(sub) + '</small></span><span class="tm">' + esc(tm) + '</span></div>';
  }

  /* ---------- الرفع ---------- */
  function syncLine() {
    var n = S.queue.length, on = navigator.onLine !== false;
    var net = $('net');
    net.className = 'net ' + (!on ? 'off' : n ? 'wait' : 'ok');
    net.textContent = !on ? 'بلا إنترنت' : n ? 'بانتظار الرفع ' + n : 'مرفوع ✔';
    $('sync').textContent = (n ? n + ' مسحاً محفوظاً في الجهاز بانتظار الرفع. ' : 'كل المسحات مرفوعة. ') +
      (S.lastSync ? 'آخر اتصال ' + S.lastSync + '. ' : '') + (S.lastErr ? '(' + S.lastErr + ')' : '') + ' • القائمة: ' + (S.pkg ? S.pkg.built : '');
  }
  function syncNow(quiet) {
    if (S.syncing || !S.pkg || !S.auth) return Promise.resolve();
    if (navigator.onLine === false) { syncLine(); return Promise.resolve(); }
    S.syncing = true;
    var batch = S.queue.slice(0, 200);
    return api('sync', { token: S.auth.token, venue: S.pkg.venue, scans: batch }).then(function (j) {
      var ok = {}; (j.accepted || []).forEach(function (id) { ok[id] = true; });
      S.queue = S.queue.filter(function (s) { return !ok[s.id]; }); save(K.queue, S.queue);
      S.pkg.server = j.server || S.pkg.server; save(K.pkg, S.pkg); index();
      S.lastSync = j.time || new Date().toLocaleTimeString(); S.lastErr = '';
      S.syncing = false; render();
      if (S.queue.length) return syncNow(true);
    }).catch(function (e) {
      S.syncing = false;
      if (e.expired) { S.lastErr = 'انتهت صلاحية الدخول — المسحات محفوظة؛ ادخل من جديد لرفعها'; reloginNeeded(); }
      else S.lastErr = 'تعذّر الرفع، سيُعاد تلقائياً';
      syncLine();
    });
  }
  function reloginNeeded() {
    // نحتفظ بالطابور والقائمة؛ يُطلب الدخول فقط
    if (S.reloginShown) return; S.reloginShown = true;
    alert('انتهت صلاحية الدخول على هذا الجهاز. المسحات محفوظة ولن تضيع. سجّل الدخول من جديد بنفس رمز المقر لرفعها.');
    S.auth = null; try { localStorage.removeItem(K.auth); } catch (e) {}
    stopCam(); view('vLogin'); S.reloginShown = false;   // القائمة والطابور يبقيان؛ الدخول بنفس المقر يكمل الرفع
  }
  $('bSync').onclick = function () { syncNow(); };
  $('bRef').onclick = function () {
    var b = this; b.disabled = true; b.textContent = 'جارٍ التحديث…';
    api('package', { token: S.auth.token, venue: S.pkg.venue }).then(function (j) {
      delete j.token; delete j.ok; S.pkg = j; save(K.pkg, S.pkg); index(); openScan();
    }).catch(function (e) { if (e.expired) reloginNeeded(); else alert(e.message); })
      .then(function () { b.disabled = false; b.textContent = '↻ تحديث القائمة'; });
  };
  $('bOut').onclick = function () { logout(false); };
  window.addEventListener('online', function () { syncNow(); });
  window.addEventListener('offline', syncLine);
  setInterval(function () { if (S.queue.length) syncNow(true); }, 20000);
  setInterval(function () { if (!S.queue.length) syncNow(true); }, 120000);   // دمج مسحات الأجهزة الأخرى في المقر

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  start();
})();
