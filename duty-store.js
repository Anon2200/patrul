'use strict';

const DUTY_TIME_ZONE = process.env.PATRUL_TIME_ZONE || 'Europe/Moscow';
const DATE_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone:DUTY_TIME_ZONE,
  year:'numeric',
  month:'2-digit',
  day:'2-digit',
  hour:'2-digit',
  minute:'2-digit',
  second:'2-digit',
  hourCycle:'h23'
});

function partsAt(timestamp) {
  const values = {};
  for (const part of DATE_PARTS.formatToParts(new Date(timestamp))) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return values;
}

function dutyDateAt(timestamp = Date.now()) {
  const p = partsAt(timestamp);
  return String(p.year).padStart(4,'0') + '-' +
    String(p.month).padStart(2,'0') + '-' +
    String(p.day).padStart(2,'0');
}

function nextDutyMidnight(timestamp = Date.now()) {
  const now = partsAt(timestamp);
  const target = Date.UTC(now.year,now.month-1,now.day+1,0,0,0);
  let guess = target;
  // Convert the next local midnight into UTC, including DST changes.
  for (let index=0;index<5;index++) {
    const local = partsAt(guess);
    const represented = Date.UTC(local.year,local.month-1,local.day,local.hour,local.minute,local.second);
    const correction = target - represented;
    guess += correction;
    if (correction === 0) break;
  }
  return guess;
}

async function purgeExpiredDutyData(pool) {
  const today = dutyDateAt();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rosters = await client.query('DELETE FROM patrul_duty_rosters WHERE duty_date < $1::date',[today]);
    const seniorEntries = await client.query('DELETE FROM patrul_patrol_senior_entries WHERE entry_date < $1::date',[today]);
    await client.query('COMMIT');
    const removed = rosters.rowCount + seniorEntries.rowCount;
    if (removed) {
      console.info('Daily duty cleanup (' + today + ' ' + DUTY_TIME_ZONE + '): rosters=' +
        rosters.rowCount + ', seniorEntries=' + seniorEntries.rowCount);
    }
    return {today,rosters:rosters.rowCount,seniorEntries:seniorEntries.rowCount};
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally {
    client.release();
  }
}

function startDutyCleanup(pool) {
  let stopped = false;
  let timer = null;
  let running = false;

  const schedule = () => {
    if (stopped) return;
    const delay = Math.max(1000,nextDutyMidnight() - Date.now() + 250);
    timer = setTimeout(run,delay);
    if (timer && typeof timer.unref === 'function') timer.unref();
  };

  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await purgeExpiredDutyData(pool);
    } catch (error) {
      console.error('Daily duty cleanup failed:',error.message);
    } finally {
      running = false;
      schedule();
    }
  };

  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

module.exports = {DUTY_TIME_ZONE,dutyDateAt,nextDutyMidnight,purgeExpiredDutyData,startDutyCleanup};
