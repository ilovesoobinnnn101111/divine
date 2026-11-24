import { farmConfig } from './config.js';

function requireDatabase(client) {
  if (!client.db?.isAvailable?.()) throw new Error('PostgreSQL is unavailable; refusing to modify farm records.');
}
const key = (guildId, kind) => `${farmConfig.databasePrefix}${guildId}:${kind}`;
export async function readRecords(client, guildId, kind) {
  requireDatabase(client);
  const value = await client.db.get(key(guildId, kind), []);
  if (!Array.isArray(value)) throw new Error('Invalid farm record collection; refusing to overwrite '+kind);
  return value;
}
const recordLocks = new Map();
export async function withRecordLock(client, guildId, kind, task) {
  const lockKey = `${guildId}:${kind}`;
  const previous = recordLocks.get(lockKey) || Promise.resolve();
  let release;
  const next = new Promise(resolve => { release = resolve; });
  const tail = previous.then(() => next);
  recordLocks.set(lockKey, tail);
  await previous;
  try { return await task(); }
  finally {
    release();
    if (recordLocks.get(lockKey) === tail) recordLocks.delete(lockKey);
  }
}
export async function appendRecord(client, guildId, kind, record) {
  requireDatabase(client);
  return withRecordLock(client, guildId, kind, async () => {
    const records = await readRecords(client, guildId, kind);
    const identity = kind === 'boosterOrders' ? 'order_id' : kind === 'boostRequests' ? 'request_id' : null;
    if (identity && record[identity] && records.some(x => x[identity] === record[identity])) throw new Error('Duplicate '+identity);
    if (kind === 'boosterOrders' && record.request_id && records.some(x => x.request_id === record.request_id)) throw new Error('Request already has an order');
    records.push(record);
    await client.db.set(key(guildId, kind), records);
    return records;
  });
}
export async function replaceRecords(client, guildId, kind, records) {
  requireDatabase(client);
  await withRecordLock(client, guildId, kind, () => client.db.set(key(guildId, kind), records));
}
export function isManager(member) {
  return Boolean(member?.permissions?.has('ManageGuild') || farmConfig.roles.manager.some(id => member?.roles?.cache?.has(id)));
}
export function canReport(member) {
  return isManager(member) || farmConfig.roles.reportPlayer.some(id => member?.roles?.cache?.has(id));
}
export const relativeTime = timestamp => `<t:${Math.floor(timestamp / 1000)}:R>`;
