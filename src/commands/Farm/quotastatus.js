import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';

const ZONE = 'Africa/Cairo';
const parts = ms => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
}).formatToParts(ms).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));

function cairoToTimestamp(y, m, d, hour = 8) {
  const target = Date.UTC(y, m - 1, d, hour);
  let result = target;
  for (let i = 0; i < 3; i++) {
    const p = parts(result);
    const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    result += target - actual;
  }
  return result;
}

function quotaWindow(now) {
  const p = parts(now);
  const localDate = Date.UTC(p.year, p.month - 1, p.day);
  const weekday = new Date(localDate).getUTCDay();
  const daysSinceFriday = (weekday - 5 + 7) % 7;
  const friday = new Date(localDate - daysSinceFriday * 86400000);
  let start = cairoToTimestamp(friday.getUTCFullYear(), friday.getUTCMonth() + 1, friday.getUTCDate());
  if (now < start) {
    const previous = new Date(localDate - (daysSinceFriday + 7) * 86400000);
    start = cairoToTimestamp(previous.getUTCFullYear(), previous.getUTCMonth() + 1, previous.getUTCDate());
  }
  const monday = new Date(Date.UTC(friday.getUTCFullYear(), friday.getUTCMonth(), friday.getUTCDate() + 3));
  let end = cairoToTimestamp(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
  if (end <= start) {
    const mondayAfter = new Date(start + 3 * 86400000);
    const q = parts(mondayAfter);
    end = cairoToTimestamp(q.year, q.month, q.day);
  }
  return { start, end, active: now >= start && now < end };
}

export default {
  data: new SlashCommandBuilder().setName('quotastatus').setDescription('View weekly host quota progress (Egypt time)'),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild()) return interaction.reply({ content: 'Server only command.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const now = Date.now();
    const window = quotaWindow(now);
    const logs = await readRecords(client, interaction.guildId, 'hostLogs');
    const stats = new Map();
    for (const log of logs) {
      const timestamp = Number(log.timestamp ?? log.date);
      if (!Number.isFinite(timestamp) || timestamp < window.start || timestamp >= window.end) continue;
      const id = log.hostId;
      if (!id) continue;
      const previous = stats.get(id) || { minutes: 0, games: 0, sessions: 0 };
      previous.minutes += Number(log.minutes) || 0;
      previous.games += Number(log.games) || 0;
      previous.sessions++;
      stats.set(id, previous);
    }
    const top = [...stats.entries()].sort((a, b) => b[1].minutes - a[1].minutes).slice(0, 10);
    const board = top.length ? top.map(([id, s], i) => `${i + 1}. <@${id}> — ${(s.minutes / 60).toFixed(1)}h / 5h (${s.sessions} sessions, ${s.games} games)`).join('\n') : 'No host logs recorded for this quota period.';
    const embed = new EmbedBuilder().setTitle('Weekly Host Quota').setColor(0xD95387)
      .setDescription(`**Period:** Friday 8 AM – Monday 8 AM (Egypt time)\n**Status:** ${window.active ? 'Active' : 'Inactive'}\n**Start:** <t:${Math.floor(window.start / 1000)}:F>\n**End:** <t:${Math.floor(window.end / 1000)}:F>\n**Required:** 5 hours per host`)
      .addFields({ name: 'Host progress', value: board }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
