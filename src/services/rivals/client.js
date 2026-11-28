export async function rivalsRequest(kind, player = '') {
  const base = process.env.RIVALS_SERVICE_URL;
  const token = process.env.RIVALS_SERVICE_TOKEN;
  if (!base || !token) throw new Error('Statistics service is not configured.');
  if (!['profile','livegame','proficiency','matchhistory','top500'].includes(kind)) throw new Error('Invalid statistics category.');
  const url = new URL(base.replace(/\/$/, '') + '/stats/' + kind);
  if (player) url.searchParams.set('player', player);
  const response = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('Statistics service unavailable (' + response.status + ').');
  const result = await response.json();
  if (!result || !Object.hasOwn(result, 'data')) throw new Error('Invalid statistics response.');
  return result;
}

const key = (guildId, userId) => 'rivals:default:' + guildId + ':' + userId;
function requireDatabase(client) {
  if (!client.db?.isAvailable?.()) throw new Error('Profile storage unavailable.');
}
export async function getDefaultProfile(client, guildId, userId) {
  requireDatabase(client);
  return client.db.get(key(guildId, userId), null);
}
export async function saveDefaultProfile(client, guildId, userId, profile) {
  requireDatabase(client);
  if (!/^\d+$/.test(String(profile.uid))) throw new Error('Provider did not return a valid UID.');
  const record = { uid: String(profile.uid), name: String(profile.name || profile.uid), savedAt: Date.now() };
  await client.db.set(key(guildId, userId), record);
  return record;
}
