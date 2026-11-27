/* ═══════════════════════════════════════════
   나영 비서실 — app.js
   데이터: data/status.enc.json (AES-GCM 암호문, 열쇠로만 열림)
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

  var TABS = ['map', 'meeting', 'work', 'staff', 'report', 'memo'];
  var ROOM_ON = { main: 3, command: 3, lounge: 2, office: 3 };
  var MENTION_LIST = ['@all', '@귤이', '@감이', '@클로드', '@지피티'];
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

  var TAG_CLS = { '지시': 'ask', '받음': 'ack', '진행': 'run', '완료': 'done', '막힘': 'block', '질문': 'q', '안내': 'info' };
  function linkifyMentions(escaped) {
    return escaped
      .replace(/(https?:\/\/[^\s<]+[^\s<.,)\]])/g, '<a class="bubble-link" href="$1" target="_blank" rel="noopener">링크 ↗</a>')
      .replace(/@([가-힣A-Za-z0-9_]+|all)/g, '<span class="mention">@$1</span>')
      .replace(/\[(지시|받음|진행|완료|막힘|질문|안내)\]/g, function (m, t) { return '<span class="st-tag st-' + TAG_CLS[t] + '">' + t + '</span>'; });
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

  var EXTRA_PEOPLE = {
    gami: { name: '감이', role: '두 번째 피클', emoji: '🟠', bg: '#FFE3C2' },
    bot: { name: '연동', role: '자동 기록', emoji: '🤖', bg: '#E8E8EE' }
  };
  function person(id) {
    return (DATA && DATA.people && DATA.people[id]) || EXTRA_PEOPLE[id] || { name: id, role: '', emoji: '🙂', bg: '#F3E7D8' };
  }

  /* ── load ──────────────────────────────── */

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
    var lc = DATA.liveCounts;
    var done = lc ? lc.todayDone : tasks.filter(function (t) { return t.status === 'done'; }).length;
    var active = lc ? lc.active + lc.check : tasks.filter(function (t) { return t.status === 'active'; }).length;
    var stats = $('#mapStats');
    if (stats) {
      stats.innerHTML = [
        '<div class="stat"><span class="stat-value green">' + done + '</span><span class="stat-label">오늘 완료</span></div>',
        '<div class="stat"><span class="stat-value brown">' + active + '</span><span class="stat-label">진행 중</span></div>',
        '<div class="stat"><span class="stat-value">' + (DATA.assistants || []).length + '</span><span class="stat-label">' + (lc ? '함께하는 비서' : '대기 중인 비서') + '</span></div>'
      ].join('');
    }

    var mini = $('#mapTaskMini');
    if (mini) {
      mini.innerHTML = tasks.slice(0, 4).map(function (t) {
        return '<button class="mini" type="button" data-go="work">' +
          '<span class="mini-emoji" aria-hidden="true">' + esc(t.emoji) + '</span>' +
          '<span class="mini-body"><span class="mini-title">' + esc(t.title) + '</span>' +
          '<span class="mini-meta">' + esc(t.owner) + ' · ' + esc(t.time) + '</span></span>' +
          '<span class="pill ' + pillClass(t.status, t.statusLabel) + '">' + esc(t.statusLabel) + '</span>' +
          '</button>';
      }).join('');
    }

    var sched = $('#mapSchedule');
    if (sched) {
      if (DATA.liveCounts && !(DATA.schedule || []).length) { sched.innerHTML = '<li>마감 잡힌 일이 없어요</li>'; }
      else sched.innerHTML = (DATA.schedule || []).map(function (s) {
        return '<li class="' + (s.kind === 'today' ? 'is-today' : '') + '">' +
          '<span class="schedule-when">' + esc(s.when) + '</span>' + esc(s.what) +
          '<span class="schedule-who">' + esc(s.who) + '</span></li>';
      }).join('');
    }

    if ($('#updatedNote')) $('#updatedNote').textContent = stampLabel(DATA.updatedAt) + ' 기준';
    if ($('#footerUpdated')) $('#footerUpdated').textContent = '데이터 갱신 ' + stampLabel(DATA.updatedAt) + ' · 오피스 맵은 이미지 일러스트';
  }

  function pillClass(status, label) {
    if (label === '확인 필요') return 'pill-check';
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

    var note = $('#boardNote');
    if (note) note.textContent = DATA.liveCounts ? '노션 AI 회사 기준 · ' + stampLabel(DATA.updatedAt) + ' 갱신 · 완료는 최근 3일' : '';
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
          '<span class="pill ' + pillClass(t.status, t.statusLabel) + '">' + esc(t.statusLabel) + '</span>' +
        '</div>' +
        '<p class="task-summary">' + esc(t.summary) + '</p>' +
        (metrics ? '<div class="metric-row">' + metrics + '</div>' : '') +
        (bullets ? '<ul class="task-bullets">' + bullets + '</ul>' : '') +
        (t.next ? '<p class="task-next"><span aria-hidden="true">⏭</span><span>' + esc(t.next) + '</span></p>' : '') +
        (t.url ? '<a class="task-link" href="' + esc(t.url) + '" target="_blank" rel="noopener">노션에서 보기 ↗</a>' : '') +
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
    var rooms = LIVE.rooms.map(function (r) {
      var t = r.title.replace(/^[^\w가-힣]+/, '');
      var short = t.split(/\s+—\s+|\s+\(/)[0];
      return { id: 'n:' + r.id, name: short, full: t, url: r.url, emoji: /대화방/.test(t) ? '💬' : '📋', live: true };
    })
      .concat((DATA.rooms || []).filter(function (r) { return r.id !== 'office'; }));
    wrap.innerHTML = rooms.map(function (r) {
      return '<button class="room-chip' + (r.id === state.room ? ' is-active' : '') + (r.live ? ' is-live' : '') + '" type="button" data-room="' + esc(r.id) + '" title="' + esc(r.full || r.name) + '">' +
        '<span aria-hidden="true">' + esc(r.emoji) + '</span> ' + esc(r.name) + (r.live ? '<i class="live-dot" aria-label="실시간"></i>' : '') + '</button>';
    }).join('');

    var room = rooms.filter(function (r) { return r.id === state.room; })[0] || rooms[0];
    var status = $('#roomStatus');
    if (status && room) {
      if (room.live) {
        status.innerHTML = '<span class="rs-live"><i class="live-dot"></i>노션 연결</span> ' + esc(room.full || room.name) +
          (LIVE.at ? ' · ' + esc(LIVE.at) + ' 갱신' : '') +
          (room.url ? ' · <a href="' + esc(room.url) + '" target="_blank" rel="noopener">노션 ↗</a>' : '');
      } else {
        status.textContent = room.emoji + ' ' + room.name + ' · 이 브라우저 메모용 방';
      }
    }
    var live = isLiveRoom();
    var panel = document.getElementById('panel-meeting');
    if (panel) panel.classList.toggle('is-live', live);
    var sendBtn = $('#sendBtn');
    if (sendBtn) sendBtn.textContent = live ? '보내기' : '말풍선에 남기기';
    var input = $('#chatInput');
    if (input) input.placeholder = live ? '귤이·클로드에게 보낼 말 — 예) @귤이 원본 HTML 올려줘' : '이 브라우저에만 남길 메모 (실제 지시는 💬 대화방에서)';
    var hint = $('#chatHint');
    if (hint) hint.textContent = live
      ? '보내면 노션 대화방에 [나영]으로 바로 올라가요 · 30초마다 새 말 확인'
      : '이 방은 메모용이에요 · 비서에게 보내려면 💬 대화방을 고르세요';
  }

  function getMessages(roomId) {
    if (/^n:/.test(roomId)) return (LIVE.msgs[roomId.slice(2)] || []);
    var saved = safeGet(KEY.chat + roomId, null);
    if (Array.isArray(saved)) return saved;
    return (DATA.chatSeeds && DATA.chatSeeds[roomId]) ? DATA.chatSeeds[roomId].slice() : [];
  }

  function renderChat(toBottom) {
    var list = $('#chatList');
    if (!list) return;
    var msgs = getMessages(state.room);
    // 30초마다 새로 불러와도 읽던 자리를 지켜요: 바닥 근처에 있었으면 바닥으로, 위를 읽고 있었으면 그 자리 그대로
    var nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    var keepTop = list.scrollTop;

    var html = msgs.map(function (m) {
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

    var changed = html !== list.__html;
    if (changed) { list.innerHTML = html; list.__html = html; }
    var stick = toBottom || nearBottom;
    list.scrollTop = stick ? list.scrollHeight : keepTop;
    newMsgPill(changed && !stick && msgs.length > 0);
  }

  /* 위를 읽는 중에 새 말이 오면 '새 말 ↓' 버튼으로만 알려요 (자동으로 끌어내리지 않음) */
  function newMsgPill(show) {
    var list = $('#chatList');
    var pill = document.getElementById('newMsgPill');
    if (!pill && list) {
      pill = document.createElement('button');
      pill.id = 'newMsgPill'; pill.type = 'button'; pill.className = 'new-msg-pill'; pill.textContent = '새 말 ↓';
      pill.hidden = true;
      list.parentNode.insertBefore(pill, list.nextSibling);
      pill.addEventListener('click', function () { list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }); pill.hidden = true; });
      list.addEventListener('scroll', function () {
        if (list.scrollHeight - list.scrollTop - list.clientHeight < 80) pill.hidden = true;
      }, { passive: true });
    }
    if (pill && show) pill.hidden = false;
  }

  function fitChatPanel() {
    var panel = document.getElementById('panel-meeting');
    if (!panel || panel.hasAttribute('hidden')) return;
    var top = Math.round(panel.getBoundingClientRect().top);
    panel.style.height = Math.max(420, Math.round(window.innerHeight - top)) + 'px';
  }

  function saveMessage(from, text) {
    if (isLiveRoom()) return sendLive(text);
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
      renderChat(true);
      if (isLiveRoom()) loadLiveMessages(true);
      fitChatPanel();
      requestAnimationFrame(fitChatPanel);
    }
    if (tab === 'work') renderTasks();
    if (tab === 'report') { loadReports(); markReportsSeen(); }
    if (tab !== 'meeting') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setRoom(roomId) {
    state.room = roomId;
    safeSet(KEY.room, roomId);
    renderRoomChips();
    renderChat(true);
    if (isLiveRoom()) loadLiveMessages(true);
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
        var live = isLiveRoom();
        saveMessage(state.sender, text);
        input.value = '';
        input.style.height = '';
        if (!live) toast('말풍선에 남겼어요 (이 브라우저에만 저장)');
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

  /* ── 잠금 (암호화 금고) ─────────────────────
     현황 데이터는 data/status.enc.json에 AES-256-GCM으로 암호화돼 있습니다.
     · 열쇠(비밀 문구)는 소스 어디에도 없고, PBKDF2-SHA256 60만 회로 키를 만듭니다.
     · 이 기기 기억하기: 만든 키를 '꺼낼 수 없는' CryptoKey로 IndexedDB에만 둡니다.
     · PIN은 그 기기 안에서 쓰는 빠른 잠금이며, PIN 확인값도 암호문 안에 들어 있습니다.
     · PIN을 5번 틀리면 이 기기의 키를 지우고 열쇠를 다시 묻습니다.            */
  var PIN_LEN = 4;
  var PIN_MAX_FAIL = 5;
  var SESSION_KEY = 'ny-office:session';
  var FAIL_KEY = 'ny-office:pinfail';
  var DB_NAME = 'ny-office-vault';
  var DB_STORE = 'keys';
  var DEFAULT_LOCK_SUB = '4자리 PIN을 입력해 주세요';
  var SEALED = null;      /* status.enc.json 내용 */
  var OPENED = null;      /* 복호화된 현황 데이터 */
  var pinEntry = '';
  var pinBusy = false;
  var lockOnUnlock = null;

  function hasCrypto() {
    return !!(window.crypto && crypto.subtle && window.TextEncoder && window.indexedDB);
  }

  function b64ToBytes(s) {
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  /* IndexedDB: 꺼낼 수 없는 키만 저장 */
  function idb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(DB_STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbDo(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, mode);
        var r = fn(tx.objectStore(DB_STORE));
        tx.oncomplete = function () { resolve(r && r.result); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function loadDeviceKey() { return idbDo('readonly', function (s) { return s.get('k'); }).catch(function () { return null; }); }
  function saveDeviceKey(key) { return idbDo('readwrite', function (s) { return s.put(key, 'k'); }); }
  function dropDeviceKey() { return idbDo('readwrite', function (s) { return s.delete('k'); }).catch(function () {}); }

  function fetchSealed() {
    if (SEALED) return Promise.resolve(SEALED);
    return fetch('data/status.enc.json', { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('status.enc.json ' + res.status);
      return res.json();
    }).then(function (j) { SEALED = j; return j; });
  }

  function deriveKey(pass, sealed) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', hash: 'SHA-256', salt: b64ToBytes(sealed.salt), iterations: sealed.iter },
          base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      });
  }

  function openSealed(key, sealed) {
    return crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(sealed.iv), additionalData: new TextEncoder().encode('ny-office:v' + sealed.v) },
      key, b64ToBytes(sealed.ct)
    ).then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); });
  }

  function pinOk(pin) {
    var sec = (OPENED && OPENED.security) || {};
    if (!sec.pinHash || !sec.pinSalt) return Promise.resolve(false);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(sec.pinSalt + ':' + pin))
      .then(function (h) { return bytesToHex(h) === sec.pinHash; });
  }

  function failCount() { var n = parseInt(safeGet(FAIL_KEY, 0), 10); return isNaN(n) ? 0 : n; }
  function setFail(n) { if (n) safeSet(FAIL_KEY, n); else { try { localStorage.removeItem(FAIL_KEY); } catch (e) {} } }
  function sessionOn() { try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; } }
  function setSession(on) {
    try { if (on) sessionStorage.setItem(SESSION_KEY, '1'); else sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    document.documentElement.classList.toggle('is-authed', !!on);
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

  /* mode: 'pass' = 열쇠 입력, 'pin' = PIN 입력 */
  function showLock(mode, sub) {
    var el = lockOverlay();
    if (!el) return;
    pinEntry = '';
    pinBusy = false;
    paintDots();
    el.setAttribute('data-mode', mode);
    $('#lockPinArea').hidden = mode !== 'pin';
    $('#lockPassForm').hidden = mode !== 'pass';
    $('#lockForget').hidden = mode !== 'pin';
    lockSub(sub || (mode === 'pass' ? '이 기기에서 처음이에요. 비서실 열쇠를 입력해 주세요' : DEFAULT_LOCK_SUB));
    el.removeAttribute('hidden');
    el.style.display = 'grid';
    el.classList.remove('is-wrong');
    document.body.classList.add('locked');
    if (mode === 'pass') setTimeout(function () { var i = $('#lockPass'); if (i) i.focus(); }, 30);
  }

  function hideLock() {
    var el = lockOverlay();
    if (!el) return;
    el.setAttribute('hidden', '');
    el.style.display = 'none';
    document.body.classList.remove('locked');
  }

  function unlockNow() {
    setFail(0);
    setSession(true);
    pinEntry = '';
    paintDots();
    hideLock();
    var fn = lockOnUnlock;
    lockOnUnlock = null;
    if (fn) fn(OPENED);
  }

  function checkPin() {
    pinBusy = true;
    lockSub('확인 중…');
    pinOk(pinEntry).then(function (ok) {
      pinBusy = false;
      if (ok) { unlockNow(); return; }
      var n = failCount() + 1;
      pinEntry = '';
      paintDots();
      shakeLock();
      if (n >= PIN_MAX_FAIL) {
        setFail(0);
        OPENED = null;
        dropDeviceKey().then(function () {
          showLock('pass', 'PIN을 ' + PIN_MAX_FAIL + '번 틀려서 이 기기의 열쇠를 지웠어요. 열쇠를 다시 입력해 주세요');
        });
        return;
      }
      setFail(n);
      lockSub('PIN이 맞지 않아요 (' + n + '/' + PIN_MAX_FAIL + ')');
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

  function submitPass(e) {
    e.preventDefault();
    var input = $('#lockPass');
    var remember = $('#lockRemember');
    var pass = (input && input.value || '').trim();
    if (!pass) return;
    var btn = $('#lockPassBtn');
    if (btn) btn.disabled = true;
    lockSub('열쇠 확인 중… (몇 초 걸려요)');
    fetchSealed().then(function (sealed) {
      return deriveKey(pass, sealed).then(function (key) {
        return openSealed(key, sealed).then(function (data) {
          OPENED = data;
          if (input) input.value = '';
          return (remember && remember.checked) ? saveDeviceKey(key).catch(function () {}) : null;
        });
      });
    }).then(function () {
      if (btn) btn.disabled = false;
      unlockNow();
    }).catch(function () {
      if (btn) btn.disabled = false;
      shakeLock();
      lockSub('열쇠가 맞지 않아요. 다시 확인해 주세요');
    });
  }

  function lockNow() {
    setSession(false);
    if (OPENED) showLock('pin');
    else showLock('pass');
  }

  function forgetDevice() {
    setSession(false);
    setFail(0);
    OPENED = null;
    dropDeviceKey().then(function () { showLock('pass', '이 기기에서 열쇠를 지웠어요'); });
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
      if (!el || el.hasAttribute('hidden') || el.getAttribute('data-mode') !== 'pin') return;
      if (/^[0-9]$/.test(e.key)) { pressKey(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { pressKey('del'); e.preventDefault(); }
    });
    var form = $('#lockPassForm');
    if (form) form.addEventListener('submit', submitPass);
    var forget = $('#lockForget');
    if (forget) forget.addEventListener('click', forgetDevice);
    var btn = document.getElementById('lockBtn');
    if (btn) btn.addEventListener('click', lockNow);

    if (!hasCrypto()) {
      showLock('pass', '이 브라우저에서는 암호를 풀 수 없어요. https 주소로 최신 브라우저에서 열어 주세요');
      $('#lockPassForm').hidden = true;
      return;
    }

    Promise.all([fetchSealed(), loadDeviceKey()]).then(function (r) {
      var sealed = r[0], key = r[1];
      if (!key) { setSession(false); showLock('pass'); return; }
      return openSealed(key, sealed).then(function (data) {
        OPENED = data;
        if (sessionOn()) unlockNow();
        else showLock('pin');
      }).catch(function () {
        /* 데이터가 새 열쇠로 다시 잠긴 경우 */
        dropDeviceKey();
        setSession(false);
        showLock('pass', '열쇠가 바뀌었어요. 새 열쇠를 입력해 주세요');
      });
    }).catch(function () {
      setSession(false);
      showLock('pass', '현황 데이터를 불러오지 못했어요. 잠시 후 다시 열어 주세요');
    });
  }

  /* ── 할 일함: 대시보드 ↔ 노션 AI 회사 DB (중계 서버 경유) ── */
  var INBOX = { items: [], busy: false, at: null };
  function relay() { return (DATA && DATA.relay) || null; }

  function relayFetch(path, opts) {
    var r = relay();
    if (!r || !r.base || !r.token) return Promise.reject(new Error('relay'));
    opts = opts || {};
    return fetch(r.base + path, {
      method: opts.method || 'GET',
      headers: { 'Authorization': 'Bearer ' + r.token, 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store'
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) { var e = new Error(j.error || ('HTTP ' + res.status)); e.status = res.status; throw e; }
        return j;
      });
    });
  }

  var STATUS_ORDER = { '확인 필요': 0, '승인됨': 1, '진행 중': 2, '대기': 3 };
  var STATUS_CLS = { '확인 필요': 'need', '승인됨': 'ok', '진행 중': 'run', '대기': 'wait' };

  function inboxBadge() {
    var n = INBOX.items.filter(function (i) { return i.status === '확인 필요'; }).length;
    var btn = document.getElementById('tabbtn-work');
    if (!btn) return;
    var b = btn.querySelector('.tab-badge');
    if (!b) { b = document.createElement('span'); b.className = 'tab-badge'; btn.appendChild(b); }
    b.textContent = n ? String(n) : '';
    b.hidden = !n;
  }

  function renderInbox() {
    var box = $('#inboxList');
    if (!box) return;
    var meta = $('#inboxMeta');
    if (!relay()) {
      box.innerHTML = '<p class="inbox-empty">아직 중계 서버가 연결되지 않았어요.</p>';
      return;
    }
    if (meta) meta.textContent = INBOX.at ? ('업데이트 ' + new Date(INBOX.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })) : '';
    var items = INBOX.items.slice().sort(function (a, b) {
      return (STATUS_ORDER[a.status] || 9) - (STATUS_ORDER[b.status] || 9);
    });
    if (!items.length) { box.innerHTML = '<p class="inbox-empty">쌓인 일이 없어요 🎉</p>'; inboxBadge(); return; }
    box.innerHTML = items.map(function (it) {
      var who = (it.assignees || []).join('·') || '담당 없음';
      var acts = '';
      if (it.status === '확인 필요') {
        acts = '<button class="ib-btn ib-ok" data-act="approve" type="button">✅ 승인</button>' +
               '<button class="ib-btn" data-act="reject" type="button">반려</button>';
      } else if (it.status === '대기' || it.status === '진행 중') {
        acts = '<button class="ib-btn" data-act="done" type="button">☑ 끝났어요</button>';
      }
      acts += '<button class="ib-btn" data-act="comment" type="button">💬 한마디</button>' +
              '<a class="ib-btn ib-link" href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer">노션</a>';
      return '<article class="ib-item" data-id="' + esc(it.id) + '">' +
        '<div class="ib-top"><span class="ib-status ib-' + (STATUS_CLS[it.status] || 'wait') + '">' + esc(it.status) + '</span>' +
        (it.priority ? '<span class="ib-pri">' + esc(it.priority) + '</span>' : '') +
        '<span class="ib-kind">' + esc(it.kind) + ' · ' + esc(who) + '</span></div>' +
        '<h3 class="ib-title">' + esc(it.title || '(제목 없음)') + '</h3>' +
        (it.result ? '<p class="ib-result">' + esc(it.result) + '</p>' : '') +
        (it.due ? '<p class="ib-due">마감 ' + esc(String(it.due).slice(0, 16).replace('T', ' ')) + '</p>' : '') +
        '<div class="ib-acts">' + acts + '</div></article>';
    }).join('');
    inboxBadge();
  }

  function loadInbox(quiet) {
    if (!relay() || INBOX.busy) { renderInbox(); return; }
    INBOX.busy = true;
    var box = $('#inboxList');
    if (box && !quiet && !INBOX.items.length) box.innerHTML = '<p class="inbox-empty">불러오는 중…</p>';
    relayFetch('/api/queue').then(function (j) {
      INBOX.items = j.items || [];
      INBOX.at = j.at || new Date().toISOString();
      renderInbox();
    }).catch(function (e) {
      if (box) box.innerHTML = '<p class="inbox-empty">' + (e.status === 503 ? '중계 서버에 노션 연결이 아직 안 됐어요.' : '할 일함을 불러오지 못했어요. 잠시 후 다시 눌러 주세요.') + '</p>';
    }).then(function () { INBOX.busy = false; });
  }

  function doAction(id, act) {
    var note = '';
    if (act === 'comment') {
      note = window.prompt('비서들에게 남길 말');
      if (!note) return;
    } else if (act === 'reject') {
      note = window.prompt('반려 이유 (선택)') || '';
    } else if (act === 'approve') {
      note = window.prompt('승인 메모 (선택, 비워도 돼요)') || '';
    }
    relayFetch('/api/action', { method: 'POST', body: { id: id, action: act, note: note } }).then(function (j) {
      var i = INBOX.items.findIndex(function (x) { return x.id === id; });
      if (j.item && i >= 0) {
        if (['대기', '진행 중', '확인 필요', '승인됨'].indexOf(j.item.status) >= 0) INBOX.items[i] = j.item;
        else INBOX.items.splice(i, 1);
      }
      renderInbox();
      toast({ approve: '승인했어요. 담당 비서가 다음 차례에 마무리해요', reject: '반려했어요', done: '완료로 표시했어요', comment: '노션에 남겼어요', reopen: '다시 요청했어요' }[act] || '반영했어요');
    }).catch(function () { toast('반영하지 못했어요. 다시 시도해 주세요'); });
  }

  function submitRequest(e) {
    e.preventDefault();
    var f = e.target;
    var body = {
      title: f.querySelector('[name=title]').value,
      assignee: f.querySelector('[name=assignee]').value,
      priority: f.querySelector('[name=priority]').value,
      body: f.querySelector('[name=body]').value
    };
    if (!body.title.trim()) { toast('무엇을 할지 한 줄로 적어 주세요'); return; }
    var btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    relayFetch('/api/request', { method: 'POST', body: body }).then(function (j) {
      if (j.item) INBOX.items.unshift(j.item);
      f.reset();
      renderInbox();
      toast(body.assignee + '에게 요청했어요');
    }).catch(function () { toast('요청을 보내지 못했어요'); }).then(function () { btn.disabled = false; });
  }

  function initInbox() {
    var list = $('#inboxList');
    if (!list || list.getAttribute('data-ready')) return;
    list.setAttribute('data-ready', '1');
    list.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var card = b.closest('[data-id]');
      if (card) doAction(card.getAttribute('data-id'), b.getAttribute('data-act'));
    });
    var form = $('#inboxForm');
    if (form) form.addEventListener('submit', submitRequest);
    var re = $('#inboxRefresh');
    if (re) re.addEventListener('click', function () { loadInbox(false); });
    loadInbox(false);
    setInterval(function () { if (!document.hidden && document.body.classList.contains('locked') === false) loadInbox(true); }, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) loadInbox(true); });
  }

  /* ── 현황판 실시간: 노션 AI 회사 DB (중계 서버 /api/board) ── */
  var GAMI_PROFILE = {
    id: 'gami', emoji: '🟠', name: '감이', role: '두 번째 피클', tag: '제작 · 디자인 요소', state: 'active', stateLabel: '',
    color: '#E37A3B', summary: '디지털 상품과 미리캔버스 요소를 만드는 제작 담당 비서예요.',
    duties: ['미리캔버스 요소 생성·전처리', '상품 미리보기 이미지', '제작물 드라이브 정리'],
    recent: [], integration: '노션(AI 회사) · 구글 드라이브', link: { label: '노션 AI 회사', url: 'https://app.notion.com/p/3acf852d228f8005a8d4f877551b3d60' }
  };
  function applyBoard(j) {
    if (!j || !Array.isArray(j.tasks)) return;
    DATA.tasks = j.tasks.slice(0, 40).map(function (t) {
      return { id: t.id, url: t.url, emoji: t.emoji, title: t.title, owner: t.owner, tag: t.tag,
        status: t.status === 'check' ? 'active' : t.status, statusLabel: t.statusLabel, time: t.time, summary: t.summary };
    });
    DATA.schedule = j.schedule || [];
    DATA.liveCounts = j.counts || null;
    DATA.updatedAt = j.at || DATA.updatedAt;
    var list = DATA.assistants || [];
    if (!list.some(function (a) { return a.name === '감이'; })) list.push(GAMI_PROFILE);
    list.forEach(function (a) {
      var st = j.staff && j.staff[a.name];
      if (!st) return;
      a.recent = st.recent.length ? st.recent : a.recent;
      var bits = [];
      if (st.check) bits.push('확인 필요 ' + st.check);
      bits.push('진행 ' + st.running);
      bits.push('대기 ' + st.waiting);
      a.stateLabel = bits.join(' · ');
      a.state = (st.running || st.waiting || st.check) ? 'active' : 'manual';
    });
    DATA.assistants = list;
    var sub = document.getElementById('staffSub');
    if (sub) sub.textContent = '지금 나영 님을 돕는 ' + list.length + '명 · 숫자는 노션 기준 실시간이에요.';
    var c = j.counts || {};
    DATA.headline = Object.assign({}, DATA.headline, {
      title: c.check ? '대장님, 확인할 일 ' + c.check + '건이 있어요' : '대장님, 진행 중인 일 ' + (c.active || 0) + '건이에요',
      desc: '오늘 완료 ' + (c.todayDone || 0) + '건 · 노션 기준 ' + stampLabel(DATA.updatedAt) + ' 갱신'
    });
    DATA.mapChips = (DATA.mapChips || []).filter(function (x) { return x.kind !== 'status'; }).concat([
      { emoji: '🟢', label: '노션 실시간', kind: 'status' },
      { emoji: '👥', label: '비서 ' + list.length + '명', kind: 'status' }
    ]);
    renderMap(); renderTasks(); renderStaff();
  }
  function loadBoard() {
    if (!relay()) return Promise.resolve();
    return relayFetch('/api/board').then(applyBoard).catch(function () { /* 실패하면 저장된 현황 그대로 */ });
  }
  function initBoard() {
    loadBoard();
    setInterval(function () { if (!document.hidden) loadBoard(); }, 300000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) loadBoard(); });
  }

  /* ── 보고함: 노션 '보고' 행 (중계 서버 /api/reports) ── */
  var REPORTS = { items: [], open: {}, bodies: {} };
  function reportBadge() {
    var seen = safeGet('ny-office:reports-seen', '');
    var n = REPORTS.items.filter(function (r) { return (r.created || '') > seen; }).length;
    var btn = document.getElementById('tabbtn-report');
    if (!btn) return;
    var b = btn.querySelector('.tab-badge');
    if (!b) { b = document.createElement('span'); b.className = 'tab-badge'; btn.appendChild(b); }
    b.textContent = n ? String(n) : ''; b.hidden = !n;
  }
  function markReportsSeen() {
    if (REPORTS.items.length) safeSet('ny-office:reports-seen', REPORTS.items[0].created || '');
    reportBadge();
  }
  function renderReportBody(blocks) {
    return blocks.map(function (b) {
      if (b.t === 'h') return '<h4>' + esc(b.text) + '</h4>';
      if (b.t === 'li') return '<p class="rp-li">• ' + linkifyMentions(esc(b.text)) + '</p>';
      if (b.t === 'q') return '<p class="rp-q">' + esc(b.text) + '</p>';
      if (b.t === 'table') {
        return '<div class="rp-table"><table>' + b.rows.map(function (r, i) {
          var tag = i === 0 ? 'th' : 'td';
          return '<tr>' + r.map(function (c) { return '<' + tag + '>' + esc(c) + '</' + tag + '>'; }).join('') + '</tr>';
        }).join('') + '</table></div>';
      }
      return '<p>' + linkifyMentions(esc(b.text)) + '</p>';
    }).join('');
  }
  function renderReports() {
    var box = $('#reportList');
    if (!box) return;
    if (!REPORTS.items.length) { box.innerHTML = '<p class="empty">아직 올라온 보고가 없어요.</p>'; return; }
    box.innerHTML = REPORTS.items.map(function (r) {
      var open = !!REPORTS.open[r.id];
      var body = REPORTS.bodies[r.id];
      return '<article class="report card' + (open ? ' is-open' : '') + '" data-id="' + esc(r.id) + '">' +
        '<button class="report-head" type="button" data-toggle="1" aria-expanded="' + open + '">' +
          '<span class="report-title">' + esc(r.title) + '</span>' +
          '<span class="report-meta">' + esc(stampLabel(r.created)) + ' · ' + esc((r.assignees || []).join('·') || '클로드') + '</span>' +
          (r.result ? '<span class="report-sum">' + esc(r.result) + '</span>' : '') +
        '</button>' +
        (open ? '<div class="report-body">' + (body ? renderReportBody(body) : '<p class="empty">불러오는 중…</p>') +
          '<a class="task-link" href="' + esc(r.url) + '" target="_blank" rel="noopener">노션에서 보기 ↗</a></div>' : '') +
        '</article>';
    }).join('');
  }
  function loadReports() {
    if (!relay()) return Promise.resolve();
    return relayFetch('/api/reports').then(function (j) {
      REPORTS.items = j.items || [];
      if (REPORTS.items.length && !Object.keys(REPORTS.open).length) toggleReport(REPORTS.items[0].id, true);
      renderReports();
      if (state.tab === 'report') markReportsSeen(); else reportBadge();
    }).catch(function () { var box = $('#reportList'); if (box && !REPORTS.items.length) box.innerHTML = '<p class="empty">보고를 불러오지 못했어요.</p>'; });
  }
  function toggleReport(id, force) {
    REPORTS.open[id] = force === true ? true : !REPORTS.open[id];
    renderReports();
    if (REPORTS.open[id] && !REPORTS.bodies[id]) {
      relayFetch('/api/reports?id=' + encodeURIComponent(id)).then(function (j) {
        REPORTS.bodies[id] = j.blocks || []; renderReports();
      }).catch(function () { REPORTS.bodies[id] = [{ t: 'p', text: '본문을 불러오지 못했어요.' }]; renderReports(); });
    }
  }
  function initReports() {
    var box = $('#reportList');
    if (box) box.addEventListener('click', function (e) {
      var t = e.target.closest('[data-toggle]');
      if (!t) return;
      var card = t.closest('[data-id]');
      if (card) toggleReport(card.getAttribute('data-id'));
    });
    loadReports();
    setInterval(function () { if (!document.hidden) loadReports(); }, 300000);
  }

  /* ── 회의실 실시간: 노션 '회의' 페이지 댓글 (중계 서버 /api/chat) ── */
  var LIVE = { rooms: [], msgs: {}, at: '', timer: null };
  function isLiveRoom() { return /^n:/.test(state.room || ''); }
  function hhmm(iso) {
    try { var d = new Date(iso); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); } catch (e) { return ''; }
  }
  function stripTag(t) { return String(t || '').replace(/^\s*\[[^\]]{1,12}\]\s*/, ''); }

  function loadLiveRooms() {
    if (!relay()) return Promise.resolve();
    return relayFetch('/api/chat').then(function (j) {
      LIVE.rooms = j.rooms || [];
      var ids = LIVE.rooms.map(function (r) { return 'n:' + r.id; });
      /* 처음이거나(저장된 방이 기본 지휘실) 저장된 노션 방이 사라졌으면 → 귤이 대화방으로 */
      var stale = isLiveRoom() && ids.indexOf(state.room) < 0;
      if (ids.length && (stale || state.room === 'command')) {
        var pick = LIVE.rooms.filter(function (r) { return /귤이/.test(r.title); })[0] || LIVE.rooms[0];
        state.room = 'n:' + pick.id;
      } else if (stale) state.room = 'command';
      renderRoomChips();
      if (isLiveRoom()) return loadLiveMessages(true);
      renderChat();
    }).catch(function () { /* 중계 서버 없으면 기존 말풍선만 */ });
  }

  function loadLiveMessages(toBottom) {
    if (!isLiveRoom()) return Promise.resolve();
    var id = state.room.slice(2);
    return relayFetch('/api/chat?room=' + encodeURIComponent(id)).then(function (j) {
      LIVE.msgs[id] = (j.messages || []).map(function (m) {
        return { from: m.from, text: stripTag(m.text), time: hhmm(m.at) };
      });
      LIVE.at = nowTimeLabel();
      var seenKey = 'ny-office:seen:' + id;
      var last = LIVE.msgs[id].length ? (j.messages[j.messages.length - 1].at || '') : '';
      if (state.tab === 'meeting' && !document.hidden) { safeSet(seenKey, last); meetBadge(0); }
      else {
        var seen = safeGet(seenKey, '');
        meetBadge((j.messages || []).filter(function (m) { return m.at > seen && m.from !== 'nayeong'; }).length);
      }
      if (state.room === 'n:' + id) {
        renderRoomChips();
        renderChat(toBottom);
      }
    }).catch(function () { toast('대화방을 불러오지 못했어요'); });
  }

  function meetBadge(n) {
    var btn = document.getElementById('tabbtn-meeting');
    if (!btn) return;
    var b = btn.querySelector('.tab-badge');
    if (!b) { b = document.createElement('span'); b.className = 'tab-badge'; btn.appendChild(b); }
    b.textContent = n ? String(n > 9 ? '9+' : n) : '';
    b.hidden = !n;
  }

  function sendLive(text) {
    var id = state.room.slice(2);
    var btn = $('#sendBtn'); if (btn) btn.disabled = true;
    (LIVE.msgs[id] = LIVE.msgs[id] || []).push({ from: 'nayeong', text: text, time: '보내는 중' });
    renderChat(true);
    return relayFetch('/api/chat', { method: 'POST', body: { room: id, text: text } }).then(function () {
      toast('노션 대화방에 보냈어요');
      return loadLiveMessages(true);
    }).catch(function () {
      LIVE.msgs[id].pop(); renderChat(true);
      toast('보내지 못했어요 — 잠시 후 다시');
      var input = $('#chatInput'); if (input && !input.value) input.value = text;
    }).then(function () { if (btn) btn.disabled = false; });
  }

  function initLiveChat() {
    loadLiveRooms();
    var tick = 0;
    LIVE.timer = setInterval(function () {
      tick++;
      if (document.hidden || !isLiveRoom()) return;
      if (state.tab === 'meeting' || tick % 2 === 0) loadLiveMessages(false);
    }, 30000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && state.tab === 'meeting' && isLiveRoom()) loadLiveMessages(false);
    });
  }

  /* ── boot ──────────────────────────────── */
  function boot(data) {
    if (!data) {
      var main = document.querySelector('main');
      if (main) {
        main.innerHTML = '<div class="card" style="padding:20px;margin-top:16px">' +
          '<h2 style="margin:0 0 6px;font-size:16px">현황 데이터를 불러오지 못했어요</h2>' +
          '<p style="margin:0;font-size:12.5px;color:#8a6a4a">잠시 후 다시 열어 주세요.</p></div>';
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
    initInbox();
    initLiveChat();
    initBoard();
    initReports();
    setTab(state.tab, { hash: false });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initLock(function (data) { boot(data || null); });
  });
})();
