/**
 * Farm system configuration.
 * Uses Divine's existing Discord client and PostgreSQL connection.
 * No bot token or database credentials are stored here.
 */
const parseRoles = (value = '') =>
  value.split(',').map(id => id.trim()).filter(Boolean);

export const farmConfig = Object.freeze({
  guildId: process.env.GUILD_ID || null,
  channels: {
    farmLog: process.env.FARM_LOG_CHANNEL_ID || null,
    hostLog: process.env.HOST_LOG_CHANNEL_ID || null,
    hostVouch: process.env.HOST_VOUCH_CHANNEL_ID || null,
    reportPlayer: process.env.REPORT_PLAYER_CHANNEL_ID || null,
    leaderboard: process.env.LEADERBOARD_CHANNEL_ID || null,
  },
  roles: {
    host: parseRoles(process.env.HOST_ROLE_ID),
    manager: parseRoles(process.env.HOST_MANAGER_ROLE_ID),
    reportPlayer: parseRoles(process.env.REPORT_PLAYER_ROLE_ID),
    blacklist: process.env.BLACKLIST_ROLE_ID || null,
  },
  databasePrefix: 'farm:v1:',
});

export function getMissingFarmConfig() {
  const missing = [];
  if (!farmConfig.guildId) missing.push('GUILD_ID');
  if (!farmConfig.channels.farmLog) missing.push('FARM_LOG_CHANNEL_ID');
  if (!farmConfig.channels.hostLog) missing.push('HOST_LOG_CHANNEL_ID');
  if (!farmConfig.channels.hostVouch) missing.push('HOST_VOUCH_CHANNEL_ID');
  if (!farmConfig.channels.reportPlayer) missing.push('REPORT_PLAYER_CHANNEL_ID');
  if (farmConfig.roles.host.length === 0) missing.push('HOST_ROLE_ID');
  if (farmConfig.roles.manager.length === 0) missing.push('HOST_MANAGER_ROLE_ID');
  return missing;
}

export function memberHasFarmRole(member, roleIds) {
  const roles = member?.roles;
  if (Array.isArray(roles)) return roleIds.some(id => roles.includes(id));
  return Boolean(roles?.cache && roleIds.some(id => roles.cache.has(id)));
}
