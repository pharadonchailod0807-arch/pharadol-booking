import test from 'node:test';
import assert from 'node:assert/strict';
import { bangkokTodayTime, eventDateTime, formatCustomerEventDate, formatCustomerCreatedAt, selectCustomerBookings } from '../app/lib/customerBookingList.js';
import { readCustomerBookingList } from '../lib/customer-booking-query.js';

const ids = (rows) => rows.map((row) => row.supabaseId);
const sort = (rows, sortBy, sortDirection = 'asc', options = {}) =>
  selectCustomerBookings(rows, { sortBy, sortDirection, ...options });

const dates = [
  { supabaseId: 'jan', eventDate: '2027-01-01', formattedEventDate: 'wrong display' },
  { supabaseId: 'nov', eventDate: '1/11/2569' },
  { supabaseId: 'oct', eventDate: '2026-10-31' },
  { supabaseId: 'dec', eventDate: '2570-01-01' },
  { supabaseId: 'empty', eventDate: '' },
  { supabaseId: 'invalid', eventDate: '2026-02-30' },
];

test('event dates sort chronologically across months, years, CE/BE and missing dates', () => {
  assert.deepEqual(ids(sort(dates, 'eventDate')), ['oct', 'nov', 'dec', 'jan', 'empty', 'invalid']);
  assert.deepEqual(ids(sort(dates, 'eventDate', 'desc')), ['dec', 'jan', 'nov', 'oct', 'empty', 'invalid']);
  assert.equal(eventDateTime('31/10/2569'), eventDateTime('2026-10-31'));
  assert.equal(eventDateTime('31/10/2026'), eventDateTime('2569-10-31'));
  assert.equal(eventDateTime('29/2/2567'), eventDateTime('2024-02-29'));
  for (const bad of ['', null, undefined, '31/2/2569', '2026-13-01', 'not a date']) {
    assert.equal(eventDateTime(bad), null);
  }
});

test('display formatting never adds 543 twice, and created timestamps display in Bangkok', () => {
  assert.equal(formatCustomerEventDate('2569-10-31'), '31/10/2569');
  assert.equal(formatCustomerEventDate('31/10/2569'), '31/10/2569');
  assert.equal(formatCustomerEventDate('2026-10-31'), '31/10/2569');
  assert.equal(formatCustomerEventDate(''), '-');
  assert.equal(formatCustomerCreatedAt('2026-10-31T18:00:00Z'), '1/11/2569');
});

test('booking numbers use numeric segments in both directions and retain reused numbers', () => {
  const rows = ['BK-20260706-10', 'BK-20260706-9', 'BK-20260706-0011', 'BK-20261231-1', 'BK-20270101-1']
    .map((bookingNumber, i) => ({ bookingNumber, supabaseId: String(i) }));
  assert.deepEqual(ids(sort(rows, 'bookingNumber')), ['1', '0', '2', '3', '4']);
  assert.deepEqual(ids(sort(rows, 'bookingNumber', 'desc')), ['4', '3', '2', '0', '1']);
  const reused = [ {supabaseId: '2', bookingNumber: 'BK-20260706-0009'}, {supabaseId: '1', bookingNumber: 'BK-20260706-0009'} ];
  assert.deepEqual(ids(sort(reused, 'bookingNumber')), ['1', '2']);
});

test('customer names sort A-Z/Z-A and Thai names use Thai collation', () => {
  const rows = ['Zoe', 'Bob', 'Alice'].map((customerName) => ({customerName, supabaseId: customerName}));
  assert.deepEqual(ids(sort(rows, 'customerName')), ['Alice', 'Bob', 'Zoe']);
  assert.deepEqual(ids(sort(rows, 'customerName', 'desc')), ['Zoe', 'Bob', 'Alice']);
  const thai = ['ขวัญ', 'กานต์'].map((customerName) => ({customerName, supabaseId: customerName}));
  assert.deepEqual(ids(sort(thai, 'customerName')), ['กานต์', 'ขวัญ']);
});

test('event type, status and exact creation timestamps support both directions', () => {
  const rows = [
    {supabaseId: 'b', service: 'Wedding', jobStatus: 'Z', createdAt: '2026-10-31T19:00:00Z'},
    {supabaseId: 'a', service: 'Event', jobStatus: 'A', createdAt: '2026-11-01T01:00:00+07:00'},
    {supabaseId: 'missing', createdAt: 'invalid'},
  ];
  for (const key of ['service', 'jobStatus', 'createdAt']) {
    const input = key === 'jobStatus' ? rows.slice(0, 2) : rows;
    assert.deepEqual(ids(sort(input, key)), key === 'jobStatus' ? ['a', 'b'] : ['a', 'b', 'missing']);
    assert.deepEqual(ids(sort(input, key, 'desc')), key === 'jobStatus' ? ['b', 'a'] : ['b', 'a', 'missing']);
  }
});

test('search and sort cover the entire dataset before pagination, without mutation', () => {
  const rows = Array.from({length: 75}, (_, i) => Object.freeze({
    supabaseId: String(i), customerName: i % 2 ? 'Alice' : 'Bob',
    eventDate: `2027-01-${String(31 - i % 31).padStart(2, '0')}`,
  }));
  Object.freeze(rows);
  const result = sort(rows, 'eventDate', 'asc', {search: '  ALICE '});
  assert.equal(result.length, 37);
  assert.ok(result.every((row) => row.customerName === 'Alice'));
  assert.ok(Number(result[0].supabaseId) >= 30, 'earliest match was outside the initial page');
  const firstPage = result.slice(0, 20);
  const secondPage = result.slice(20, 40);
  assert.ok(eventDateTime(firstPage.at(-1).eventDate) <= eventDateTime(secondPage[0].eventDate));
  assert.equal(new Set([...firstPage, ...secondPage].map((row) => row.supabaseId)).size, 37);
  assert.equal(selectCustomerBookings(rows, { search: 'no match' }).length, 0);
  assert.equal(rows[0].supabaseId, '0');
});

test('Bangkok today switches at 17:00 UTC, regardless of the host timezone', () => {
  assert.equal(bangkokTodayTime(new Date('2026-10-31T16:59:59Z')), Date.UTC(2026, 9, 31));
  assert.equal(bangkokTodayTime(new Date('2026-10-31T17:00:00Z')), Date.UTC(2026, 10, 1));
});

test('upcoming excludes past/missing/invalid dates, includes today and does not change status', () => {
  const today = bangkokTodayTime(new Date('2026-10-31T18:00:00Z'));
  const rows = [
    {supabaseId: 'past', eventDate: '31/10/2569'},
    {supabaseId: 'today', eventDate: '1/11/2569', status: 'cancelled'},
    {supabaseId: '6', eventDate: '2026-11-07'},
    {supabaseId: '7', eventDate: '2026-11-08'},
    {supabaseId: '29', eventDate: '2026-11-30'},
    {supabaseId: '30', eventDate: '2026-12-01'},
    {supabaseId: 'future', eventDate: '2027-01-01'},
    {supabaseId: 'missing', eventDate: ''},
  ];
  assert.deepEqual(ids(sort(rows, 'eventDate', 'asc', { dateFilter: 'upcoming', today })), ['today', '6', '7', '29', '30', 'future']);
  assert.deepEqual(ids(sort(rows, 'eventDate', 'asc', { dateFilter: '7', today })), ['today', '6']);
  assert.deepEqual(ids(sort(rows, 'eventDate', 'asc', { dateFilter: '30', today })), ['today', '6', '7', '29']);
  assert.equal(rows[1].status, 'cancelled');
  assert.equal(selectCustomerBookings(rows, { dateFilter: 'all' }).length, rows.length);
});

test('date windows span December/January correctly', () => {
  const rows = [{supabaseId: 'in', eventDate: '2570-01-02'}, {supabaseId: 'out', eventDate: '2027-01-06'}];
  const result = sort(rows, 'eventDate', 'asc', { dateFilter: '7', today: Date.UTC(2026, 11, 30) });
  assert.deepEqual(ids(result), ['in']);
});

function fakeClient(rows, {cap = 2, failure = null} = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, 'bookings');
      const query = {
        select(columns) { calls.push({ columns }); return query; },
        eq(key, value) { calls.push({ key, value }); return query; },
        order(key, value) { calls.push({ order: key, ...value }); return query; },
        async range(start, end) { calls.push({start, end}); return {data: rows.slice(start, Math.min(end+1, start+cap)), error: failure}; },
      };
      return query;
    },
  };
}
const summary = (row) => ({
  supabaseId: row.id, brandId: row.booking_data.brandId,
  bookingStatus: row.booking_data.bookingStatus,
  bookingNumber: row.booking_number, eventDate: row.booking_data.eventDate,
});

test('complete metadata loading crosses backend caps, filters brands/drafts and prefers database event_date', async () => {
  const client = fakeClient([
    {id: 'a', booking_number: 'BK-1', list_brandId: 'pharadol', event_date: '2026-11-01', list_eventDate: '2026-12-01'},
    {id: 'b', booking_number: 'BK-1', list_brandId: 'adisorn'},
    {id: 'c', booking_number: 'BK-2', list_brandId: 'pharadol', list_bookingStatus: 'draft'},
    {id: 'd', booking_number: 'BK-1', list_brandId: 'pharadol', list_formattedEventDate: '31/12/2569'},
    {id: 'e', booking_number: 'BK-3', list_brandId: 'adisorn'},
  ]);
  const result = await readCustomerBookingList(client, 'pharadol', summary);
  assert.deepEqual(ids(result), ['a', 'd']);
  assert.equal(result[0].eventDate, '2026-11-01');
  assert.equal(result[1].eventDate, '31/12/2569');
  assert.deepEqual(client.calls.filter((x) => 'start' in x).map((x) => x.start), [0, 2, 4, 5]);
  assert.ok(!client.calls[0].columns.includes('slipImage'));
  assert.ok(!client.calls[0].columns.split(',').includes('booking_data'));
  assert.ok(client.calls.some((x) => x.key === 'deleted' && x.value === false));
  assert.ok(client.calls.some((x) => x.key === 'archived' && x.value === false));
});

test('a database batch failure rejects the entire list instead of returning partial results', async () => {
  const client = fakeClient([], {failure: new Error('database unavailable')});
  await assert.rejects(readCustomerBookingList(client, 'adisorn', summary), /database unavailable/);
});
