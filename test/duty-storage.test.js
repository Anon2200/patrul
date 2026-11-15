'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {dutyDateAt,nextDutyMidnight,purgeExpiredDutyData,DUTY_TIME_ZONE} = require('../duty-store');

test('duty day uses the configured Berlin local calendar date', () => {
  assert.equal(DUTY_TIME_ZONE,'Europe/Berlin');
  assert.equal(dutyDateAt(Date.parse('2026-01-01T22:59:59.000Z')),'2026-01-01');
  assert.equal(dutyDateAt(Date.parse('2026-01-01T23:00:00.000Z')),'2026-01-02');
});

test('duty midnight remains correct across the spring daylight-saving transition', () => {
  assert.equal(dutyDateAt(Date.parse('2026-03-29T21:59:59.000Z')),'2026-03-29');
  assert.equal(dutyDateAt(Date.parse('2026-03-29T22:00:00.000Z')),'2026-03-30');
});

test('next cleanup timer targets the next local midnight through DST changes', () => {
  assert.equal(nextDutyMidnight(Date.parse('2026-01-01T12:00:00.000Z')),Date.parse('2026-01-01T23:00:00.000Z'));
  assert.equal(nextDutyMidnight(Date.parse('2026-03-29T21:59:59.000Z')),Date.parse('2026-03-29T22:00:00.000Z'));
  assert.equal(nextDutyMidnight(Date.parse('2026-10-25T22:59:59.000Z')),Date.parse('2026-10-25T23:00:00.000Z'));
});

test('daily cleanup atomically removes expired rosters and senior daily logs but preserves calendar schedule history', async () => {
  const calls=[];
  let released=false;
  const responses=[
    {rowCount:3,rows:[]},
    {rowCount:4,rows:[]}
  ];
  const client={
    async query(sql,params) {
      calls.push({sql:String(sql).replace(/\s+/g,' ').trim(),params:params||[]});
      if(/^DELETE FROM patrul_duty_rosters/.test(String(sql)))return responses[0];
      if(/^DELETE FROM patrul_patrol_senior_entries/.test(String(sql)))return responses[1];
      return {rowCount:0,rows:[]};
    },
    release(){released=true;}
  };
  const pool={async connect(){return client;}};
  const result=await purgeExpiredDutyData(pool);
  assert.deepEqual(result,{today:dutyDateAt(),rosters:3,seniorEntries:4});
  assert.equal(calls[0].sql,'BEGIN');
  assert.match(calls[1].sql,/DELETE FROM patrul_duty_rosters WHERE duty_date < \$1::date/);
  assert.match(calls[2].sql,/DELETE FROM patrul_duty_schedule WHERE duty_date < \$1::date/);
  assert.match(calls[3].sql,/DELETE FROM patrul_patrol_senior_entries WHERE entry_date < \$1::date/);
  for(const call of calls.slice(1,4))assert.deepEqual(call.params,[result.today]);
  assert.equal(calls[4].sql,'COMMIT');
  assert.equal(released,true);
});

test('daily cleanup rolls back if one of the independent stores cannot be cleared', async () => {
  const calls=[];
  let released=false;
  const client={
    async query(sql,params) {
      calls.push(String(sql).replace(/\s+/g,' ').trim());
      if(String(sql).includes('patrul_patrol_senior_entries'))throw new Error('simulated delete failure');
      return {rowCount:1,rows:[]};
    },
    release(){released=true;}
  };
  await assert.rejects(purgeExpiredDutyData({async connect(){return client;}}),/simulated delete failure/);
  assert.equal(calls[0],'BEGIN');
  assert.equal(calls.at(-1),'ROLLBACK');
  assert.equal(released,true);
});
