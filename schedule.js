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

    // Number of prayers shown on date d (everyday + weekday + monthly).
    function dayLoad(db, d) {
        let n = db.everyday.length + (db[weekDays[wdIndex(d)]] || []).length;
        db.monthly.forEach(m => { if (monthlyApplies(m, d)) n++; });
        return n;
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

    const api = { leastLoadedNthWeekday, rangeMatches, describeRange, leastLoadedWeekdays, weekDays, occLabels, pad2, dateKey, monthKey, wdIndex, parseDateKey, nthMatches, dateMatches, monthlyApplies, describeRule, dayLoad, assignSpread };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
