function snapshotNow() { return JSON.parse(JSON.stringify(getDB())); }

let toastTimer = null;
function showToast(msg, undoSnap) {
    const t = document.getElementById('toast');
    t.innerHTML = `<span>${esc(msg)}</span>${undoSnap ? '<button id="undoBtn">Undo</button>' : ''}`;
    t.style.display = 'flex';
    if (undoSnap) document.getElementById('undoBtn').onclick = () => {
        t.style.display = 'none';
        replaceDB(undoSnap);
        saveDB(undoSnap);
        refreshAll();
    };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.display = 'none'; }, 6000);
}

function commitWithUndo(db, snap, msg) {
    saveDB(db);
    showToast(msg, snap);
}

function refreshAll() {
    renderPrayers();
    if (document.getElementById('answeredSection').style.display !== 'none') renderAnswered();
    if (document.getElementById('calendarSection').style.display !== 'none') renderCalendar();
}

function esc(t) {
    return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let currentDay = '';

let draggedItem = null;

function initDragAndTouchEvents(el, dayKey) {
    el.addEventListener('dragstart', () => { draggedItem = el; setTimeout(() => el.classList.add('dragging'), 0); });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); saveOrder(el.closest('.drag-container')); draggedItem = null; });

    const handle = el.querySelector('.drag-handle');
    handle.addEventListener('touchstart', (e) => { draggedItem = el; el.classList.add('dragging'); }, {passive: true});

    handle.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const container = el.closest('.drag-container');
        const overItem = target ? target.closest('.prayer-item') : null;

        if (overItem && overItem !== el && overItem.closest('.drag-container') === container) {
            e.preventDefault();
            const rect = overItem.getBoundingClientRect();
            const next = touch.clientY > rect.top + rect.height / 2;
            container.insertBefore(el, next ? overItem.nextSibling : overItem);
        }
    }, {passive: false});

    handle.addEventListener('touchend', () => { el.classList.remove('dragging'); saveOrder(el.closest('.drag-container')); draggedItem = null; });
}

document.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!draggedItem) return;
    const container = draggedItem.closest('.drag-container');
    const overItem = e.target.closest('.prayer-item');
    if (overItem && overItem !== draggedItem && overItem.closest('.drag-container') === container) {
        const rect = overItem.getBoundingClientRect();
        const next = e.clientY > rect.top + rect.height / 2;
        container.insertBefore(draggedItem, next ? overItem.nextSibling : overItem);
    }
});

function saveOrder(container) {
    if (!container) return;
    const listKey = container.dataset.key;
    const children = [...container.querySelectorAll('.prayer-item')];
    const db = getDB();
    const newOrder = children.map(c => JSON.parse(c.dataset.raw));

    if (listKey === 'everyday') {
        db.everyday = newOrder;
    } else {
        const isSpecialSection = children[0]?.classList.contains('is-special-item');
        if (isSpecialSection) {
            const nonSpecial = db[currentDay].filter(p => !p.isSpecial);
            db[currentDay] = [...newOrder, ...nonSpecial];
        } else {
            const specials = db[currentDay].filter(p => p.isSpecial);
            db[currentDay] = [...specials, ...newOrder];
        }
    }
    saveDB(db);
}

function showModal(msg, buttons, showInput = false, prefillValue = '') {
    const overlay = document.getElementById('modalOverlay');
    document.getElementById('modalMsg').innerText = msg;
    const container = document.getElementById('modalButtons');
    const inputContainer = document.getElementById('modalInputContainer');
    inputContainer.innerHTML = showInput ? `<input type="text" id="modalField" style="width:100%; padding:12px; margin-bottom:15px; border-radius:8px; border:2px solid var(--sand); font-family: 'Cormorant Garamond', serif; font-size: 1.2rem; outline:none;" placeholder="...">` : '';
    if (showInput) document.getElementById('modalField').value = prefillValue;
    container.innerHTML = '';
    buttons.forEach(b => {
        const btn = document.createElement('button');
        btn.className = 'nav-btn';
        btn.style.background = b.bg || 'var(--sand)';
        btn.style.color = b.color || 'var(--text-color)';
        btn.innerText = b.text;
        btn.onclick = () => {
            const val = showInput ? document.getElementById('modalField').value.trim() : null;
            overlay.style.display = 'none';
            b.action(val);
        };
        container.appendChild(btn);
    });
    overlay.style.display = 'flex';
}

function initDaySelector() {
    const container = document.getElementById('mainDaySelector');
    container.innerHTML = weekDays.map(d => `<button class="day-btn" id="btn-${d}" onclick="selectDay('${d}')">${d.substring(0,3)}</button>`).join('');
    const todayIdx = new Date().getDay();
    selectDay(weekDays[todayIdx === 0 ? 6 : todayIdx - 1]);
}

function selectDay(day) {
    currentDay = day;
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + day).classList.add('active');
    showView();
}

function hideExtraSections() {
    document.getElementById('answeredSection').style.display = 'none';
    document.getElementById('calendarSection').style.display = 'none';
}

function showView() {
    hideExtraSections();
    document.getElementById('viewSection').style.display = 'block';
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('viewModeBtn').classList.add('active');
    renderPrayers();
}

// Fill in spread dates for the viewed month and drop finished one-offs.
function ensureSpreadAssignments(db, viewDate) {
    const mk = monthKey(viewDate);
    const nowKey = monthKey(new Date());
    let changed = false;
    const before = db.monthly.length;
    const todayKey = dateKey(new Date());
    db.monthly = db.monthly.filter(m => {
        if (m.rule.type === 'date') return m.rule.yearly || m.rule.date >= todayKey;
        if (m.rule.type === 'range') return (m.rule.end || m.rule.start) >= todayKey;
        if (m.rule.recurring !== false && (m.rule.type !== 'spread' || m.rule.recurring)) return true;
        return !m.month || m.month >= nowKey;
    });
    if (db.monthly.length !== before) changed = true;
    // Scheduled points remove themselves once they can't come up again.
    ['everyday', ...weekDays, 'monthly'].forEach(k => (db[k] || []).forEach(p => {
        if (!p.subs || !p.subs.some(s => pointExpired(s, todayKey))) return;
        p.subs = p.subs.filter(s => !pointExpired(s, todayKey));
        changed = true;
    }));
    db.monthly.forEach(m => {
        if (m.rule.type !== 'spread') return;
        const applies = m.rule.recurring ? true : m.month === mk;
        if (!applies || (m.assigned && m.assigned[mk])) return;
        assignSpread(db, m, viewDate.getFullYear(), viewDate.getMonth(), 1);
        changed = true;
    });
    if (changed) saveDB(db);
}

function viewedDate() {
    const today = new Date();
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(d.getDate() + ((weekDays.indexOf(currentDay) - wdIndex(today) + 7) % 7));
    return d;
}

function removeMoveSource(db, src) {
    if (src.groupId) weekDays.forEach(d => db[d] = db[d].filter(p => p.groupId !== src.groupId));
    else db[src.dayKey] = db[src.dayKey].filter(p => p.id !== src.id);
}

function movePrayer(dayKey, id, groupId, text) {
    const db = getDB();
    const p = db[dayKey].find(x => x.id === id);
    if (!p) return;
    text = text || p.text;
    const src = { dayKey, id, groupId, subs: p.subs || [] };
    const opts = [];
    if (dayKey !== 'everyday') opts.push({ text: "Everyday", action: () => {
        removeMoveSource(db, src);
        db.everyday.push({ id: Date.now(), text, subs: src.subs });
        saveDB(db);
    }});
    if (!groupId) opts.push({ text: "Another schedule…", action: () => openAdd({ move: src, title: 'Move Prayer', saveLabel: 'Move Prayer' }, text) });
    else opts.push({ text: "Special (change days)", action: () => openEditGroupDays(groupId) });
    if (dayKey === 'everyday' || groupId) opts.push({ text: `${currentDay} Only`, action: () => {
        removeMoveSource(db, src);
        db[currentDay].push({ id: Date.now(), text, subs: src.subs });
        saveDB(db);
    }});
    opts.push({ text: "Cancel", isCancel: true, action: () => {} });
    showModal("Move to:", opts);
}

function editPrayerRequest(dayKey, id, groupId = null) {
    const db = getDB();
    const p = db[dayKey].find(x => x.id === id);
    if (!p) return;
    if (dayKey === 'monthly') {
        showModal("Edit monthly prayer text:", [
            { text: "Save", bg: 'var(--gold)', color: 'white', action: (val) => {
                if (!val) return;
                p.text = val;
                saveDB(db);
            }},
            { text: "Change Schedule", action: () => openEditMonthly(id) },
            { text: "Cancel", isCancel: true, action: () => {} }
        ], true, p.text);
    } else if (groupId) {
        showModal("Edit special prayer text:", [
            { text: "Just Today", action: (val) => {
                if (!val) return;
                p.text = val;
                saveDB(db);
            }},
            { text: "All Days", bg: 'var(--gold)', color: 'white', action: (val) => {
                if (!val) return;
                weekDays.forEach(d => {
                    const inst = db[d].find(pr => pr.groupId === groupId);
                    if (inst) inst.text = val;
                });
                saveDB(db);
            }},
            { text: "Change Days", action: () => openEditGroupDays(groupId) },
            { text: "Move to Another Group", action: (val) => movePrayer(dayKey, id, groupId, val) },
            { text: "Cancel", isCancel: true, action: () => {} }
        ], true, p.text);
    } else {
        showModal("Edit prayer text:", [
            { text: "Save", bg: 'var(--gold)', color: 'white', action: (val) => {
                if (!val) return;
                p.text = val;
                saveDB(db);
            }},
            { text: "Move to Another Group", action: (val) => movePrayer(dayKey, id, null, val) },
            { text: "Cancel", isCancel: true, action: () => {} }
        ], true, p.text);
    }
}

function deletePrayerRequest(dayKey, id, groupId = null) {
    const db = getDB();
    const snap = snapshotNow();
    if (groupId) {
        showModal("Delete Special Prayer?", [
            ...(weekDays.includes(dayKey) ? [{ text: "Today Only", action: () => { db[dayKey] = db[dayKey].filter(p => p.id !== id); commitWithUndo(db, snap, 'Prayer deleted'); }}] : []),
            { text: "All Days", bg: 'var(--terracotta)', color: 'white', action: () => {
                weekDays.forEach(d => db[d] = db[d].filter(p => p.groupId !== groupId));
                commitWithUndo(db, snap, 'Prayer deleted');
            }},
            { text: "Cancel", isCancel: true, action: () => {} }
        ]);
    } else {
        showModal("Delete this prayer?", [
            { text: "Delete", bg: 'var(--terracotta)', color: 'white', action: () => {
                db[dayKey] = db[dayKey].filter(p => p.id !== id);
                commitWithUndo(db, snap, 'Prayer deleted');
            }},
            { text: "Cancel", isCancel: true, action: () => {} }
        ]);
    }
}

function deleteSub(dk, pi, si) {
    const db = getDB();
    const snap = snapshotNow();
    const p = db[dk].find(x => x.id === pi);
    if (!p) return;
    const subTxt = p.subs.find(s => s.id === si).text;
    if (p.isSpecial && p.groupId) {
        showModal("Delete point?", [
            { text: "Today Only", action: () => { p.subs = p.subs.filter(s => s.id !== si); commitWithUndo(db, snap, 'Point deleted'); }},
            { text: "All Days", bg: 'var(--terracotta)', color: 'white', action: () => {
                const gId = p.groupId;
                weekDays.forEach(d => {
                    const inst = db[d].find(pr => pr.groupId === gId);
                    if(inst && inst.subs) inst.subs = inst.subs.filter(s => s.text !== subTxt);
                });
                commitWithUndo(db, snap, 'Point deleted');
            }},
            {text: "Cancel", isCancel: true, action: () => {}}
        ]);
    } else {
        p.subs = p.subs.filter(s => s.id !== si);
        commitWithUndo(db, snap, 'Point deleted');
    }
}

function renderPrayers() {
    const db = getDB();
    const listContainer = document.getElementById('prayerList');
    listContainer.innerHTML = '';

    const vDate = viewedDate();
    ensureSpreadAssignments(db, vDate);
    const monthlyToday = db.monthly.filter(m => monthlyApplies(m, vDate));

    const vLabel = vDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const own = (key, list) => list.map(p => ({ p, key }));
    // Each item carries the list it lives in (key), so buttons act on the right prayer.
    const categories = [
        { label: 'Everyday', key: 'everyday', drag: true, items: own('everyday', db.everyday) },
        { label: 'Special Prayers', key: currentDay, drag: true, items: own(currentDay, db[currentDay].filter(p => p.isSpecial)) },
        { label: `Scheduled · ${vLabel}`, key: 'monthly', drag: false, items: own('monthly', monthlyToday) },
        { label: `Prayer points · ${vLabel}`, key: 'points', drag: false, items: surfacedPoints(db, vDate).map(x => ({ p: x.p, key: x.key, only: x.subs })) },
        { label: currentDay, key: currentDay, drag: true, items: own(currentDay, db[currentDay].filter(p => !p.isSpecial)) }
    ];

    const vKey = dateKey(vDate);
    let total = 0, done = 0;

    categories.forEach(cat => {
        if (cat.items.length === 0) return;

        const groupDiv = document.createElement('div');
        groupDiv.className = 'drag-container';
        groupDiv.dataset.key = cat.key;
        groupDiv.innerHTML = `<div class="prayer-group-title">${cat.label}</div>`;

        cat.items.forEach(({ p, key, only }) => {
            const pDiv = document.createElement('div');
            const prayed = db.prayed.includes(`${vKey}:${p.id}`);
            total++; if (prayed) done++;
            pDiv.className = `prayer-item ${p.isSpecial ? 'is-special-item' : ''} ${prayed ? 'prayed' : ''}`;
            pDiv.draggable = cat.drag;
            pDiv.dataset.raw = JSON.stringify(p);

            const subsHtml = (only || p.subs || []).map(s => {
                const on = pointApplies(s, vDate);
                const meta = s.sched ? `<span class="sub-tag ${on ? 'on' : ''}">${esc(describePoint(s.sched))}</span>`
                    : s.date ? `<span class="sub-date">${esc(shortDate(s.date))}</span>` : '';
                return `
                <div class="sub-item ${s.sched && !on ? 'sub-off' : ''}">
                    <span class="sub-text">• ${esc(s.text)}${meta}</span>
                    <button class="icon-btn sub-delete" onclick="event.stopPropagation(); deleteSub('${key}', ${p.id}, ${s.id})">🗑</button>
                </div>`;
            }).join('');

            pDiv.innerHTML = `
                <div class="drag-handle" ${cat.drag ? '' : 'style="visibility:hidden"'}>≡</div>
                <div class="prayer-content">
                    <div class="prayer-header">
                        <div class="prayer-text">${esc(p.text)}</div>
                        <div class="prayer-actions">
                            <button class="icon-btn check-btn" onclick="event.stopPropagation(); togglePrayed(${p.id})">${prayed ? '✔' : '○'}</button>
                            <button class="icon-btn" title="Add a point" onclick="event.stopPropagation(); addSub('${key}', ${p.id})">➕</button>
                            <button class="icon-btn" onclick="event.stopPropagation(); editPrayerRequest('${key}', ${p.id}, ${p.groupId})">✏️</button>
                            <button class="icon-btn" onclick="event.stopPropagation(); openPrayerMenu('${key}', ${p.id}, ${p.groupId})">⋯</button>
                        </div>
                    </div>
                    ${subsHtml ? `<div class="sub-list">${subsHtml}</div>` : ''}
                </div>
            `;
            if (cat.drag) initDragAndTouchEvents(pDiv, key);
            groupDiv.appendChild(pDiv);
        });
        listContainer.appendChild(groupDiv);
    });

    if (listContainer.innerHTML === '') {
        listContainer.innerHTML = '<p style="text-align:center; padding:20px; opacity:0.5;">Empty.</p>';
    }
    document.getElementById('progressLine').innerText = total ? `Prayed ${done} of ${total} · ${shortDate(vKey)}` : '';
}

function shortDate(k) {
    return parseDateKey(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function togglePrayed(id) {
    const db = getDB();
    const key = `${dateKey(viewedDate())}:${id}`;
    const i = db.prayed.indexOf(key);
    i > -1 ? db.prayed.splice(i, 1) : db.prayed.push(key);
    const cutoff = dateKey(new Date(Date.now() - 45 * 86400000));
    db.prayed = db.prayed.filter(k => k.slice(0, 10) >= cutoff);
    saveDB(db);
    renderPrayers();
}

// The list of special and scheduled prayers lives under the Calendar.
function renderSpecialManager() {
    if (document.getElementById('calendarSection').style.display !== 'none') renderCalendar();
}

function scheduledListHtml(db) {
    const groups = new Map();
    weekDays.forEach(d => db[d].forEach(p => {
        if (!p.isSpecial) return;
        if (!groups.has(p.groupId)) groups.set(p.groupId, { text: p.text, days: [] });
        groups.get(p.groupId).days.push(d.substring(0, 3));
    }));
    const row = (text, meta, edit, del) => `
        <div class="sched-row">
            <div class="sched-text"><div class="prayer-text">${esc(text)}</div><div class="sched-meta">${esc(meta)}</div></div>
            <div class="prayer-actions">
                <button class="icon-btn" title="Change schedule" onclick="${edit}">✏️</button>
                <button class="icon-btn" title="Delete" onclick="${del}">🗑</button>
            </div>
        </div>`;
    const rows = [...groups].map(([gId, g]) => row(g.text, 'Special · ' + g.days.join(', '), `openEditGroupDays(${gId})`, `deletePrayerRequest('', 0, ${gId})`))
        .concat(db.monthly.map(m => row(m.text, describeRule(m), `openEditMonthly(${m.id})`, `deletePrayerRequest('monthly', ${m.id})`)));
    return `<div class="pgrid-label" style="margin-top:22px;">Special &amp; scheduled prayers</div>` +
        (rows.join('') || '<p style="font-size:0.85rem; opacity:0.6;">None yet. Add one with + Add Prayer.</p>');
}

function toggleTheme() {
    const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('prayerTheme', t);
    document.getElementById('themeBtn').innerText = t === 'dark' ? 'Light' : 'Dark';
}

document.documentElement.setAttribute('data-theme', localStorage.getItem('prayerTheme') || 'light');
initDaySelector();


// ---- Backups: one automatic local snapshot per day, plus import/restore ----
const SNAP_KEY = 'prayer_snapshots';

function readSnapshots() {
    try { return JSON.parse(localStorage.getItem(SNAP_KEY)) || []; } catch (e) { return []; }
}

// Called by saveDB before each write; stores the previously saved state once a day.
window.snapshotBackup = function () {
    try {
        const prev = localStorage.getItem('prayer_backup');
        if (!prev) return;
        const day = dateKey(new Date());
        const snaps = readSnapshots();
        if (snaps.some(s => s.day === day)) return;
        snaps.push({ day, data: prev });
        localStorage.setItem(SNAP_KEY, JSON.stringify(snaps.slice(-14)));
    } catch (e) { /* storage full or unavailable */ }
};

function validBackup(d) {
    return d && typeof d === 'object' && Array.isArray(d.everyday) && weekDays.every(w => Array.isArray(d[w]));
}

function restoreData(d) {
    window.snapshotBackup();
    const copy = JSON.parse(JSON.stringify(d));
    if (!Array.isArray(copy.monthly)) copy.monthly = [];
    replaceDB(copy);
    saveDB(copy);
    renderPrayers();
    renderSpecialManager();
}

function openBackupMenu() {
    showModal("Backup", [
        { text: "Copy to Clipboard", bg: 'var(--gold)', color: 'white', action: () => exportData() },
        { text: "Import from Pasted Backup", action: () => setTimeout(openImport, 250) },
        { text: "Restore a Previous Day", action: () => setTimeout(openRestoreList, 250) },
        { text: "Cancel", isCancel: true, action: () => {} }
    ]);
}

function openImport() {
    showModal("Paste your backup text. This replaces everything.", [
        { text: "Import", bg: 'var(--terracotta)', color: 'white', action: (val) => {
            try {
                const d = JSON.parse(val);
                if (!validBackup(d)) throw new Error('not a prayer backup');
                restoreData(d);
            } catch (e) { alert("That doesn't look like a valid backup."); }
        }},
        { text: "Cancel", isCancel: true, action: () => {} }
    ], true);
}

function openRestoreList() {
    const snaps = readSnapshots().slice(-6).reverse();
    if (!snaps.length) { alert("No daily snapshots yet. One is saved automatically each day you make a change."); return; }
    const buttons = snaps.map(s => ({ text: s.day, action: () => {
        try { restoreData(JSON.parse(s.data)); } catch (e) { alert("That snapshot couldn't be read."); }
    }}));
    buttons.push({ text: "Cancel", isCancel: true, action: () => {} });
    showModal("Restore the state from the start of:", buttons);
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}


// ---- ⋯ menu ----
function openPrayerMenu(dayKey, id, groupId) {
    const opts = [{ text: "Mark as Answered", bg: 'var(--gold)', color: 'white', action: () => markAnswered(dayKey, id, groupId) }];
    if (dayKey !== 'monthly') opts.push({ text: "Move to Another Group", action: () => setTimeout(() => movePrayer(dayKey, id, groupId), 250) });
    opts.push({ text: "Delete", bg: 'var(--terracotta)', color: 'white', action: () => setTimeout(() => deletePrayerRequest(dayKey, id, groupId), 250) });
    opts.push({ text: "Cancel", isCancel: true, action: () => {} });
    showModal("Prayer options", opts);
}

// ---- Answered prayers ----
function markAnswered(dayKey, id, groupId) {
    const db = getDB();
    const p = db[dayKey].find(x => x.id === id);
    if (!p) return;
    const snap = snapshotNow();
    db.answered.push({
        id: Date.now(),
        text: p.text,
        subs: JSON.parse(JSON.stringify(p.subs || [])),
        answeredAt: dateKey(new Date()),
        from: (dayKey !== 'everyday' && dayKey !== 'monthly' && !groupId) ? dayKey : 'everyday'
    });
    removeMoveSource(db, { dayKey, id, groupId });
    commitWithUndo(db, snap, 'Marked as answered. Thank God!');
    refreshAll();
}

function showAnswered() {
    document.getElementById('viewSection').style.display = 'none';
    hideExtraSections();
    document.getElementById('answeredSection').style.display = 'block';
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('answeredBtn').classList.add('active');
    renderAnswered();
}

function renderAnswered() {
    const db = getDB();
    const el = document.getElementById('answeredSection');
    const items = db.answered.slice().sort((x, y) => y.id - x.id);
    el.innerHTML = `<h3 style="font-family: 'Cormorant Garamond', serif; margin-bottom:12px;">Answered Prayers (${items.length})</h3>` +
        (items.map(p => `
            <div class="answered-item">
                <div class="prayer-text">${esc(p.text)}</div>
                <div style="font-size:0.75rem; opacity:0.6; margin:4px 0 8px;">Answered ${esc(shortDate(p.answeredAt))}</div>
                ${(p.subs || []).map(s => `<div class="sub-text" style="font-size:0.95rem;">• ${esc(s.text)}</div>`).join('')}
                <div class="prayer-actions" style="margin-top:8px;">
                    <button class="icon-btn" onclick="restoreAnswered(${p.id})">↩ Restore</button>
                    <button class="icon-btn" onclick="deleteAnswered(${p.id})">🗑</button>
                </div>
            </div>`).join('') || '<p style="text-align:center; padding:20px; opacity:0.5;">None yet.</p>');
}

function restoreAnswered(id) {
    const db = getDB();
    const p = db.answered.find(x => x.id === id);
    if (!p) return;
    const target = weekDays.includes(p.from) ? p.from : 'everyday';
    db[target].push({ id: Date.now(), text: p.text, subs: p.subs || [] });
    db.answered = db.answered.filter(x => x.id !== id);
    saveDB(db);
    renderAnswered();
}

function deleteAnswered(id) {
    const db = getDB();
    const snap = snapshotNow();
    showModal("Delete this answered prayer?", [
        { text: "Delete", bg: 'var(--terracotta)', color: 'white', action: () => {
            db.answered = db.answered.filter(x => x.id !== id);
            commitWithUndo(db, snap, 'Deleted');
            renderAnswered();
        }},
        { text: "Cancel", isCancel: true, action: () => {} }
    ]);
}

// ---- Search ----
function onSearch(q) {
    q = q.trim().toLowerCase();
    if (!q) { renderPrayers(); return; }
    const db = getDB();
    const seenGroups = new Set();
    const hits = [];
    const match = p => p.text.toLowerCase().includes(q) || (p.subs || []).some(s => s.text.toLowerCase().includes(q));
    db.everyday.filter(match).forEach(p => hits.push({ p, label: 'Everyday', day: null }));
    weekDays.forEach(d => db[d].filter(match).forEach(p => {
        if (p.groupId) {
            if (seenGroups.has(p.groupId)) return;
            seenGroups.add(p.groupId);
            const days = weekDays.filter(x => db[x].some(y => y.groupId === p.groupId)).map(x => x.substring(0, 3));
            hits.push({ p, label: 'Special · ' + days.join(' '), day: d });
        } else hits.push({ p, label: d, day: d });
    }));
    db.monthly.filter(match).forEach(p => hits.push({ p, label: 'Monthly · ' + describeRule(p), day: null }));
    db.answered.filter(match).forEach(p => hits.push({ p, label: 'Answered', day: null }));
    const list = document.getElementById('prayerList');
    document.getElementById('progressLine').innerText = `${hits.length} result${hits.length === 1 ? '' : 's'}`;
    list.innerHTML = hits.map((h, i) => `
        <div class="prayer-item" style="cursor:pointer;" onclick="openSearchHit(${i})">
            <div class="prayer-content"><div class="prayer-text">${esc(h.p.text)}</div>
            <div style="font-size:0.75rem; opacity:0.6;">${esc(h.label)}</div></div>
        </div>`).join('') || '<p style="text-align:center; padding:20px; opacity:0.5;">No matches.</p>';
    window.__hits = hits;
}

function openSearchHit(i) {
    const h = window.__hits[i];
    document.getElementById('searchBox').value = '';
    if (h.day) selectDay(h.day);
    else if (h.label === 'Answered') showAnswered();
    else showView();
}

// ---- Calendar ----
let calMonth = null;

function showCalendar() {
    if (!calMonth) { const n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
    document.getElementById('viewSection').style.display = 'none';
    hideExtraSections();
    document.getElementById('calendarSection').style.display = 'block';
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('calendarBtn').classList.add('active');
    calSelected = null;
    renderCalendar();
}

let calSelected = null;

function calNav(delta) {
    calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + delta, 1);
    calSelected = null;
    renderCalendar();
}

function calPick(key) { calSelected = key; renderCalendar(); }

// Every prayer with a scheduled point on date d (Special groups once): [{ p, subs }].
function pointsOn(db, d) {
    const seen = new Set(), out = [];
    ['everyday', ...weekDays, 'monthly'].forEach(k => (db[k] || []).forEach(p => {
        const subs = (p.subs || []).filter(s => pointApplies(s, d));
        const tag = p.groupId ? 'g' + p.groupId : k + p.id;
        if (!subs.length || seen.has(tag)) return;
        seen.add(tag);
        out.push({ p, subs });
    }));
    return out;
}

function renderCalendar() {
    const db = getDB();
    ensureSpreadAssignments(db, calMonth);
    const y = calMonth.getFullYear(), mo = calMonth.getMonth();
    const dim = new Date(y, mo + 1, 0).getDate();
    const todayKey = dateKey(new Date());
    let cells = ['M','T','W','T','F','S','S'].map(x => `<div class="cal-dow">${x}</div>`).join('');
    for (let i = 0; i < wdIndex(calMonth); i++) cells += '<div class="cal-cell empty"></div>';
    for (let day = 1; day <= dim; day++) {
        const d = new Date(y, mo, day), k = dateKey(d);
        const n = db.monthly.filter(m => monthlyApplies(m, d)).length + pointsOn(db, d).length;
        cells += `<div class="cal-cell ${k === todayKey ? 'today' : ''} ${k === calSelected ? 'sel' : ''}" onclick="calPick('${k}')">${day}<div class="cal-dots">${n ? '● ' + n : ''}</div></div>`;
    }
    let detail = '<p style="font-size:0.8rem; opacity:0.6; margin-top:12px;">Dots show scheduled prayers and prayer points. Tap a day for details.</p>';
    if (calSelected) {
        const d = parseDateKey(calSelected);
        const items = db.monthly.filter(m => monthlyApplies(m, d));
        const points = pointsOn(db, d);
        const movable = db.monthly.filter(m => m.rule.type === 'spread' && !monthlyApplies(m, d) && ((m.assigned || {})[monthKey(d)] || []).length);
        detail = `<div class="pgrid-label" style="margin-top:14px;">${esc(d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))} · ${dayLoad(db, d)} ${dayLoad(db, d) === 1 ? "prayer" : "prayers"} total</div>` +
            (items.map(m => `<div class="answered-item"><div class="prayer-text">${esc(m.text)}</div><div style="font-size:0.75rem; opacity:0.6;">${esc(describeRule(m))}</div></div>`).join('') || (points.length ? '' : '<p style="font-size:0.85rem; opacity:0.6;">Nothing scheduled on this day.</p>')) +
            points.map(({ p, subs }) => `<div class="answered-item"><div class="prayer-text">${esc(p.text)}</div>${subs.map(x => `<div class="sub-text" style="font-size:1rem;">• ${esc(x.text)} <span class="sub-tag on">${esc(describePoint(x.sched))}</span></div>`).join('')}</div>`).join('') +
            `<button class="nav-btn mode-btn" style="margin:8px 0;" onclick="addRangeFrom('${calSelected}')">+ Add a prayer for a date range starting here</button>` +
            (movable.length ? `<div class="pgrid-label">Move a spread prayer here</div>` + movable.map(m => `<div class="answered-item" style="cursor:pointer;" onclick="moveSpreadHere(${m.id}, '${calSelected}')"><div class="prayer-text">${esc(m.text)}</div></div>`).join('') : '');
    }
    document.getElementById('calendarSection').innerHTML = `
        <div class="cal-head"><button class="icon-btn" onclick="calNav(-1)">‹</button><span>${calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span><button class="icon-btn" onclick="calNav(1)">›</button></div>
        <div class="cal-grid">${cells}</div>${detail}${scheduledListHtml(db)}`;
}

function moveSpreadHere(id, toKey) {
    const db = getDB();
    const m = db.monthly.find(x => x.id === id);
    const mk = toKey.slice(0, 7);
    const dates = (m.assigned || {})[mk] || [];
    const apply = (fromKey) => {
        m.assigned[mk] = dates.filter(k => k !== fromKey).concat(toKey).sort();
        saveDB(db);
        renderCalendar();
    };
    if (dates.length === 1) return apply(dates[0]);
    showModal("Replace which date?", dates.map(k => ({ text: shortDate(k), action: () => apply(k) })).concat([{ text: "Cancel", isCancel: true, action: () => {} }]));
}
