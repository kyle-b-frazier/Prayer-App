// ---- Add / edit prayer sheet ----
// One form for every kind of prayer: write the prayer, then choose how often it comes up.
// Phone: a bottom sheet where the chosen option opens in place.
// Desktop: a dialog with the choices on the left and the chosen option's settings on the right.

const ADD_KINDS = [
    ['daily', 'Every day', 'Family, your church, things you never want to skip'],
    ['days', 'Certain days a week', 'One day or several, e.g. every Sunday'],
    ['monthly', 'Monthly', 'e.g. the 1st Tuesday, or 3 times a month'],
    ['range', 'For a while', 'A trip, an illness, a hard season'],
    ['date', 'On one date', 'A surgery, an interview, a birthday']
];
const ADD_ICONS = {
    daily: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    days: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h2M11 14h2M15 14h2"/>',
    monthly: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/><circle cx="12" cy="12" r="1.5"/>',
    range: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>',
    date: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'
};
const OCC_HINTS = { 1: 'days 1–7', 2: 'days 8–14', 3: 'days 15–21', 4: 'days 22–28', '-1': 'last 7 days' };
const wideAdd = window.matchMedia('(min-width: 760px)');

let F = null;   // form state while the sheet is open

function addDefaults() {
    const now = new Date();
    return {
        kind: 'days', allowed: ADD_KINDS.map(k => k[0]),
        mode: 'new', editId: null, move: null, title: 'New Prayer', saveLabel: 'Add Prayer',
        days: [weekDays.indexOf(currentDay)], autoCount: 1, daysNote: '',
        mMode: 'set', occ: [], mDays: [], mNote: '', mRepeat: true, spreadN: 3,
        start: null, end: null, calMonth: new Date(now.getFullYear(), now.getMonth(), 1),
        date: '', yearly: false
    };
}

function openAdd(opts = {}, text = '') {
    F = Object.assign(addDefaults(), opts);
    if (F.start) { const s = parseDateKey(F.start); F.calMonth = new Date(s.getFullYear(), s.getMonth(), 1); }
    document.getElementById('addTitle').innerText = F.title;
    document.getElementById('addSaveBtn').innerText = F.saveLabel;
    document.getElementById('prayerInput').value = text;
    document.getElementById('addOverlay').hidden = false;
    document.body.classList.add('sheet-open');
    document.getElementById('addScroll').scrollTop = 0;
    renderAdd();
    if (wideAdd.matches) document.getElementById('prayerInput').focus();
}

function closeAdd() {
    F = null;
    document.getElementById('addOverlay').hidden = true;
    document.body.classList.remove('sheet-open');
}

function setAddKind(k) { F.kind = k; renderAdd(); }

function renderAdd() {
    if (!F) return;
    const wide = wideAdd.matches;
    document.getElementById('addOpts').innerHTML = ADD_KINDS.filter(([k]) => F.allowed.includes(k)).map(([k, title, sub]) => `
        <div class="ap-opt ${F.kind === k ? 'on' : ''}">
            <button type="button" class="ap-opt-row" aria-pressed="${F.kind === k}" onclick="setAddKind('${k}')">
                <svg class="ap-ic" viewBox="0 0 24 24" aria-hidden="true">${ADD_ICONS[k]}</svg>
                <span><span class="ap-opt-title">${title}</span><span class="ap-opt-sub">${sub}</span></span>
                <span class="ap-radio"></span>
            </button>
            ${!wide && F.kind === k ? `<div class="ap-opt-body">${addBody(k)}</div>` : ''}
        </div>`).join('');
    const kind = ADD_KINDS.find(([k]) => k === F.kind);
    document.getElementById('addSide').innerHTML = wide ? `<div class="ap-side-title">${kind[1]}</div><div class="ap-side-body">${addBody(F.kind)}</div>` : '';
    renderAddSummary();
}

function apChip(on, label, sub, onclick) {
    return `<button type="button" class="ap-chip ${on ? 'on' : ''}" aria-pressed="${on}" onclick="${onclick}">${label}${sub !== undefined ? `<small>${sub}</small>` : ''}</button>`;
}

function apStepper(value, field, min, max, label) {
    return `<div class="ap-stepper" role="group" aria-label="${label}">
        <button type="button" onclick="F.${field}=Math.max(${min},F.${field}-1);renderAdd()" aria-label="Fewer">−</button>
        <output>${value}</output>
        <button type="button" onclick="F.${field}=Math.min(${max},F.${field}+1);renderAdd()" aria-label="More">+</button>
    </div>`;
}

// Prayers already on each weekday (everyday + that day's list), ignoring the group being edited.
function addDayCounts() {
    const db = getDB();
    return weekDays.map(d => db.everyday.length + db[d].filter(p => !(F.mode === 'editGroup' && p.groupId === F.editId)).length);
}

function addBody(kind) {
    if (kind === 'daily') return `<p class="ap-hint">Shows at the top of every day's list.</p>`;
    if (kind === 'days') {
        const counts = addDayCounts();
        return `
            <div class="ap-chips c7">${weekDays.map((d, i) => apChip(F.days.includes(i), d.substring(0, 3), counts[i], `apToggle('days', ${i})`)).join('')}</div>
            <p class="ap-hint">Small numbers show how many prayers each day already has. Pick one day or several.</p>
            <div class="ap-auto">
                <button type="button" class="ap-ghost" onclick="apAutoDays()">Choose for me</button>
                ${apStepper(F.autoCount, 'autoCount', 1, 7, 'How many days')}
                <span class="ap-hint">${F.autoCount === 1 ? 'day' : 'days'} a week</span>
            </div>
            ${F.daysNote ? `<p class="ap-note">${esc(F.daysNote)}</p>` : ''}`;
    }
    if (kind === 'monthly') return `
        <div class="ap-seg">
            <button type="button" class="${F.mMode === 'set' ? 'on' : ''}" onclick="F.mMode='set';renderAdd()">On a set day</button>
            <button type="button" class="${F.mMode === 'spread' ? 'on' : ''}" onclick="F.mMode='spread';renderAdd()">A few times, anywhere</button>
        </div>
        ${F.mMode === 'set' ? `
            <div><span class="ap-q">Which week?</span>
            <div class="ap-chips c5">${occLabels.map(([n, l]) => apChip(F.occ.includes(n), l, OCC_HINTS[n], `apToggle('occ', ${n})`)).join('')}</div></div>
            <div><span class="ap-q">Which day?</span>
            <div class="ap-chips c7">${weekDays.map((d, i) => apChip(F.mDays.includes(i), d.substring(0, 3), undefined, `apToggle('mDays', ${i})`)).join('')}</div></div>
            <div class="ap-auto"><button type="button" class="ap-ghost" onclick="apAutoMonthly()">Choose the least busy day</button></div>
            ${F.mNote ? `<p class="ap-note">${esc(F.mNote)}</p>` : ''}` : `
            <div class="ap-auto">
                ${apStepper(F.spreadN, 'spreadN', 1, 31, 'Times a month')}
                <span class="ap-hint" style="flex:1; min-width:12em;">times a month, on the days with the fewest prayers. You can move them later in Calendar.</span>
            </div>`}
        <label class="ap-toggle"><input type="checkbox" id="apRepeat" ${F.mRepeat ? 'checked' : ''} onchange="F.mRepeat=this.checked;renderAdd()"> Repeat every month</label>`;
    if (kind === 'range') {
        const y = F.calMonth.getFullYear(), mo = F.calMonth.getMonth(), dim = new Date(y, mo + 1, 0).getDate();
        const todayKey = dateKey(new Date()), end = F.end || F.start;
        let cells = ['M','T','W','T','F','S','S'].map(x => `<div class="ap-dow">${x}</div>`).join('');
        for (let i = 0; i < wdIndex(F.calMonth); i++) cells += '<div class="ap-day blank"></div>';
        for (let day = 1; day <= dim; day++) {
            const k = dateKey(new Date(y, mo, day));
            const cls = (k === F.start || k === F.end) ? 'end' : (F.start && k > F.start && k < end ? 'mid' : '');
            cells += `<button type="button" class="ap-day ${cls} ${k === todayKey ? 'today' : ''} ${k < todayKey ? 'past' : ''}" onclick="apPick('${k}')">${day}</button>`;
        }
        return `
            <div class="ap-chips c3">${[[7, 'Next 7 days'], [14, 'Next 2 weeks'], [30, 'Next 30 days']].map(([n, l]) => apChip(false, l, undefined, `apPreset(${n})`)).join('')}</div>
            <div class="ap-cal-head">
                <button type="button" onclick="apCalNav(-1)" aria-label="Previous month">‹</button>
                <span>${F.calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
                <button type="button" onclick="apCalNav(1)" aria-label="Next month">›</button>
            </div>
            <div class="ap-cal">${cells}</div>
            <p class="ap-hint">${!F.start ? 'Tap the first day, then the last day.' : !F.end ? 'Now tap the last day.' : 'Tap a new day to start over.'} It disappears on its own when the time is up.</p>`;
    }
    return `
        <input type="date" id="apDate" class="ap-date" value="${F.date}" onchange="F.date=this.value;renderAdd()">
        <label class="ap-toggle"><input type="checkbox" id="apYearly" ${F.yearly ? 'checked' : ''} onchange="F.yearly=this.checked;renderAdd()"> Repeat every year (birthdays, anniversaries)</label>`;
}

function apToggle(field, v) {
    const arr = F[field], i = arr.indexOf(v);
    i > -1 ? arr.splice(i, 1) : arr.push(v);
    if (field === 'days') F.daysNote = '';
    if (field === 'mDays') F.mNote = '';
    renderAdd();
}

function apAutoDays() {
    const names = leastLoadedWeekdays(getDB(), F.autoCount, F.mode === 'editGroup' ? F.editId : null);
    F.days = names.map(d => weekDays.indexOf(d));
    F.daysNote = `Picked ${listJoin(F.days.slice().sort().map(i => weekDays[i]))}, the lightest ${F.autoCount === 1 ? 'day' : 'days'}. Tap to adjust.`;
    renderAdd();
}

function apAutoMonthly() {
    const db = getDB();
    const others = { ...db, monthly: db.monthly.filter(m => !(F.mode === 'editMonthly' && m.id === F.editId)) };
    const now = new Date();
    const wd = leastLoadedNthWeekday(others, F.occ, now.getFullYear(), now.getMonth(), F.mRepeat ? 3 : 1);
    F.mDays = [wd];
    F.mNote = `${weekDays[wd]} has the fewest prayers${F.occ.length ? ' in those weeks' : ''}. Tap another day to change it.`;
    renderAdd();
}

function apPick(k) {
    if (!F.start || F.end || k < F.start) { F.start = k; F.end = null; } else F.end = k;
    renderAdd();
}

function apPreset(n) {
    const t = new Date();
    F.start = dateKey(t);
    F.end = dateKey(new Date(t.getFullYear(), t.getMonth(), t.getDate() + n - 1));
    F.calMonth = new Date(t.getFullYear(), t.getMonth(), 1);
    renderAdd();
}

function apCalNav(d) { F.calMonth = new Date(F.calMonth.getFullYear(), F.calMonth.getMonth() + d, 1); renderAdd(); }

function listJoin(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

// What the current choice means, in words; ok is false until the choice is complete.
function addSchedule() {
    const long = k => parseDateKey(k).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    if (F.kind === 'daily') return { ok: true, text: 'every day.' };
    if (F.kind === 'days') {
        if (!F.days.length) return { ok: false, text: 'Pick at least one day.' };
        return { ok: true, text: `every ${listJoin(F.days.slice().sort().map(i => weekDays[i]))}.` };
    }
    if (F.kind === 'monthly') {
        if (F.mMode === 'spread') return { ok: true, text: `${F.spreadN} ${F.spreadN === 1 ? 'time' : 'times'} ${F.mRepeat ? 'every month' : 'this month'}, on your lightest days.` };
        if (!F.occ.length) return { ok: false, text: 'Pick which week of the month.' };
        if (!F.mDays.length) return { ok: false, text: 'Pick a day, or let the app choose the least busy one.' };
        const occ = occLabels.filter(([n]) => F.occ.includes(n)).map(([, l]) => l === 'Last' ? 'last' : l);
        const rule = { occ: F.occ, wds: F.mDays, recurring: F.mRepeat };
        const now = new Date(), next = [];
        for (let i = 0; i < 120 && next.length < 3; i++) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
            if (nthMatches(rule, d, monthKey(now))) next.push(d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }));
        }
        return { ok: true, text: `on the ${listJoin(occ)} ${listJoin(F.mDays.slice().sort().map(i => weekDays[i]))} of ${F.mRepeat ? 'every month' : 'this month only'}.`,
                 next: next.length ? 'Next: ' + next.join(' · ') : 'No dates left this month.' };
    }
    if (F.kind === 'range') {
        if (!F.start) return { ok: false, text: 'Pick the first and last day.' };
        const end = F.end || F.start;
        return { ok: true, text: end === F.start ? `on ${long(F.start)} only.` : `every day, ${describeRange(F.start, end)}.` };
    }
    if (!F.date) return { ok: false, text: 'Pick a date.' };
    return { ok: true, text: `on ${parseDateKey(F.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: F.yearly ? undefined : 'numeric' })}${F.yearly ? ', every year' : ''}.` };
}

function renderAddSummary() {
    if (!F) return;
    const text = document.getElementById('prayerInput').value.trim();
    const sc = addSchedule();
    const ready = !!(sc.ok && text);
    const name = text.length > 40 ? text.slice(0, 38) + '…' : text;
    const el = document.getElementById('addSummary');
    el.className = 'ap-summary' + (ready ? ' ready' : '');
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span>${
        !text ? 'Write who or what you are praying for.' :
        sc.ok ? `<b>${esc(name)}</b> will come up ${esc(sc.text)}${sc.next ? `<span class="ap-next">${esc(sc.next)}</span>` : ''}` : esc(sc.text)}</span>`;
    document.getElementById('addSaveBtn').disabled = !ready;
}

function saveGroupEdit(db, groupId, dayNames, text) {
    const template = weekDays.map(d => db[d].find(p => p.groupId === groupId)).find(Boolean);
    weekDays.forEach(d => {
        const idx = db[d].findIndex(p => p.groupId === groupId);
        if (!dayNames.includes(d)) { if (idx > -1) db[d].splice(idx, 1); }
        else if (idx > -1) db[d][idx].text = text;
        else db[d].push({ id: Date.now() + Math.random(), groupId, text, subs: JSON.parse(JSON.stringify(template.subs || [])), isSpecial: true });
    });
}

function saveMonthly(db, text, subs) {
    let rule;
    if (F.kind === 'monthly' && F.mMode === 'set') rule = { type: 'nth', occ: F.occ.slice(), wds: F.mDays.slice(), recurring: F.mRepeat };
    else if (F.kind === 'monthly') rule = { type: 'spread', count: F.spreadN, recurring: F.mRepeat };
    else if (F.kind === 'range') rule = { type: 'range', start: F.start, end: F.end || F.start };
    else rule = { type: 'date', date: F.date, yearly: F.yearly };
    const now = new Date();
    let m = F.mode === 'editMonthly' ? db.monthly.find(x => x.id === F.editId) : null;
    if (m) m.text = text; else { m = { id: Date.now(), text, subs }; db.monthly.push(m); }
    m.rule = rule;
    m.assigned = {};
    m.month = monthKey(now);
    if (rule.type === 'spread') assignSpread(db, m, now.getFullYear(), now.getMonth(), now.getDate());
}

function saveNewPrayer() {
    const text = document.getElementById('prayerInput').value.trim();
    if (!F || !text || !addSchedule().ok) return;
    const db = getDB();
    let subs = [];
    if (F.move) { subs = JSON.parse(JSON.stringify(F.move.subs || [])); removeMoveSource(db, F.move); }
    const dayNames = F.days.slice().sort().map(i => weekDays[i]);
    if (F.mode === 'editGroup') saveGroupEdit(db, F.editId, dayNames, text);
    else if (F.kind === 'daily') db.everyday.push({ id: Date.now(), text, subs });
    else if (F.kind === 'days' && dayNames.length === 1) db[dayNames[0]].push({ id: Date.now(), text, subs });
    else if (F.kind === 'days') {
        const gId = Date.now();
        dayNames.forEach(d => db[d].push({ id: Date.now() + Math.random(), groupId: gId, text, subs: JSON.parse(JSON.stringify(subs)), isSpecial: true }));
    } else saveMonthly(db, text, subs);
    const msg = F.mode === 'new' ? 'Prayer added' : F.move ? 'Prayer moved' : 'Changes saved';
    saveDB(db);
    closeAdd();
    refreshAll();
    showToast(msg);
}

// Edit the days of a Special prayer group.
function openEditGroupDays(groupId) {
    const db = getDB();
    const days = weekDays.map((d, i) => db[d].some(p => p.groupId === groupId) ? i : -1).filter(i => i > -1);
    if (!days.length) return;
    const text = db[weekDays[days[0]]].find(p => p.groupId === groupId).text;
    openAdd({ kind: 'days', allowed: ['days'], mode: 'editGroup', editId: groupId, days, title: 'Change Days', saveLabel: 'Save Changes' }, text);
}

// Change the schedule of a monthly, dated or date-range prayer.
function openEditMonthly(id) {
    const m = getDB().monthly.find(x => x.id === id);
    if (!m) return;
    const r = m.rule;
    const o = { allowed: ['monthly', 'range', 'date'], mode: 'editMonthly', editId: id, title: 'Change Schedule', saveLabel: 'Save Changes' };
    if (r.type === 'nth') Object.assign(o, { kind: 'monthly', mMode: 'set', occ: r.occ.slice(), mDays: r.wds.slice(), mRepeat: r.recurring !== false });
    else if (r.type === 'spread') Object.assign(o, { kind: 'monthly', mMode: 'spread', spreadN: r.count, mRepeat: !!r.recurring });
    else if (r.type === 'range') Object.assign(o, { kind: 'range', start: r.start, end: r.end || r.start });
    else Object.assign(o, { kind: 'date', date: r.date, yearly: !!r.yearly });
    openAdd(o, m.text);
}

// From the Calendar view: start a date-range prayer on the tapped day.
function addRangeFrom(k) { openAdd({ kind: 'range', start: k }); }

document.getElementById('prayerInput').addEventListener('input', renderAddSummary);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && F && document.getElementById('modalOverlay').style.display !== 'flex') closeAdd(); });
wideAdd.addEventListener('change', renderAdd);
