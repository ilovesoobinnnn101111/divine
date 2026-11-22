import test from 'node:test';
import assert from 'node:assert/strict';
import { farmButtons, farmEmbed, completeFarm } from '../src/services/farm/sessionService.js';
import { withRecordLock, readRecords } from '../src/services/farm/records.js';
import farmHandlers from '../src/interactions/buttons/farmButtons.js';
import farmModal from '../src/interactions/modals/farmRemoveAlts.js';
import startFarm from '../src/commands/Farm/startfarm.js';
import vouchHost from '../src/commands/Farm/vouchhost.js';

const session = () => ({ hostId: 'host', type: 'REGULAR', altAccounts: 2, players: [], startedAt: Date.now(), channelId: 'channel', messageId: 'message' });
function database() {
  const store = new Map();
  return { isAvailable: () => true, get: async (k, d) => structuredClone(store.has(k) ? store.get(k) : d), set: async (k,v) => { store.set(k, structuredClone(v)); }, delete: async k => { store.delete(k); }, store };
}
function interaction(userId, opts = {}) {
  const replies = [];
  return { id: 'interaction-' + userId, guildId: 'guild', user: { id: userId }, member: { roles: { cache: new Map() }, permissions: { has: () => false } }, message: { id: 'message' }, inGuild: () => true, options: { getUser: () => ({ id: opts.host || 'host', bot: false }), getInteger: () => opts.rating || 5, getString: () => null }, reply: async x => { replies.push(x); }, deferUpdate: async () => {}, update: async x => { replies.push(x); }, get replies() { return replies; } };
}
test('button IDs match Divine interaction dispatcher', () => {
  const ids = farmButtons(session())[0].components.map(x => x.data.custom_id);
  assert.deepEqual(ids, ['farm_join','farm_leave','farm_removealts','farm_end']);
  assert.deepEqual(farmHandlers.map(x => x.name), ids);
  assert.equal(farmModal.name, 'farm_removealtsmodal');
});
test('farm embed counts host and alts in 12 spots', () => {
  const e = farmEmbed({ ...session(), players: ['p1', 'p2'] }).toJSON();
  assert.equal(e.fields.find(f => f.name === 'Spots filled').value, '5/12');
});
test('startfarm enforces maximum 11 alt accounts', () => {
  const option = startFarm.data.toJSON().options.find(x => x.name === 'altaccounts');
  assert.equal(option.max_value, 11);
});
test('completed sessions persist eligible participant IDs', async () => {
  const db = database(), client = { db };
  await completeFarm(client, 'guild', { ...session(), players: ['a','b','a','host'] }, 'ENDED');
  const records = await readRecords(client, 'guild', 'completedSessions');
  assert.deepEqual(records[0].playerIds, ['a','b']);
  assert.equal(records[0].reason, 'ENDED');
});
test('only completed-session participants can vouch once per session', async () => {
  const db = database();
  const client = { db, channels: { fetch: async () => null } };
  await completeFarm(client, 'guild', { ...session(), players: ['participant'] }, 'ENDED');
  const outsider = interaction('outsider');
  await vouchHost.execute(outsider, null, client);
  assert.match(outsider.replies[0].content, /only vouch/i);
  const participant = interaction('participant');
  await vouchHost.execute(participant, null, client);
  assert.match(participant.replies[0].content, /recorded/i);
  const again = interaction('participant');
  await vouchHost.execute(again, null, client);
  assert.match(again.replies[0].content, /already vouched/i);
  assert.equal((await readRecords(client, 'guild', 'vouches')).length, 1);
});
test('record lock serializes concurrent operations', async () => {
  const order = [];
  await Promise.all([1,2,3].map(i => withRecordLock({}, 'guild', 'kind', async () => {
    order.push('start'+i);
    await new Promise(resolve => setImmediate(resolve));
    order.push('end'+i);
  })));
  assert.deepEqual(order, ['start1','end1','start2','end2','start3','end3']);
});
