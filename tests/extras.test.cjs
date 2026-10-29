'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseIcs, nextStart, icsDate } = require('../extras-main.cjs');

const ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT', 'SUMMARY:Maths\\, test', 'DTSTART:20261009T083000Z', 'DTEND:20261009T093000Z', 'END:VEVENT',
  'BEGIN:VEVENT', 'SUMMARY:Football', 'DTSTART;TZID=Asia/Kuala_Lumpur:20261001T180000', 'DTEND;TZID=Asia/Kuala_Lumpur:20261001T193000',
  'RRULE:FREQ=WEEKLY;UNTIL=20261231T000000Z', 'END:VEVENT',
  'BEGIN:VEVENT', 'SUMMARY:Birthday', 'DTSTART;VALUE=DATE:20261012', 'END:VEVENT',
  'BEGIN:VEVENT', 'SUMMARY:Long title that', ' continues', 'DTSTART:20261020T120000Z', 'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

test('calendar: reads titles, times, all-day events and folded lines', () => {
  const events = parseIcs(ICS);
  assert.equal(events.length, 4);
  assert.equal(events[0].title, 'Maths, test');
  assert.equal(events[0].start, Date.UTC(2026, 9, 9, 8, 30));
  assert.equal(events[0].duration, 3600000);
  assert.equal(events[2].allDay, true);
  assert.equal(events[3].title, 'Long title thatcontinues');
});

test('calendar: weekly repeats give the next date, and stop after UNTIL', () => {
  const football = parseIcs(ICS)[1];
  const now = new Date(2026, 9, 8, 12, 0).getTime(); // Thursday 8 Oct, 12:00
  assert.equal(nextStart(football, now), new Date(2026, 9, 8, 18, 0).getTime());
  assert.equal(nextStart(football, new Date(2027, 0, 5).getTime()), null);
  assert.equal(icsDate('nonsense'), null);
});
