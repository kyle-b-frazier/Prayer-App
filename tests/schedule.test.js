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

test('leastLoadedWeekdays picks the emptiest weekdays, Monday first on ties', () => {
    const db = emptyDB();
    db.Monday = [{}, {}]; db.Tuesday = [{}]; db.Wednesday = [{}, {}, {}];
    db.Saturday = [{}]; db.Sunday = [{}, {}];
    assert.deepStrictEqual(S.leastLoadedWeekdays(db, 1), ['Thursday']);
    assert.deepStrictEqual(S.leastLoadedWeekdays(db, 3), ['Thursday', 'Friday', 'Tuesday']);
});

test('leastLoadedWeekdays counts everyday prayers equally and can exclude a group', () => {
    const db = emptyDB();
    db.everyday = [{}, {}];
    db.Monday = [{ groupId: 7 }]; db.Tuesday = [{}];
    assert.deepStrictEqual(S.leastLoadedWeekdays(db, 1), ['Wednesday']);
    db.Wednesday = [{}, {}]; db.Thursday = [{}]; db.Friday = [{}]; db.Saturday = [{}]; db.Sunday = [{}];
    assert.deepStrictEqual(S.leastLoadedWeekdays(db, 1, 7), ['Monday']);
});

test('range rule covers every day from start to end inclusive', () => {
    const m = { rule: { type: 'range', start: '2026-11-03', end: '2026-11-10' } };
    assert.ok(!S.monthlyApplies(m, d(2026, 11, 2)));
    assert.ok(S.monthlyApplies(m, d(2026, 11, 3)));
    assert.ok(S.monthlyApplies(m, d(2026, 11, 7)));
    assert.ok(S.monthlyApplies(m, d(2026, 11, 10)));
    assert.ok(!S.monthlyApplies(m, d(2026, 11, 11)));
});

test('range rule spans months and counts toward day load', () => {
    const db = emptyDB();
    db.monthly.push({ rule: { type: 'range', start: '2026-11-28', end: '2026-12-02' } });
    assert.strictEqual(S.dayLoad(db, d(2026, 12, 1)), 1);
    assert.strictEqual(S.dayLoad(db, d(2026, 12, 3)), 0);
});

test('describeRange shows day count', () => {
    const y = new Date().getFullYear();
    assert.strictEqual(S.describeRange(`${y}-11-03`, `${y}-11-10`), 'Nov 3 – Nov 10 (8 days)');
    assert.strictEqual(S.describeRange(`${y}-11-03`, `${y}-11-03`), 'Nov 3');
});

test('leastLoadedNthWeekday picks the weekday with the fewest prayers in the chosen week', () => {
    const db = emptyDB();
    db.Monday = [{}]; db.Tuesday = [{}]; db.Wednesday = [{}];
    db.Friday = [{}]; db.Saturday = [{}]; db.Sunday = [{}];
    assert.strictEqual(S.leastLoadedNthWeekday(db, [1], 2026, 10, 1), 3);   // Thursday
    // A dated prayer on the 1st Thursday of Nov 2026 (Nov 5) makes Thursday busier.
    db.monthly.push({ rule: { type: 'date', date: '2026-11-05' } });
    db.monthly.push({ rule: { type: 'date', date: '2026-11-05' } });
    assert.notStrictEqual(S.leastLoadedNthWeekday(db, [1], 2026, 10, 1), 3);
    // ...but not in the 2nd week.
    assert.strictEqual(S.leastLoadedNthWeekday(db, [2], 2026, 10, 1), 3);
});

test('leastLoadedNthWeekday with no week chosen considers every occurrence, Monday on ties', () => {
    assert.strictEqual(S.leastLoadedNthWeekday(emptyDB(), [], 2026, 10, 3), 0);
});
