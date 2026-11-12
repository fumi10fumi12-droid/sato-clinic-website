const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {departments, times, tokyoNow, weekDates, slotStatus, selectable} = require('../js/reservation-booking.js');

const now = new Date('2026-11-12T01:15:00Z');
assert.deepEqual(tokyoNow(now), {date: '2026-11-12', time: '10:15'});
assert.equal(tokyoNow(new Date('2026-11-11T15:30:00Z')).date, '2026-11-12');
assert.deepEqual(weekDates(0, now), ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']);
assert.equal(weekDates(7, now)[0], '2026-11-19');
assert.equal(weekDates(-7, now)[0], '2026-11-12');
assert.deepEqual(weekDates(0, new Date('2028-02-28T00:00:00Z')).slice(0, 3), ['2028-02-28', '2028-02-29', '2028-03-01']);
assert.equal(weekDates(7, new Date('2026-12-28T00:00:00Z'))[0], '2027-01-04');
assert.equal(times.length, 16);
assert.equal(times[0], '09:00');
assert.equal(times.at(-1), '17:30');
assert(!times.includes('12:00'));
assert(!times.includes('12:30'));
assert(!times.includes('18:00'));

const seen = new Set();
for (const department of departments) {
  for (const offset of [0, 7, 14]) {
    for (const date of weekDates(offset, now)) {
      for (const time of times) {
        const status = slotStatus(date, time, department, now);
        assert.equal(status, slotStatus(date, time, department, now), 'sample statuses must be stable');
        seen.add(status);
        const day = new Date(`${date}T00:00:00Z`).getUTCDay();
        if (day === 0 || day === 4 || (day === 6 && time >= '12:00')) {
          assert.equal(status, 'closed');
          assert(!selectable(status));
        } else {
          assert(['available', 'limited', 'full'].includes(status));
        }
      }
    }
  }
}
assert.deepEqual([...seen].sort(), ['available', 'closed', 'full', 'limited']);
assert(selectable('available'));
assert(selectable('limited'));
assert(!selectable('full'));
assert(!selectable('closed'));
assert.equal(slotStatus('2026-11-11', '09:00', departments[0], now), 'closed');
assert.equal(slotStatus('2026-11-13', '10:00', departments[0], new Date('2026-11-13T01:15:00Z')), 'closed');
assert.equal(slotStatus('2026-11-13', '18:00', departments[0], now), 'closed');
assert.equal(slotStatus('2026-11-13', '09:00', '未登録科目', now), 'closed');
assert.equal(slotStatus('2026-02-30', '09:00', departments[0], now), 'closed');

let forms = 0;
for (const file of ['index.html', 'news.html', 'medical.html', 'about.html', 'hours.html', 'faq.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const entries = [...html.matchAll(/<form class="reservation-preview"[\s\S]*?<\/form>/g)];
  assert.equal(entries.length, file === 'index.html' ? 2 : 1);
  forms += entries.length;
  entries.forEach(([entry]) => {
    assert(entry.includes('実際の予約は登録されません'));
    assert(entry.includes('空き状況を確認して予約する'));
    assert(!entry.includes('name="consultation"'));
  });
  assert(html.includes('./css/booking.css'));
  assert(html.includes('./js/reservation-booking.js'));
  assert(!html.includes('./js/reservation-calendar.js'));
  assert(!html.includes('./js/reservation-confirmation.js'));
}
assert.equal(forms, 7);
console.log('Booking checks passed: JST dates, week changes, leap/year boundaries, stable sample slots, closed days, Saturday afternoon, past times, 7 form entry points.');
