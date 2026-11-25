import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const roles = () => (process.env.PROMOTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);
const WEEK = 7 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const validId = id => /^\d{17,20}$/.test(String(id || ''));
const formatRows = (items, formatter) => {
  const rows = items.slice(0, 10).map(formatter);
  if (items.length > 10) rows.push(`...and ${items.length - 10} more`);
  return rows.join('\n').slice(0, 1024);
};

export default {
  data: new SlashCommandBuilder().setName('overdue')
    .setDescription('Report promoters with no recent promotion logs (managers only)'),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID)) {
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    }
    if (!memberHasFarmRole(interaction.member, roles())) {
      return interaction.reply({ content: 'Promoter manager role required.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply();
    if (!client.db?.isAvailable?.()) return interaction.editReply('PostgreSQL is unavailable. Please try again later.');
    const [logs, links] = await Promise.all([
      readRecords(client, interaction.guildId, 'promoterLogs'),
      readRecords(client, interaction.guildId, 'promoterLinks')
    ]);
    const now = Date.now();
    const known = new Set([...logs.map(x => x?.promoterId), ...links.map(x => x?.promoterId)].filter(validId));
    const byId = new Map();
    for (const log of logs) {
      if (!validId(log?.promoterId)) continue;
      const list = byId.get(log.promoterId) || [];
      list.push(log);
      byId.set(log.promoterId, list);
    }
    const overdue = [], notThisWeek = [], active = [], never = [];
    for (const id of known) {
      const entries = byId.get(id) || [];
      if (!entries.length) { never.push(id); continue; }
      const latest = Math.max(...entries.map(x => Number(x.date) || 0));
      const days = Math.floor((now - latest) / DAY);
      const weekCount = entries.filter(x => Number(x.date) > now - WEEK && Number(x.date) <= now).length;
      const row = { id, latest, days, count: entries.length, weekCount };
      if (days >= 7) overdue.push(row);
      else if (weekCount === 0) notThisWeek.push(row);
      else active.push(row);
    }
    overdue.sort((a, b) => b.days - a.days);
    const embed = new EmbedBuilder().setColor(overdue.length ? 0xFF0000 : 0x00AA55)
      .setTitle('📊 Promoter Activity Report')
      .setDescription(`**Total tracked:** ${known.size}\n**✅ Active this week:** ${active.length}\n**⚠️ Not posted this week:** ${notThisWeek.length}\n**🚨 Overdue (7+ days):** ${overdue.length}\n**❌ Never posted:** ${never.length}`)
      .setTimestamp();
    const format = p => `🔴 <@${p.id}> — Last: <t:${Math.floor(p.latest / 1000)}:R> (${p.days}d), Total: ${p.count}`;
    if (overdue.length) embed.addFields({ name: `🚨 Overdue — ${overdue.length}`, value: formatRows(overdue, format) });
    if (notThisWeek.length) embed.addFields({ name: `⚠️ Not posted this week — ${notThisWeek.length}`, value: formatRows(notThisWeek, p => `🟡 <@${p.id}> — ${p.count} logs`) });
    if (never.length) embed.addFields({ name: `❌ Never posted — ${never.length}`, value: formatRows(never, id => `<@${id}>`) });
    embed.setFooter({ text: 'Tracks promoters known from saved logs or linked socials' });
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
