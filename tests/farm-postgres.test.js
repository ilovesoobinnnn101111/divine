import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { saveActiveFarm, getActiveFarm, completeFarm } from '../src/services/farm/sessionService.js';
import { readRecords, appendRecord } from '../src/services/farm/records.js';

// Isolated PostgreSQL container supplied by GitHub Actions. Never touches Railway.
const pool = new pg.Pool({ connectionString: process.env.TEST_POSTGRES_URL });
const prefix = 'farm:v1:';
const client = { db: {
  isAvailable: () => true,
  get: async (key, fallback = null) => {
    const result = await pool.query('SELECT value FROM farm_test_kv WHERE key = $1', [key]);
    return result.rows.length ? result.rows[0].value : fallback;
  },
  set: async (key, value) => {
    await pool.query('INSERT INTO farm_test_kv (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, JSON.stringify(value)]);
  },
  delete: async key => { await pool.query('DELETE FROM farm_test_kv WHERE key = $1', [key]); },
}};
test('real PostgreSQL saves active farms and participant history', async () => {
  assert.ok(process.env.TEST_POSTGRES_URL, 'TEST_POSTGRES_URL must point to isolated test PostgreSQL');
  await pool.query('CREATE TABLE IF NOT EXISTS farm_test_kv (key text PRIMARY KEY, value jsonb NOT NULL)');
  await pool.query('TRUNCATE farm_test_kv');
  const session = { hostId:'host', messageId:'message', channelId:'channel', type:'REGULAR', startedAt:Date.now(), altAccounts:1, players:['player'] };
  try {
    await saveActiveFarm(client, 'testguild', session);
    assert.deepEqual(await getActiveFarm(client, 'testguild'), session);
    await completeFarm(client, 'testguild', session, 'ENDED');
    assert.equal(await getActiveFarm(client, 'testguild'), null);
    const history = await readRecords(client, 'testguild', 'completedSessions');
    assert.equal(history.length, 1);
    assert.deepEqual(history[0].playerIds, ['player']);
    await Promise.all(Array.from({ length: 10 }, (_, i) => appendRecord(client, 'testguild', 'hostLogs', { id: i })));
    assert.equal((await readRecords(client, 'testguild', 'hostLogs')).length, 10);
  } finally {
    await pool.query('DROP TABLE IF EXISTS farm_test_kv');
    await pool.end();
  }
});
