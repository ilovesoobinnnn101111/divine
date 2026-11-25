import { EmbedBuilder } from 'discord.js';
import { readRecords } from './records.js';

const cairo = ms => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
}).formatToParts(ms).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
function localTimestamp(y, m, d, h = 8) {
  const wanted = Date.UTC(y, m - 1, d, h);
  let value = wanted;
  for (let i = 0; i < 4; i++) {
    const p = cairo(value);
    value += wanted - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return value;
}
export async function runWeeklyHostAward(client) {
  const guildId = process.env.TEST_GUILD_ID?.trim();
  const channelId = process.env.HOST_OF_THE_WEEK_CHANNEL_ID?.trim();
  const roleId = process.env.HOST_OF_THE_WEEK_ROLE_ID?.trim();
  if (!guildId || !channelId || !roleId || !client.db?.isAvailable?.()) return;
  const now = Date.now(), p = cairo(now);
  const date = Date.UTC(p.year, p.month - 1, p.day);
  const mondayOffset = (new Date(date).getUTCDay() + 6) % 7;
  const monday = new Date(date - mondayOffset * 86400000);
  const end = localTimestamp(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
  if (now < end || now - end > 7 * 86400000) return;
  const friday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() - 3));
  const start = localTimestamp(friday.getUTCFullYear(), friday.getUTCMonth() + 1, friday.getUTCDate());
  const key = `farm:v1:${guildId}:hostOfWeekProcessed:${end}`;
  if (await client.db.get(key, false)) return;
  const guild = await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(channelId);
  if (!channel?.send) throw new Error('Host of the Week announcement channel is unavailable.');
  const logs = await readRecords(client, guildId, 'hostLogs');
  const totals = new Map();
  for (const log of logs) {
    const timestamp = Number(log.timestamp ?? log.date);
    if (!log.hostId || !Number.isFinite(timestamp) || timestamp < start || timestamp >= end) continue;
    totals.set(log.hostId, (totals.get(log.hostId) || 0) + (Number(log.minutes) || 0));
  }
  const winners = [...totals.entries()].filter(([, minutes]) => minutes >= 300)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const winner = winners[0];
  if (!winner) {
    await channel.send({ embeds: [new EmbedBuilder().setTitle('Host of the Week').setColor(0xD95387)
      .setDescription('No host met the 5-hour quota this week.')] });
    await client.db.set(key, { winnerId: null, announcedAt: Date.now() });
    return;
  }
  const role = await guild.roles.fetch(roleId);
  const me = await guild.members.fetchMe();
  if (!role || !me.permissions.has('ManageRoles') || role.position >= me.roles.highest.position) {
    throw new Error('Host of the Week role missing or bot cannot manage it.');
  }
  const member = await guild.members.fetch(winner[0]);
  await member.roles.add(role, 'Automatic Host of the Week award');
  await channel.send({ embeds: [new EmbedBuilder().setTitle('Host of the Week 🏆').setColor(0xFFD700)
    .setDescription(`Congratulations <@${winner[0]}>!\n**Hours hosted:** ${(winner[1] / 60).toFixed(1)}\n**Weekly quota:** 5 hours`)] });
  await client.db.set(key, { winnerId: winner[0], announcedAt: Date.now() });
}
