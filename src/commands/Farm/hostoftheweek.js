import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';

const TZ = 'Africa/Cairo';
const localParts = timestamp => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  minute: '2-digit', hourCycle: 'h23'
}).formatToParts(timestamp).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
function cairoTime(year, month, day, hour = 8) {
  const wanted = Date.UTC(year, month - 1, day, hour);
  let value = wanted;
  for (let i = 0; i < 4; i++) {
    const p = localParts(value);
    value += wanted - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return value;
}
function completedWindow(now) {
  const p = localParts(now);
  const day = Date.UTC(p.year, p.month - 1, p.day);
  const weekday = new Date(day).getUTCDay();
  const daysSinceMonday = (weekday - 1 + 7) % 7;
  const monday = new Date(day - daysSinceMonday * 86400000);
  let end = cairoTime(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
  if (now < end) {
    const prev = new Date(day - (daysSinceMonday + 7) * 86400000);
    end = cairoTime(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate());
  }
  const friday = new Date(day - (daysSinceMonday + (now < cairoTime(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()) ? 7 : 0) + 3) * 86400000);
  const start = cairoTime(friday.getUTCFullYear(), friday.getUTCMonth() + 1, friday.getUTCDate());
  return { start, end };
}

export default {
  data: new SlashCommandBuilder().setName('hostoftheweek').setDescription('View or award last completed quota period winner')
    .addBooleanOption(o => o.setName('award').setDescription('Award the configured role (host managers only)')),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild()) return interaction.reply({ content: 'Server only.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { start, end } = completedWindow(Date.now());
    const logs = await readRecords(client, interaction.guildId, 'hostLogs');
    const totals = new Map();
    for (const log of logs) {
      const at = Number(log.timestamp ?? log.date);
      if (!Number.isFinite(at) || at < start || at >= end || !log.hostId) continue;
      totals.set(log.hostId, (totals.get(log.hostId) || 0) + (Number(log.minutes) || 0));
    }
    const eligible = [...totals.entries()].filter(([, minutes]) => minutes >= 300).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const winner = eligible[0];
    const award = interaction.options.getBoolean('award') ?? false;
    if (award && !memberHasFarmRole(interaction.member, farmConfig.roles.manager)) return interaction.editReply('Only host managers can award Host of the Week.');
    if (!winner) return interaction.editReply('No host reached the 5-hour quota in the last completed quota period.');
    const embed = new EmbedBuilder().setTitle('Host of the Week').setColor(0xFFD700)
      .setDescription(`Winner: <@${winner[0]}>\nLogged: **${(winner[1] / 60).toFixed(1)} hours**\nQuota period: <t:${Math.floor(start/1000)}:F> – <t:${Math.floor(end/1000)}:F>`);
    if (award) {
      const roleId = process.env.HOST_OF_THE_WEEK_ROLE_ID;
      if (!/^\d{17,20}$/.test(roleId || '')) return interaction.editReply('HOST_OF_THE_WEEK_ROLE_ID is not configured.');
      const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
      if (!role) return interaction.editReply('The Host of the Week role was not found in this server.');
      const me = await interaction.guild.members.fetchMe();
      if (!me.permissions.has('ManageRoles') || role.position >= me.roles.highest.position) return interaction.editReply('The bot needs Manage Roles and its highest role must be above Host of the Week.');
      const member = await interaction.guild.members.fetch(winner[0]).catch(() => null);
      if (!member) return interaction.editReply('The winning host is not in this server.');
      await member.roles.add(role, 'Host of the Week: last completed quota period');
      embed.addFields({ name: 'Award', value: 'Role assigned successfully.' });
    } else embed.addFields({ name: 'Preview', value: 'A host manager can run /hostoftheweek award:true to assign the role.' });
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
