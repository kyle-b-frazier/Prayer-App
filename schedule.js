// Pure scheduling helpers (no DOM). Loaded as a classic script in the browser
// and required from Node for tests.
(function (root) {
    const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const occLabels = [[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [-1, 'Last']];

    function pad2(n) { return String(n).padStart(2, '0'); }
    function dateKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
    function monthKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
    function wdIndex(d) { return (d.getDay() + 6) % 7; }
    function parseDateKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }

    function nthMatches(rule, d, month) {
        if (rule.recurring === false && month !== monthKey(d)) return false;
        if (!rule.wds.includes(wdIndex(d))) return false;
        const n = Math.ceil(d.getDate() / 7);
        const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        return rule.occ.includes(n) || (rule.occ.includes(-1) && d.getDate() + 7 > dim);
    }

    function dateMatches(rule, d) {
        if (dateKey(d) === rule.date) return true;
        return !!rule.yearly && rule.date.slice(5) === dateKey(d).slice(5);
    }

    // Period prayer: every day from r.start through r.end (inclusive).
    function rangeMatches(r, d) {
        const k = dateKey(d);
        return k >= r.start && k <= (r.end || r.start);
    }

    // Does monthly item m appear on date d?
    function monthlyApplies(m, d) {
        const r = m.rule;
        if (r.type === 'nth') return nthMatches(r, d, m.month);
        if (r.type === 'date') return dateMatches(r, d);
        if (r.type === 'range') return rangeMatches(r, d);
        return ((m.assigned || {})[monthKey(d)] || []).includes(dateKey(d));
    }

    // "Nov 3 – Nov 10 (8 days)"; adds the year when it isn't the current one.
    function describeRange(start, end) {
        end = end || start;
        const thisYear = new Date().getFullYear();
        const fmt = k => {
            const d = parseDateKey(k);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === thisYear ? undefined : 'numeric' });
        };
        const days = Math.round((parseDateKey(end) - parseDateKey(start)) / 86400000) + 1;
        return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)} (${days} days)`;
    }

    function describeRule(m) {
        const r = m.rule;
        if (r.type === 'spread') return `${r.count}× ${r.recurring ? 'every month' : 'this month'}`;
        if (r.type === 'range') return describeRange(r.start, r.end);
        if (r.type === 'date') {
            const label = parseDateKey(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: r.yearly ? undefined : 'numeric' });
            return `${label}${r.yearly ? ' (yearly)' : ''}`;
        }
        const o = occLabels.filter(([n]) => r.occ.includes(n)).map(([, l]) => l).join(' & ');
        const w = r.wds.slice().sort().map(i => weekDays[i].substring(0, 3)).join('/');
        return `${o} ${w}${r.recurring === false ? ' (this month)' : ''}`;
    }

    // ---- Scheduled prayer points ----
    // A point (sub) may carry sched: {type: 'daily'|'days'|'nth'|'range'|'date', ...}.
    // On its days it brings its prayer onto the list, even if the prayer isn't normally there.
    function pointApplies(s, d) {
        const r = s && s.sched;
        if (!r) return false;
        if (r.type === 'daily') return true;
        if (r.type === 'days') return r.wds.includes(wdIndex(d));
        if (r.type === 'nth') return nthMatches(r, d, r.month);
        if (r.type === 'range') return rangeMatches(r, d);
        if (r.type === 'date') return dateMatches(r, d);
        return false;
    }

    // True once a scheduled point can never come up again (todayKey = 'YYYY-MM-DD').
    function pointExpired(s, todayKey) {
        const r = s && s.sched;
        if (!r) return false;
        if (r.type === 'range') return (r.end || r.start) < todayKey;
        if (r.type === 'date') return !r.yearly && r.date < todayKey;
        if (r.type === 'nth') return r.recurring === false && !!r.month && r.month < todayKey.slice(0, 7);
        return false;
    }

    function describePoint(r) {
        if (r.type === 'daily') return 'Every day';
        if (r.type === 'days') return 'Every ' + r.wds.slice().sort().map(i => weekDays[i].substring(0, 3)).join(', ');
        return describeRule({ rule: r });
    }

    // Prayers not normally on date d that have a point scheduled for d: [{ p, key, subs }].
    // Special groups appear once even though each day holds its own copy.
    function surfacedPoints(db, d) {
        const today = weekDays[wdIndex(d)];
        const tag = p => p.groupId ? 'g' + p.groupId : 'p' + p.id;
        const shown = new Set((db[today] || []).map(tag));
        db.monthly.forEach(m => { if (monthlyApplies(m, d)) shown.add('m' + m.id); });
        const out = [];
        const consider = (p, key, t) => {
            if (shown.has(t)) return;
            const subs = (p.subs || []).filter(s => pointApplies(s, d));
            if (!subs.length) return;
            shown.add(t);
            out.push({ p, key, subs });
        };
        weekDays.forEach(w => { if (w !== today) (db[w] || []).forEach(p => consider(p, w, tag(p))); });
        db.monthly.forEach(m => consider(m, 'monthly', 'm' + m.id));
        return out;
    }

    // Number of prayers shown on date d (everyday + weekday + monthly + ones brought up by points).
    function dayLoad(db, d) {
        let n = db.everyday.length + (db[weekDays[wdIndex(d)]] || []).length;
        db.monthly.forEach(m => { if (monthlyApplies(m, d)) n++; });
        return n + surfacedPoints(db, d).length;
    }

    // Choose the m.rule.count least-loaded dates (earliest on ties) from fromDay.
    function assignSpread(db, m, year, month, fromDay) {
        const dim = new Date(year, month + 1, 0).getDate();
        const dates = [];
        for (let day = fromDay; day <= dim; day++) dates.push(new Date(year, month, day));
        const load = new Map(dates.map(d => [dateKey(d), dayLoad(db, d)]));
        const picks = [];
        for (let i = 0; i < Math.min(m.rule.count, dates.length); i++) {
            let best = null;
            dates.forEach(d => {
                const k = dateKey(d);
                if (picks.includes(k)) return;
                if (best === null || load.get(k) < load.get(best)) best = k;
            });
            picks.push(best);
            load.set(best, load.get(best) + 1);
        }
        m.assigned = m.assigned || {};
        m.assigned[monthKey(new Date(year, month, 1))] = picks.sort();
    }

    // Weekday names (Monday-first on ties) with the fewest prayers, least first.
    // Counts everyday + that weekday's own list; optionally ignores one weekly group (when editing it).
    function leastLoadedWeekdays(db, count, excludeGroupId) {
        const load = weekDays.map((d, i) => ({
            d, i,
            n: db.everyday.length + (db[d] || []).filter(p => !excludeGroupId || p.groupId !== excludeGroupId).length
        }));
        return load.sort((x, y) => x.n - y.n || x.i - y.i).slice(0, Math.max(1, Math.min(count, 7))).map(x => x.d);
    }

    // For a monthly "nth weekday" prayer: the weekday index (0 = Monday) whose matching dates
    // carry the fewest prayers over `months` months starting at year/month (0-based month).
    // With no weeks chosen, every occurrence of each weekday counts. Monday first on ties.
    function leastLoadedNthWeekday(db, occ, year, month, months) {
        const occs = occ && occ.length ? occ : [1, 2, 3, 4, -1];
        const totals = [0, 0, 0, 0, 0, 0, 0], counts = [0, 0, 0, 0, 0, 0, 0];
        for (let mi = 0; mi < Math.max(1, months || 1); mi++) {
            const dim = new Date(year, month + mi + 1, 0).getDate();
            for (let day = 1; day <= dim; day++) {
                const d = new Date(year, month + mi, day);
                const wd = wdIndex(d);
                if (nthMatches({ occ: occs, wds: [wd] }, d)) { totals[wd] += dayLoad(db, d); counts[wd]++; }
            }
        }
        // Average per matching date, so weekdays that occur 5 times in a month aren't penalised.
        const avg = totals.map((n, i) => counts[i] ? n / counts[i] : Infinity);
        let best = 0;
        avg.forEach((n, i) => { if (n < avg[best]) best = i; });
        return best;
    }

    const api = { pointApplies, pointExpired, describePoint, surfacedPoints, leastLoadedNthWeekday, rangeMatches, describeRange, leastLoadedWeekdays, weekDays, occLabels, pad2, dateKey, monthKey, wdIndex, parseDateKey, nthMatches, dateMatches, monthlyApplies, describeRule, dayLoad, assignSpread };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
