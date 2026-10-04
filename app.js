let currentDay = '';
let selectedCategory = 'day';
let multiSelectedDays = [];

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
    document.getElementById('addModeBtn').innerText = `Add for ${day}`;
    showView();
}

function showView() {
    document.getElementById('viewSection').style.display = 'block';
    document.getElementById('addSection').style.display = 'none';
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('viewModeBtn').classList.add('active');
    renderPrayers();
}

let editingGroupId = null;
let pendingMove = null;
let editingMonthlyId = null;
let specialType = 'weekly';
let nthOcc = [];
let nthWds = [];

function setSpecialType(t, keepRecur = false) {
    specialType = t;
    document.getElementById('dayPicker').style.display = t === 'weekly' ? 'grid' : 'none';
    document.getElementById('nthPicker').style.display = t === 'nth' ? 'block' : 'none';
    document.getElementById('spreadPicker').style.display = t === 'spread' ? 'flex' : 'none';
    document.getElementById('datePicker').style.display = t === 'date' ? 'block' : 'none';
    document.getElementById('recurRow').style.display = t === 'weekly' ? 'none' : 'flex';
    document.getElementById('recurLabel').innerText = t === 'date' ? 'Repeat every year' : 'Repeat every month until deleted';
    if (!keepRecur) document.getElementById('spreadRecurring').checked = (t === 'nth');
    renderTypePicker();
    renderNthPicker();
}

function renderTypePicker() {
    const types = [['weekly','Weekly'],['nth','Monthly'],['spread','Spread'],['date','Date']];
    document.getElementById('typePicker').innerHTML = types.map(([k,l]) => `<div class="picker-day ${specialType === k ? 'selected' : ''}" onclick="setSpecialType('${k}')">${l}</div>`).join('');
}

function renderNthPicker() {
    document.getElementById('nthPicker').innerHTML =
        `<div class="pgrid-label">Which one(s)</div><div class="pgrid" style="grid-template-columns: repeat(5, 1fr);">` +
        occLabels.map(([n,l]) => `<div class="picker-day ${nthOcc.includes(n) ? 'selected' : ''}" onclick="toggleNth('occ', ${n})">${l}</div>`).join('') +
        `</div><div class="pgrid-label">Which weekday(s)</div><div class="pgrid">` +
        weekDays.map((d,i) => `<div class="picker-day ${nthWds.includes(i) ? 'selected' : ''}" onclick="toggleNth('wd', ${i})">${d.substring(0,3)}</div>`).join('') + `</div>`;
}

function toggleNth(kind, v) {
    const arr = kind === 'occ' ? nthOcc : nthWds;
    const idx = arr.indexOf(v);
    idx > -1 ? arr.splice(idx, 1) : arr.push(v);
    renderNthPicker();
}

function openAddMode(cat) {
    selectedCategory = cat;
    editingGroupId = null;
    editingMonthlyId = null;
    pendingMove = null;
    nthOcc = []; nthWds = [];
    document.getElementById('spreadCount').value = 4;
    document.getElementById('dateInput').value = '';
    document.getElementById('spreadRecurring').checked = false;
    document.getElementById('prayerInput').value = '';
    document.getElementById('viewSection').style.display = 'none';
    document.getElementById('addSection').style.display = 'block';
    document.getElementById('typePicker').style.display = (cat === 'special') ? 'grid' : 'none';
    document.getElementById('dayPicker').style.display = 'none';
    document.getElementById('nthPicker').style.display = 'none';
    document.getElementById('spreadPicker').style.display = 'none';
    document.getElementById('datePicker').style.display = 'none';
    document.getElementById('recurRow').style.display = 'none';
    document.getElementById('specialManagerArea').style.display = (cat === 'special') ? 'block' : 'none';
    if(cat === 'special') { multiSelectedDays = []; setSpecialType('weekly'); renderDayPicker(); renderSpecialManager(); }
    document.getElementById('addTitle').innerText = cat === 'everyday' ? "Everyday Prayer" : (cat === 'special' ? "Special Prayer" : `${currentDay} Prayer`);
}

function renderDayPicker() {
    document.getElementById('dayPicker').innerHTML = weekDays.map(d => `<div class="picker-day ${multiSelectedDays.includes(d) ? 'selected' : ''}" onclick="togglePickerDay('${d}')">${d.substring(0,3)}</div>`).join('');
}

function togglePickerDay(day) {
    const idx = multiSelectedDays.indexOf(day);
    idx > -1 ? multiSelectedDays.splice(idx, 1) : multiSelectedDays.push(day);
    renderDayPicker();
}

function openEditGroupDays(groupId) {
    const db = getDB();
    const insts = weekDays.map(d => db[d].find(p => p.groupId === groupId)).filter(Boolean);
    if (!insts.length) return;
    openAddMode('special');
    editingGroupId = groupId;
    document.getElementById('typePicker').style.display = 'none';
    multiSelectedDays = weekDays.filter(d => db[d].some(p => p.groupId === groupId));
    document.getElementById('prayerInput').value = insts[0].text;
    document.getElementById('addTitle').innerText = "Edit Special Prayer";
    renderDayPicker();
}

function saveGroupEdit(text) {
    const db = getDB();
    const template = weekDays.map(d => db[d].find(p => p.groupId === editingGroupId)).find(Boolean);
    weekDays.forEach(d => {
        const idx = db[d].findIndex(p => p.groupId === editingGroupId);
        if (!multiSelectedDays.includes(d)) {
            if (idx > -1) db[d].splice(idx, 1);
        } else if (idx > -1) {
            db[d][idx].text = text;
        } else {
            const subs = JSON.parse(JSON.stringify(template.subs || []));
            db[d].push({ id: Date.now()+Math.random(), groupId: editingGroupId, text, subs, isSpecial: true });
        }
    });
    saveDB(db);
}

function saveNewPrayer() {
    const text = document.getElementById('prayerInput').value.trim();
    if (!text) return;
    if (editingGroupId !== null) {
        if (multiSelectedDays.length === 0) return;
        saveGroupEdit(text);
        editingGroupId = null;
        showView();
        return;
    }
    const db = getDB();
    if (selectedCategory === 'special' && specialType !== 'weekly') {
        if (!saveMonthly(db, text)) return;
    } else if (selectedCategory === 'special') {
        if (multiSelectedDays.length === 0) return;
        const gId = Date.now();
        let subs = [];
        if (pendingMove) {
            subs = pendingMove.subs;
            removeMoveSource(db, pendingMove);
            pendingMove = null;
        }
        multiSelectedDays.forEach(day => db[day].push({ id: Date.now()+Math.random(), groupId: gId, text, subs: JSON.parse(JSON.stringify(subs)), isSpecial: true }));
    } else if (selectedCategory === 'everyday') {
        db.everyday.push({ id: Date.now(), text, subs: [] });
    } else {
        db[currentDay].push({ id: Date.now(), text, subs: [] });
    }
    saveDB(db);
    showView();
}

// ---- Monthly prayers ----
function saveMonthly(db, text) {
    let rule;
    if (specialType === 'nth') {
        if (!nthOcc.length || !nthWds.length) return false;
        rule = { type: 'nth', occ: nthOcc.slice(), wds: nthWds.slice(), recurring: document.getElementById('spreadRecurring').checked };
    } else if (specialType === 'date') {
        const date = document.getElementById('dateInput').value;
        if (!date) return false;
        rule = { type: 'date', date, yearly: document.getElementById('spreadRecurring').checked };
    } else {
        const count = parseInt(document.getElementById('spreadCount').value, 10);
        if (!(count >= 1)) return false;
        rule = { type: 'spread', count: Math.min(count, 31), recurring: document.getElementById('spreadRecurring').checked };
    }
    let subs = [];
    if (pendingMove) { subs = JSON.parse(JSON.stringify(pendingMove.subs)); removeMoveSource(db, pendingMove); pendingMove = null; }
    const now = new Date();
    let m = editingMonthlyId !== null ? db.monthly.find(x => x.id === editingMonthlyId) : null;
    if (m) { m.text = text; } else { m = { id: Date.now(), text, subs }; db.monthly.push(m); }
    m.rule = rule;
    m.assigned = {};
    m.month = monthKey(now);
    if (rule.type === 'spread') assignSpread(db, m, now.getFullYear(), now.getMonth(), now.getDate());
    editingMonthlyId = null;
    return true;
}

function openEditMonthly(id) {
    const db = getDB();
    const m = db.monthly.find(x => x.id === id);
    if (!m) return;
    openAddMode('special');
    editingMonthlyId = id;
    document.getElementById('typePicker').style.display = 'none';
    document.getElementById('prayerInput').value = m.text;
    document.getElementById('addTitle').innerText = "Edit Monthly Prayer";
    if (m.rule.type === 'nth') {
        nthOcc = m.rule.occ.slice(); nthWds = m.rule.wds.slice();
        setSpecialType('nth');
        document.getElementById('spreadRecurring').checked = m.rule.recurring !== false;
    } else if (m.rule.type === 'date') {
        document.getElementById('dateInput').value = m.rule.date;
        document.getElementById('spreadRecurring').checked = !!m.rule.yearly;
        setSpecialType('date', true);
    } else {
        document.getElementById('spreadCount').value = m.rule.count;
        document.getElementById('spreadRecurring').checked = !!m.rule.recurring;
        setSpecialType('spread', true);
    }
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
        if (m.rule.recurring !== false && (m.rule.type !== 'spread' || m.rule.recurring)) return true;
        return !m.month || m.month >= nowKey;
    });
    if (db.monthly.length !== before) changed = true;
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

function addSub(dayKey, id) {
    showModal("Add point:", [
        { text: "Save", bg: 'var(--gold)', color: 'white', action: (val) => {
            const db = getDB();
            const p = db[dayKey].find(x => x.id === id);
            if (!p) return;
            if (p.isSpecial && p.groupId) {
                setTimeout(() => {
                    showModal("Add to all days in group?", [
                        { text: "Just Today", action: () => {
                            if(!p.subs) p.subs = [];
                            p.subs.push({id: Date.now(), text: val});
                            saveDB(db);
                        }},
                        { text: "All Days", bg: 'var(--gold)', color: 'white', action: () => {
                            const gId = p.groupId;
                            weekDays.forEach(d => {
                                const inst = db[d].find(pr => pr.groupId === gId);
                                if(inst) { if(!inst.subs) inst.subs = []; inst.subs.push({id: Date.now()+Math.random(), text: val}); }
                            });
                            saveDB(db);
                        }},
                        { text: "Cancel", isCancel: true, action: () => {} }
                    ]);
                }, 300);
            } else {
                if(!p.subs) p.subs = [];
                p.subs.push({id: Date.now(), text: val});
                saveDB(db);
            }
        }},
        { text: "Cancel", isCancel: true, action: () => {} }
    ], true);
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
    if (!groupId) opts.push({ text: "Special Group", action: () => {
        openAddMode('special');
        pendingMove = src;
        multiSelectedDays = [currentDay];
        document.getElementById('prayerInput').value = text;
        renderDayPicker();
    }});
    else opts.push({ text: "Special Group (change days)", action: () => openEditGroupDays(groupId) });
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
    if (groupId) {
        showModal("Delete Special Prayer?", [
            { text: "Today Only", action: () => { db[dayKey] = db[dayKey].filter(p => p.id !== id); saveDB(db); }},
            { text: "All Days", bg: 'var(--terracotta)', color: 'white', action: () => {
                weekDays.forEach(d => db[d] = db[d].filter(p => p.groupId !== groupId));
                saveDB(db);
            }},
            { text: "Cancel", isCancel: true, action: () => {} }
        ]);
    } else {
        showModal("Delete this prayer?", [
            { text: "Delete", bg: 'var(--terracotta)', color: 'white', action: () => {
                db[dayKey] = db[dayKey].filter(p => p.id !== id);
                saveDB(db);
            }},
            { text: "Cancel", isCancel: true, action: () => {} }
        ]);
    }
}

function deleteSub(dk, pi, si) {
    const db = getDB();
    const p = db[dk].find(x => x.id === pi);
    if (!p) return;
    const subTxt = p.subs.find(s => s.id === si).text;
    if (p.isSpecial && p.groupId) {
        showModal("Delete point?", [
            { text: "Today Only", action: () => { p.subs = p.subs.filter(s => s.id !== si); saveDB(db); }},
            { text: "All Days", bg: 'var(--terracotta)', color: 'white', action: () => {
                const gId = p.groupId;
                weekDays.forEach(d => {
                    const inst = db[d].find(pr => pr.groupId === gId);
                    if(inst && inst.subs) inst.subs = inst.subs.filter(s => s.text !== subTxt);
                });
                saveDB(db);
            }},
            {text: "Cancel", isCancel: true, action: () => {}}
        ]);
    } else {
        p.subs = p.subs.filter(s => s.id !== si);
        saveDB(db);
    }
}

function renderPrayers() {
    const db = getDB();
    const listContainer = document.getElementById('prayerList');
    listContainer.innerHTML = '';

    const vDate = viewedDate();
    ensureSpreadAssignments(db, vDate);
    const monthlyToday = db.monthly.filter(m => monthlyApplies(m, vDate));

    const categories = [
        { key: 'everyday', label: 'Everyday', filter: (p) => true },
        { key: currentDay, label: 'Special Group', filter: (p) => p.isSpecial },
        { key: 'monthly', label: `Monthly · ${vDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, filter: (p) => monthlyToday.includes(p) },
        { key: currentDay, label: currentDay, filter: (p) => !p.isSpecial }
    ];

    categories.forEach(cat => {
        const items = (db[cat.key] || []).filter(cat.filter);
        if (items.length === 0) return;

        const groupDiv = document.createElement('div');
        groupDiv.className = 'drag-container';
        groupDiv.dataset.key = cat.key;
        groupDiv.innerHTML = `<div class="prayer-group-title">${cat.label}</div>`;

        items.forEach((p) => {
            const pDiv = document.createElement('div');
            pDiv.className = `prayer-item ${p.isSpecial ? 'is-special-item' : ''}`;
            pDiv.draggable = cat.key !== 'monthly';
            pDiv.dataset.raw = JSON.stringify(p);

            let subsHtml = (p.subs || []).map(s => `
                <div class="sub-item">
                    <span class="sub-text">• ${s.text}</span>
                    <button class="icon-btn sub-delete" onclick="event.stopPropagation(); deleteSub('${cat.key}', ${p.id}, ${s.id})">🗑</button>
                </div>`).join('');

            pDiv.innerHTML = `
                <div class="drag-handle" ${cat.key === 'monthly' ? 'style="visibility:hidden"' : ''}>≡</div>
                <div class="prayer-content">
                    <div class="prayer-header">
                        <div class="prayer-text">${p.text}</div>
                        <div class="prayer-actions">
                            <button class="icon-btn" onclick="event.stopPropagation(); addSub('${cat.key}', ${p.id})">➕</button>
                            <button class="icon-btn" onclick="event.stopPropagation(); editPrayerRequest('${cat.key}', ${p.id}, ${p.groupId})">✏️</button>
                            <button class="icon-btn" onclick="event.stopPropagation(); deletePrayerRequest('${cat.key}', ${p.id}, ${p.groupId})">🗑</button>
                        </div>
                    </div>
                    ${subsHtml ? `<div class="sub-list">${subsHtml}</div>` : ''}
                </div>
            `;
            if (cat.key !== 'monthly') initDragAndTouchEvents(pDiv, cat.key);
            groupDiv.appendChild(pDiv);
        });
        listContainer.appendChild(groupDiv);
    });

    if (listContainer.innerHTML === '') {
        listContainer.innerHTML = '<p style="text-align:center; padding:20px; opacity:0.5;">Empty.</p>';
    }
}

function renderSpecialManager() {
    const db = getDB();
    const groups = {};
    weekDays.forEach(d => { db[d].forEach(p => { if(p.isSpecial) groups[p.groupId] = p.text; }); });
    const html = Object.keys(groups).map(gId => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--cream); margin-bottom:8px; border-radius:10px; border: 1px solid var(--sand);">
            <span style="font-family: 'Cormorant Garamond', serif; font-size:1rem;">${groups[gId]}</span>
            <button class="icon-btn" style="color:var(--terracotta);" onclick="deletePrayerRequest('', 0, ${gId})">🗑</button>
        </div>`).join('');
    const monthlyHtml = db.monthly.map(m => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--cream); margin-bottom:8px; border-radius:10px; border: 1px solid var(--sand);">
            <span style="font-family: 'Cormorant Garamond', serif; font-size:1rem;">${m.text}<br><span style="font-size:0.75rem; opacity:0.6;">${describeRule(m)}</span></span>
            <button class="icon-btn" style="color:var(--terracotta);" onclick="deletePrayerRequest('monthly', ${m.id})">🗑</button>
        </div>`).join('');
    document.getElementById('specialItemsList').innerHTML = (html + monthlyHtml) || '<p style="font-size:0.8rem; opacity:0.5; text-align:center;">No groups.</p>';
}

function toggleTheme() {
    const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('prayerTheme', t);
    document.getElementById('themeBtn').innerText = t === 'dark' ? 'Light' : 'Dark';
}

document.documentElement.setAttribute('data-theme', localStorage.getItem('prayerTheme') || 'light');
initDaySelector();
