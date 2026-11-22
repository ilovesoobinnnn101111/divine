import { farmConfig } from './config.js';

function requireDatabase(client) {
  if (!client.db?.isAvailable?.()) throw new Error('PostgreSQL is unavailable; refusing to modify farm records.');
}
const key = (guildId, kind) => `${farmConfig.databasePrefix}${guildId}:${kind}`;
export async function readRecords(client, guildId, kind) {
  const value = await client.db.get(key(guildId, kind), []);
  return Array.isArray(value) ? value : [];
}
export async function appendRecord(client, guildId, kind, record) {
  requireDatabase(client);
  const records = await readRecords(client, guildId, kind);
  records.push(record);
  await client.db.set(key(guildId, kind), records);
  return records;
}
export async function replaceRecords(client, guildId, kind, records) {
  requireDatabase(client);
  await client.db.set(key(guildId, kind), records);
}
export function isManager(member) {
  return Boolean(member?.permissions?.has('ManageGuild') || farmConfig.roles.manager.some(id => member?.roles?.cache?.has(id)));
}
export function canReport(member) {
  return isManager(member) || farmConfig.roles.reportPlayer.some(id => member?.roles?.cache?.has(id));
}
export const relativeTime = timestamp => `<t:${Math.floor(timestamp / 1000)}:R>`;
