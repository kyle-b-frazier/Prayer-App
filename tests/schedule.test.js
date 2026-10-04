const test = require('node:test');
const assert = require('node:assert');
const S = require('../schedule.js');

const emptyDB = () => ({ Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [], everyday: [], monthly: [] });
const d = (y, m, day) => new Date(y, m - 1, day);

test('nth weekday: 2nd Tuesday', () => {
    const r = { type: 'nth', occ: [2], wds: [1] };
    assert.ok(S.nthMatches(r, d(2026, 10, 13)));
    assert.ok(!S.nthMatches(r, d(2026, 10, 6)));
    assert.ok(!S.nthMatches(r, d(2026, 10, 20)));
});

test('nth weekday: last Friday handles 4- and 5-occurrence months', () => {
    const r = { type: 'nth', occ: [-1], wds: [4] };
    assert.ok(S.nthMatches(r, d(2026, 10, 30)));   // Oct 2026 has 5 Fridays
    assert.ok(!S.nthMatches(r, d(2026, 10, 23)));
    assert.ok(S.nthMatches(r, d(2026, 11, 27)));   // Nov 2026 has 4 Fridays
});

test('non-recurring nth only matches in its own month', () => {
    const r = { type: 'nth', occ: [1], wds: [0], recurring: false };
    assert.ok(S.nthMatches(r, d(2026, 10, 5), '2026-10'));
    assert.ok(!S.nthMatches(r, d(2026, 11, 2), '2026-10'));
});

test('date rule: one-off and yearly', () => {
    assert.ok(S.dateMatches({ date: '2026-10-20' }, d(2026, 10, 20)));
    assert.ok(!S.dateMatches({ date: '2026-10-20' }, d(2027, 10, 20)));
    assert.ok(S.dateMatches({ date: '2026-10-20', yearly: true }, d(2027, 10, 20)));
});

test('spread picks the least-loaded days, earliest on ties', () => {
    const db = emptyDB();
    db.Monday = [{}, {}];                 // Mondays heavy
    const m = { rule: { type: 'spread', count: 3 } };
    db.monthly.push(m);
    S.assignSpread(db, m, 2026, 9, 1);    // October 2026 (month is 0-based)
    const picks = m.assigned['2026-10'];
    assert.strictEqual(picks.length, 3);
    assert.ok(picks.every(k => S.wdIndex(S.parseDateKey(k)) !== 0));
    assert.deepStrictEqual(picks, ['2026-10-01', '2026-10-02', '2026-10-03']);
});

test('spread respects fromDay and never exceeds available days', () => {
    const db = emptyDB();
    const m = { rule: { type: 'spread', count: 10 } };
    db.monthly.push(m);
    S.assignSpread(db, m, 2026, 9, 29);
    assert.deepStrictEqual(m.assigned['2026-10'], ['2026-10-29', '2026-10-30', '2026-10-31']);
});

test('spread balances against other monthly items', () => {
    const db = emptyDB();
    db.monthly.push({ rule: { type: 'date', date: '2026-10-01' } });
    const m = { rule: { type: 'spread', count: 1 } };
    db.monthly.push(m);
    S.assignSpread(db, m, 2026, 9, 1);
    assert.strictEqual(m.assigned['2026-10'][0], '2026-10-02');
});
