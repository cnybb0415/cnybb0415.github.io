/* ═══════════════════════════════════════════
   나영 비서실 — app.js
   데이터: data/status.json (없으면 data/status.embed.js)
   ═══════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY = {
    memos: 'ny-office:memos',
    chat: 'ny-office:chat:',
    sender: 'ny-office:sender',
    room: 'ny-office:room',
    tab: 'ny-office:tab'
  };

  var TABS = ['map', 'meeting', 'work', 'staff', 'memo'];
  var ROOM_ON = { main: 3, command: 3, lounge: 2, office: 3 };
  var MENTION_LIST = ['@all', '@귤이', '@클로드', '@지피티'];
  var SENDERS = ['nayeong', 'gyuri', 'claude', 'gpt'];

  var DATA = null;
  var state = {
    tab: 'map',
    room: 'command',
    sender: 'nayeong',
    filter: 'all',
    mentions: []
  };

  /* ── helpers ───────────────────────────── */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function linkifyMentions(escaped) {
    return escaped.replace(/@([가-힣A-Za-z0-9_]+|all)/g, '<span class="mention">@$1</span>');
  }

  function safeGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  function nowTimeLabel() {
    var d = new Date();
    var h = d.getHours();
    var ampm = h < 12 ? '오전' : '오후';
    var hh = h % 12 === 0 ? 12 : h % 12;
    return ampm + ' ' + hh + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function stampLabel(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var mi = String(d.getMinutes()).padStart(2, '0');
    return mm + '/' + dd + ' ' + hh + ':' + mi;
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('is-on'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-on');
      setTimeout(function () { el.hidden = true; }, 220);
    }, 2600);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function person(id) {
    return (DATA && DATA.people && DATA.people[id]) || { name: id, role: '', emoji: '🙂', bg: '#F3E7D8' };
  }

  /* ── load ──────────────────────────────── */
  function loadData() {
    return fetch('data/status.json', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('status.json ' + res.status);
        return res.json();
      })
      .catch(function () {
        return window.__STATUS__ || null;
      });
  }

  /* ── render: header / connections ──────── */
  function renderConnections() {
    var list = $('#connList');
    if (!list) return;
    list.innerHTML = (DATA.connections || []).map(function (c) {
      return '<li>' +
        '<span class="c-emoji" aria-hidden="true">' + esc(c.emoji) + '</span>' +
        '<span><a class="c-name" href="' + esc(c.url || '#') + '" target="_blank" rel="noopener">' + esc(c.name) + '</a>' +
        '<span class="c-detail"> · ' + esc(c.detail) + '</span></span>' +
        '<span class="c-state">' + esc(c.state) + '</span>' +
        '</li>';
    }).join('');
  }

  /* ── render: map ───────────────────────── */
  function renderMap() {
    var h = DATA.headline || {};
    if ($('#heroLabel')) $('#heroLabel').textContent = h.label || '';
    if ($('#heroTitle')) $('#heroTitle').textContent = h.title || '';
    if ($('#heroDesc')) $('#heroDesc').textContent = h.desc || '';

    var chips = $('#mapChips');
    if (chips) {
      var groups = { style: [], status: [] };
      (DATA.mapChips || []).forEach(function (c) {
        var k = c.kind === 'status' ? 'status' : 'style';
        groups[k].push('<span class="chip"><span aria-hidden="true">' + esc(c.emoji) + '</span>' + esc(c.label) + '</span>');
      });
      chips.innerHTML = Object.keys(groups).filter(function (k) { return groups[k].length; }).map(function (k) {
        return '<div class="chip-row">' + groups[k].join('') + '</div>';
      }).join('');
    }

    var tasks = DATA.tasks || [];
    var done = tasks.filter(function (t) { return t.status === 'done'; }).length;
    var active = tasks.filter(function (t) { return t.status === 'active'; }).length;
    var stats = $('#mapStats');
    if (stats) {
      stats.innerHTML = [
        '<div class="stat"><span class="stat-value green">' + done + '</span><span class="stat-label">오늘 완료</span></div>',
        '<div class="stat"><span class="stat-value brown">' + active + '</span><span class="stat-label">진행 중</span></div>',
        '<div class="stat"><span class="stat-value">' + (DATA.assistants || []).length + '</span><span class="stat-label">대기 중인 비서</span></div>'
      ].join('');
    }

    var mini = $('#mapTaskMini');
    if (mini) {
      mini.innerHTML = tasks.slice(0, 4).map(function (t) {
        return '<button class="mini" type="button" data-go="work">' +
          '<span class="mini-emoji" aria-hidden="true">' + esc(t.emoji) + '</span>' +
          '<span class="mini-body"><span class="mini-title">' + esc(t.title) + '</span>' +
          '<span class="mini-meta">' + esc(t.owner) + ' · ' + esc(t.time) + '</span></span>' +
          '<span class="pill ' + pillClass(t.status) + '">' + esc(t.statusLabel) + '</span>' +
          '</button>';
      }).join('');
    }

    var sched = $('#mapSchedule');
    if (sched) {
      sched.innerHTML = (DATA.schedule || []).map(function (s) {
        return '<li class="' + (s.kind === 'today' ? 'is-today' : '') + '">' +
          '<span class="schedule-when">' + esc(s.when) + '</span>' + esc(s.what) +
          '<span class="schedule-who">' + esc(s.who) + '</span></li>';
      }).join('');
    }

    if ($('#updatedNote')) $('#updatedNote').textContent = stampLabel(DATA.updatedAt) + ' 기준';
    if ($('#footerUpdated')) $('#footerUpdated').textContent = '데이터 갱신 ' + stampLabel(DATA.updatedAt) + ' · 오피스 맵은 이미지 일러스트';
  }

  function pillClass(status) {
    if (status === 'done') return 'pill-done';
    if (status === 'active') return 'pill-active';
    return 'pill-planned';
  }

  /* ── render: tasks ─────────────────────── */
  function renderTasks() {
    var list = $('#taskList');
    if (!list) return;
    var tasks = (DATA.tasks || []).filter(function (t) {
      return state.filter === 'all' ? true : t.status === state.filter;
    });

    if (!tasks.length) {
      list.innerHTML = '<p class="empty">이 상태의 작업이 없어요.</p>';
      return;
    }

    list.innerHTML = tasks.map(function (t) {
      var metrics = (t.metrics || []).map(function (m) {
        return '<div class="metric"><span class="metric-label">' + esc(m.label) + '</span>' +
          '<span class="metric-value">' + esc(m.value) + '</span></div>';
      }).join('');

      var bullets = (t.bullets || []).map(function (b) {
        return '<li>' + esc(b) + '</li>';
      }).join('');

      return '<article class="task" data-status="' + esc(t.status) + '">' +
        '<div class="task-top">' +
          '<span class="task-emoji" aria-hidden="true">' + esc(t.emoji) + '</span>' +
          '<div class="task-title-wrap">' +
            '<h3 class="task-title">' + esc(t.title) + '</h3>' +
            '<p class="task-meta"><span class="task-tag">' + esc(t.tag) + '</span>' +
              '<span>' + esc(t.owner) + '</span><span>·</span><span>' + esc(t.time) + '</span></p>' +
          '</div>' +
          '<span class="pill ' + pillClass(t.status) + '">' + esc(t.statusLabel) + '</span>' +
        '</div>' +
        '<p class="task-summary">' + esc(t.summary) + '</p>' +
        (metrics ? '<div class="metric-row">' + metrics + '</div>' : '') +
        (bullets ? '<ul class="task-bullets">' + bullets + '</ul>' : '') +
        (t.next ? '<p class="task-next"><span aria-hidden="true">⏭</span><span>' + esc(t.next) + '</span></p>' : '') +
        '</article>';
    }).join('');
  }

  /* ── render: staff ─────────────────────── */
  function renderStaff() {
    var list = $('#staffList');
    if (!list) return;

    list.innerHTML = (DATA.assistants || []).map(function (a) {
      var duties = (a.duties || []).map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('');
      var recent = (a.recent || []).map(function (r) {
        return '<li><span class="when">' + esc(r.at) + '</span><span>' + esc(r.text) + '</span></li>';
      }).join('');
      var stateCls = a.state === 'active' ? 'active' : 'manual';

      return '<article class="staff">' +
        '<div class="staff-top">' +
          '<div class="staff-avatar" aria-hidden="true">' + esc(a.emoji) + '</div>' +
          '<div class="staff-id">' +
            '<h3 class="staff-name">' + esc(a.name) + ' <small>' + esc(a.role) + '</small></h3>' +
            '<p class="staff-tag">' + esc(a.tag) + '</p>' +
          '</div>' +
          '<span class="staff-state ' + stateCls + '"><span class="dot ' + (a.state === 'active' ? 'dot-green' : 'dot-manual') + '"></span>' + esc(a.stateLabel) + '</span>' +
        '</div>' +
        '<p class="staff-summary">' + esc(a.summary) + '</p>' +
        '<div class="staff-cols">' +
          '<div><span class="staff-block-label">맡은 일</span><ul class="staff-duties">' + duties + '</ul></div>' +
          '<div><span class="staff-block-label">최근 작업</span><ul class="staff-recent">' + recent + '</ul></div>' +
        '</div>' +
        '<p class="staff-int"><b>연동</b> · ' + esc(a.integration) + '</p>' +
        (a.link ? '<a class="staff-link" href="' + esc(a.link.url) + '" target="_blank" rel="noopener">' + esc(a.link.label) + ' ↗</a>' : '') +
        '</article>';
    }).join('');
  }

  /* ── render: meeting ───────────────────── */
  function renderRoomChips() {
    var wrap = $('#roomChips');
    if (!wrap) return;
    var rooms = (DATA.rooms || []).filter(function (r) { return r.id !== 'office'; });
    wrap.innerHTML = rooms.map(function (r) {
      return '<button class="room-chip' + (r.id === state.room ? ' is-active' : '') + '" type="button" data-room="' + esc(r.id) + '">' +
        '<span aria-hidden="true">' + esc(r.emoji) + '</span> ' + esc(r.name) + '</button>';
    }).join('');

    var room = (DATA.rooms || []).filter(function (r) { return r.id === state.room; })[0] || rooms[0];
    var status = $('#roomStatus');
    if (status && room) {
      status.textContent = room.emoji + ' ' + room.name + ' · ON ' + (ROOM_ON[room.id] || 3) + '명';
    }
  }

  function getMessages(roomId) {
    var saved = safeGet(KEY.chat + roomId, null);
    if (Array.isArray(saved)) return saved;
    return (DATA.chatSeeds && DATA.chatSeeds[roomId]) ? DATA.chatSeeds[roomId].slice() : [];
  }

  function renderChat(toBottom) {
    var list = $('#chatList');
    if (!list) return;
    var msgs = getMessages(state.room);

    list.innerHTML = msgs.map(function (m) {
      var p = person(m.from);
      var isMe = !!p.me;
      return '<div class="msg' + (isMe ? ' is-me' : '') + '">' +
        '<div class="avatar" style="background:' + esc(p.bg) + '" aria-hidden="true">' + esc(p.emoji) + '</div>' +
        '<div class="msg-body">' +
          '<div class="msg-head">' +
            '<span class="msg-name">' + esc(p.name) + '</span>' +
            '<span class="msg-role">' + esc(p.role) + '</span>' +
            '<span class="msg-time">' + esc(m.time || '') + '</span>' +
          '</div>' +
          '<div class="bubble">' + linkifyMentions(esc(m.text)) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    list.scrollTop = toBottom ? list.scrollHeight : 0;
  }

  function fitChatPanel() {
    var panel = document.getElementById('panel-meeting');
    if (!panel || panel.hasAttribute('hidden')) return;
    var top = Math.round(panel.getBoundingClientRect().top);
    panel.style.height = Math.max(420, Math.round(window.innerHeight - top)) + 'px';
  }

  function saveMessage(from, text) {
    var msgs = getMessages(state.room);
    msgs.push({ from: from, text: text, time: nowTimeLabel() });
    safeSet(KEY.chat + state.room, msgs);
    renderChat(true);
  }

  function renderComposer() {
    var senderWrap = $('#senderChips');
    if (senderWrap) {
      senderWrap.innerHTML = SENDERS.map(function (id) {
        var p = person(id);
        var label = id === 'nayeong' ? p.name + ' (대장님)' : p.name;
        return '<button class="s-chip' + (state.sender === id ? ' is-active' : '') + '" type="button" data-sender="' + esc(id) + '">' +
          '<span aria-hidden="true">' + esc(p.emoji) + '</span>' + esc(label) + '</button>';
      }).join('');
    }

    var mentionWrap = $('#mentionChips');
    if (mentionWrap) {
      mentionWrap.innerHTML = MENTION_LIST.map(function (m) {
        return '<button class="s-chip" type="button" data-mention="' + esc(m) + '">' + esc(m) + '</button>';
      }).join('');
    }
  }

  /* ── chat command / notion ─────────────── */
  function currentRoomName() {
    var room = (DATA.rooms || []).filter(function (r) { return r.id === state.room; })[0];
    return room ? room.name : '회의실';
  }

  function buildCommand() {
    var input = $('#chatInput');
    var text = input ? input.value.trim() : '';
    if (!text) return '';
    var p = person(state.sender);
    var head = '[' + currentRoomName() + '] ' + p.name + ' 지시';
    return head + '\n' + text;
  }

  function buildNotionMarkdown() {
    var msgs = getMessages(state.room).slice(-6);
    var lines = ['## ' + currentRoomName() + ' 기록 · ' + stampLabel(new Date().toISOString()), ''];
    msgs.forEach(function (m) {
      var p = person(m.from);
      lines.push('- **' + p.name + '** (' + (m.time || '') + '): ' + m.text);
    });
    return lines.join('\n');
  }

  function openNotion() {
    var url = null;
    if (DATA.connections) {
      DATA.connections.forEach(function (c) { if (c.name === '노션') url = c.url; });
    }
    if (!url) return false;
    var a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  }

  /* ── render: memos ─────────────────────── */
  function getMemos() {
    var list = safeGet(KEY.memos, []);
    return Array.isArray(list) ? list : [];
  }

  function renderMemos() {
    var list = $('#memoList');
    var empty = $('#memoEmpty');
    if (!list) return;
    var memos = getMemos().slice().sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });

    if (!memos.length) {
      list.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    list.innerHTML = memos.map(function (m) {
      return '<article class="memo" data-id="' + esc(m.id) + '">' +
        '<p class="memo-text">' + esc(m.text) + '</p>' +
        '<div class="memo-foot"><span>' + esc(stampLabel(m.at)) + '</span>' +
          '<span class="memo-actions">' +
            '<button class="memo-btn" type="button" data-memo-copy="' + esc(m.id) + '">복사</button>' +
            '<button class="memo-btn danger" type="button" data-memo-del="' + esc(m.id) + '">삭제</button>' +
          '</span>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function saveMemo() {
    var input = $('#memoInput');
    if (!input) return;
    var text = input.value.trim();
    if (!text) { toast('메모 내용을 먼저 적어 주세요'); return; }
    var memos = getMemos();
    memos.push({ id: 'm' + Date.now(), text: text, at: new Date().toISOString() });
    if (!safeSet(KEY.memos, memos)) { toast('저장 공간이 가득 찼어요'); return; }
    input.value = '';
    renderMemos();
    toast('메모를 저장했어요');
  }

  function memosAsText() {
    var memos = getMemos().slice().sort(function (a, b) { return (a.at || '').localeCompare(b.at || ''); });
    if (!memos.length) return '';
    return memos.map(function (m) { return '- (' + stampLabel(m.at) + ') ' + m.text; }).join('\n');
  }

  function exportMemos() {
    var body = memosAsText();
    if (!body) { toast('내보낼 메모가 없어요'); return; }
    var head = '나영 비서실 메모 (' + stampLabel(new Date().toISOString()) + ')\n\n';
    var blob = new Blob([head + body + '\n'], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '나영-비서실-메모.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('메모 파일을 내보냈어요');
  }

  /* ── tabs ──────────────────────────────── */
  function setTab(tab, opts) {
    if (TABS.indexOf(tab) < 0) tab = 'map';
    state.tab = tab;

    $all('.tab').forEach(function (btn) {
      var on = btn.getAttribute('data-tab') === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    });

    TABS.forEach(function (t) {
      var panel = document.getElementById('panel-' + t);
      if (!panel) return;
      var on = t === tab;
      panel.classList.toggle('is-active', on);
      if (on) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
    });

    if (opts && opts.hash !== false) {
      if (history.replaceState) history.replaceState(null, '', '#' + tab);
      else location.hash = tab;
    }
    safeSet(KEY.tab, tab);

    document.body.classList.toggle('chat-lock', tab === 'meeting');

    if (tab === 'meeting') {
      renderRoomChips();
      renderChat();
      fitChatPanel();
      requestAnimationFrame(fitChatPanel);
    }
    if (tab === 'work') renderTasks();
    if (tab !== 'meeting') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setRoom(roomId) {
    state.room = roomId;
    safeSet(KEY.room, roomId);
    renderRoomChips();
    renderChat();
  }

  /* ── events ────────────────────────────── */
  function bindEvents() {
    $all('.tab').forEach(function (btn) {
      btn.addEventListener('click', function () { setTab(btn.getAttribute('data-tab')); });
      btn.addEventListener('keydown', function (e) {
        var idx = TABS.indexOf(btn.getAttribute('data-tab'));
        var next = null;
        if (e.key === 'ArrowRight') next = TABS[(idx + 1) % TABS.length];
        else if (e.key === 'ArrowLeft') next = TABS[(idx - 1 + TABS.length) % TABS.length];
        else if (e.key === 'Home') next = TABS[0];
        else if (e.key === 'End') next = TABS[TABS.length - 1];
        if (!next) return;
        e.preventDefault();
        setTab(next);
        var nextBtn = document.getElementById('tabbtn-' + next);
        if (nextBtn) nextBtn.focus();
      });
    });

    document.addEventListener('click', function (e) {
      var go = e.target.closest('[data-go]');
      if (go) {
        var target = go.getAttribute('data-go');
        var room = go.getAttribute('data-room');
        if (room) setRoom(room);
        setTab(target);
        return;
      }
      var roomBtn = e.target.closest('.room-chip');
      if (roomBtn) { setRoom(roomBtn.getAttribute('data-room')); return; }

      var senderBtn = e.target.closest('[data-sender]');
      if (senderBtn) {
        state.sender = senderBtn.getAttribute('data-sender');
        safeSet(KEY.sender, state.sender);
        renderComposer();
        return;
      }

      var mentionBtn = e.target.closest('[data-mention]');
      if (mentionBtn) {
        var input = $('#chatInput');
        var token = mentionBtn.getAttribute('data-mention');
        if (input) {
          var v = input.value;
          if (v.indexOf(token) === -1) {
            input.value = (v && !/\s$/.test(v) ? v + ' ' : v) + token + ' ';
          }
          input.focus();
        }
        return;
      }

      var filterBtn = e.target.closest('.filter');
      if (filterBtn) {
        state.filter = filterBtn.getAttribute('data-filter');
        $all('.filter').forEach(function (b) { b.classList.toggle('is-active', b === filterBtn); });
        renderTasks();
        return;
      }

      var copyBtn = e.target.closest('[data-memo-copy]');
      if (copyBtn) {
        var id = copyBtn.getAttribute('data-memo-copy');
        var memo = getMemos().filter(function (m) { return m.id === id; })[0];
        if (memo) copyText(memo.text).then(function () { toast('메모를 복사했어요'); });
        return;
      }

      var delBtn = e.target.closest('[data-memo-del]');
      if (delBtn) {
        var did = delBtn.getAttribute('data-memo-del');
        if (window.confirm('이 메모를 지울까요?')) {
          var rest = getMemos().filter(function (m) { return m.id !== did; });
          safeSet(KEY.memos, rest);
          renderMemos();
          toast('메모를 지웠어요');
        }
        return;
      }
    });

    var connBadge = $('#connBadge');
    if (connBadge) {
      connBadge.addEventListener('click', function () {
        var sheet = $('#connSheet');
        if (!sheet) return;
        var open = sheet.hasAttribute('hidden');
        if (open) sheet.removeAttribute('hidden');
        else sheet.setAttribute('hidden', '');
        connBadge.setAttribute('aria-expanded', open ? 'true' : 'false');
        fitChatPanel();
      });
    }

    var sendBtn = $('#sendBtn');
    if (sendBtn) {
      sendBtn.addEventListener('click', function () {
        var input = $('#chatInput');
        var text = input ? input.value.trim() : '';
        if (!text) { toast('남길 말을 적어 주세요'); return; }
        saveMessage(state.sender, text);
        input.value = '';
        input.style.height = '';
        toast('말풍선에 남겼어요 (이 브라우저에만 저장)');
      });
    }

    var copyCmdBtn = $('#copyCmdBtn');
    if (copyCmdBtn) {
      copyCmdBtn.addEventListener('click', function () {
        var cmd = buildCommand();
        if (!cmd) { toast('보낼 내용을 먼저 적어 주세요'); return; }
        copyText(cmd).then(function () {
          toast('명령을 복사했어요 — 귤이에게 그대로 붙여넣으세요');
        });
      });
    }

    var notionBtn = $('#notionBtn');
    if (notionBtn) {
      notionBtn.addEventListener('click', function () {
        var md = buildNotionMarkdown();
        var opened = openNotion();
        copyText(md).then(function () {
          toast(opened
            ? "노션 'AI 회사'를 열고 기록용 내용을 복사했어요"
            : '기록용 내용을 복사했어요 — 노션 AI 회사에 붙여넣으세요');
        });
        if (!opened) {
          var hint = $('#chatHint');
          if (hint) hint.textContent = '노션 연결 주소를 찾지 못했어요. data/status.json의 connections를 확인해 주세요.';
        }
      });
    }

    var memoInput = $('#memoInput');
    if (memoInput) {
      memoInput.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveMemo(); }
      });
    }
    var memoSave = $('#memoSave');
    if (memoSave) memoSave.addEventListener('click', saveMemo);

    var memoCopyAll = $('#memoCopyAll');
    if (memoCopyAll) {
      memoCopyAll.addEventListener('click', function () {
        var body = memosAsText();
        if (!body) { toast('복사할 메모가 없어요'); return; }
        copyText(body).then(function () { toast('메모 전체를 복사했어요'); });
      });
    }

    var memoExport = $('#memoExport');
    if (memoExport) memoExport.addEventListener('click', exportMemos);

    var chatInput = $('#chatInput');
    if (chatInput) {
      chatInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 92) + 'px';
      });
    }

    window.addEventListener('resize', function () {
      if (state.tab === 'meeting') fitChatPanel();
    });

    window.addEventListener('hashchange', function () {
      var tab = (location.hash || '').replace('#', '');
      if (TABS.indexOf(tab) >= 0 && tab !== state.tab) setTab(tab, { hash: false });
    });
  }

  /* ── PIN 잠금 ──────────────────────────── */
  var LOCK_KEY = 'ny-office:auth';
  var PIN_LEN = 4;
  /* PIN은 SHA-256 해시로만 비교합니다. 평문 코드는 소스에 두지 않습니다. */
  var PIN_HASH = 'cc41d80b1697c04d19330fba23a82cfc68fb086e3445691578bfae3a3d6f3e57';
  var DEFAULT_LOCK_SUB = '4자리 PIN을 입력해 주세요';
  var pinEntry = '';
  var pinBusy = false;
  var lockOnUnlock = null;

  function bytesToHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  /* crypto.subtle이 없는 환경(비보안 컨텍스트)을 위한 SHA-256 폴백 */
  function sha256Hex(str) {
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var bytes = unescape(encodeURIComponent(String(str)));
    var len = bytes.length;
    var words = [];
    var i;
    for (i = 0; i < len; i++) {
      words[i >> 2] = (words[i >> 2] | 0) | ((bytes.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8));
    }
    words[len >> 2] = (words[len >> 2] | 0) | (0x80 << (24 - (len % 4) * 8));
    var total = (((len + 8) >> 6) + 1) << 4;
    words[total - 1] = len * 8;

    for (var j = 0; j < total; j += 16) {
      var w = new Array(64);
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        if (i < 16) {
          w[i] = words[j + i] | 0;
        } else {
          var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
          var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
          w[i] = (((w[i - 16] + s0) | 0) + ((w[i - 7] + s1) | 0)) | 0;
        }
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  function pinHash(text) {
    if (window.crypto && crypto.subtle && crypto.subtle.digest && window.TextEncoder) {
      try {
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
          .then(bytesToHex)
          .catch(function () { return sha256Hex(text); });
      } catch (e) { /* 폴백으로 진행 */ }
    }
    return Promise.resolve(sha256Hex(text));
  }

  function lockOverlay() { return document.getElementById('lockScreen'); }

  function lockSub(text) {
    var el = document.getElementById('lockSub');
    if (el) el.textContent = text || DEFAULT_LOCK_SUB;
  }

  function paintDots() {
    $all('#lockDots .lock-dot').forEach(function (dot, idx) {
      dot.classList.toggle('on', idx < pinEntry.length);
    });
  }

  function shakeLock() {
    var el = lockOverlay();
    if (!el) return;
    el.classList.add('is-wrong');
    setTimeout(function () { el.classList.remove('is-wrong'); }, 460);
  }

  function isAuthed() {
    try { return localStorage.getItem(LOCK_KEY) === 'ok'; } catch (e) { return false; }
  }

  function rememberAuthed() {
    try { localStorage.setItem(LOCK_KEY, 'ok'); } catch (e) { /* 저장 실패해도 이번 세션은 통과 */ }
    document.documentElement.classList.add('is-authed');
  }

  function forgetAuthed() {
    try { localStorage.removeItem(LOCK_KEY); } catch (e) { /* noop */ }
    document.documentElement.classList.remove('is-authed');
  }

  function showLock() {
    var el = lockOverlay();
    if (!el) return;
    pinEntry = '';
    pinBusy = false;
    paintDots();
    lockSub(DEFAULT_LOCK_SUB);
    el.removeAttribute('hidden');
    el.style.display = 'grid';
    el.classList.remove('is-wrong');
    document.body.classList.add('locked');
  }

  function hideLock() {
    var el = lockOverlay();
    if (!el) return;
    el.setAttribute('hidden', '');
    el.style.display = 'none';
    document.body.classList.remove('locked');
  }

  function fireUnlock() {
    var fn = lockOnUnlock;
    lockOnUnlock = null;
    if (fn) fn();
  }

  function unlockNow() {
    rememberAuthed();
    pinEntry = '';
    paintDots();
    hideLock();
    fireUnlock();
  }

  function checkPin() {
    pinBusy = true;
    lockSub('확인 중…');
    var entered = pinEntry;
    pinHash(entered).then(function (hex) {
      pinBusy = false;
      if (hex === PIN_HASH) {
        unlockNow();
        return;
      }
      pinEntry = '';
      paintDots();
      shakeLock();
      lockSub('PIN이 맞지 않아요. 다시 입력해 주세요');
    }).catch(function () {
      pinBusy = false;
      pinEntry = '';
      paintDots();
      shakeLock();
      lockSub('확인하지 못했어요. 다시 시도해 주세요');
    });
  }

  function pressKey(key) {
    if (pinBusy) return;
    if (key === 'del') {
      pinEntry = pinEntry.slice(0, -1);
      paintDots();
      lockSub(DEFAULT_LOCK_SUB);
      return;
    }
    if (!/^[0-9]$/.test(key)) return;
    if (pinEntry.length >= PIN_LEN) return;
    pinEntry += key;
    paintDots();
    lockSub(DEFAULT_LOCK_SUB);
    if (pinEntry.length === PIN_LEN) checkPin();
  }

  function lockNow() {
    forgetAuthed();
    showLock();
  }

  function initLock(onUnlock) {
    lockOnUnlock = onUnlock;
    var keys = document.getElementById('lockKeys');
    if (keys) {
      keys.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-key]');
        if (!btn) return;
        pressKey(btn.getAttribute('data-key'));
      });
    }

    document.addEventListener('keydown', function (e) {
      var el = lockOverlay();
      if (!el || el.hasAttribute('hidden')) return;
      if (/^[0-9]$/.test(e.key)) { pressKey(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { pressKey('del'); e.preventDefault(); }
    });

    var btn = document.getElementById('lockBtn');
    if (btn) btn.addEventListener('click', lockNow);

    var authed = isAuthed();
    if (authed) hideLock();
    else showLock();
    if (authed) fireUnlock();
  }

  /* ── boot ──────────────────────────────── */
  function boot(data) {
    if (!data) {
      var main = document.querySelector('main');
      if (main) {
        main.innerHTML = '<div class="card" style="padding:20px;margin-top:16px">' +
          '<h2 style="margin:0 0 6px;font-size:16px">현황 데이터를 불러오지 못했어요</h2>' +
          '<p style="margin:0;font-size:12.5px;color:#8a6a4a">data/status.json 또는 data/status.embed.js가 같은 폴더에 있는지 확인해 주세요.</p></div>';
      }
      return;
    }

    DATA = data;

    var savedTab = safeGet(KEY.tab, 'map');
    var savedRoom = safeGet(KEY.room, 'command');
    var savedSender = safeGet(KEY.sender, 'nayeong');
    if (typeof savedTab === 'string' && TABS.indexOf(savedTab) >= 0) state.tab = savedTab;
    if (typeof savedRoom === 'string') state.room = savedRoom;
    if (SENDERS.indexOf(savedSender) >= 0) state.sender = savedSender;

    var hashTab = (location.hash || '').replace('#', '');
    if (TABS.indexOf(hashTab) >= 0) state.tab = hashTab;

    renderConnections();
    renderMap();
    renderTasks();
    renderStaff();
    renderRoomChips();
    renderChat();
    renderComposer();
    renderMemos();
    bindEvents();
    setTab(state.tab, { hash: false });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initLock(function () {
      loadData().then(boot).catch(function () { boot(null); });
    });
  });
})();
