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

    // Does monthly item m appear on date d?
    function monthlyApplies(m, d) {
        const r = m.rule;
        if (r.type === 'nth') return nthMatches(r, d, m.month);
        if (r.type === 'date') return dateMatches(r, d);
        return ((m.assigned || {})[monthKey(d)] || []).includes(dateKey(d));
    }

    function describeRule(m) {
        const r = m.rule;
        if (r.type === 'spread') return `${r.count}× ${r.recurring ? 'every month' : 'this month'}`;
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

    const api = { weekDays, occLabels, pad2, dateKey, monthKey, wdIndex, parseDateKey, nthMatches, dateMatches, monthlyApplies, describeRule, dayLoad, assignSpread };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
