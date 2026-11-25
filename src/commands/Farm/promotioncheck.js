import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.PROMOTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default {
  data: new SlashCommandBuilder().setName('promotioncheck')
    .setDescription('View promoter activity over the past seven days (managers only)'),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID)) {
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    }
    if (!memberHasFarmRole(interaction.member, managerRoles())) {
      return interaction.reply({ content: 'Promoter manager role required.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply();
    if (!client.db?.isAvailable?.()) return interaction.editReply('PostgreSQL is unavailable. Please try again later.');
    const logs = await readRecords(client, interaction.guildId, 'promoterLogs');
    const cutoff = Date.now() - WEEK_MS;
    const byPromoter = new Map();
    for (const log of logs) {
      if (!log?.promoterId || !Number.isFinite(Number(log.date)) || Number(log.date) <= cutoff) continue;
      const current = byPromoter.get(log.promoterId) || { logs: 0, views: 0 };
      current.logs += 1;
      current.views += Number(log.viewsToday) || 0;
      byPromoter.set(log.promoterId, current);
    }
    const stats = [...byPromoter.entries()].sort((a, b) => b[1].views - a[1].views);
    const embed = new EmbedBuilder().setColor(0x9B59B6)
      .setTitle('📊 Weekly Promoter Activity').setTimestamp();
    if (!stats.length) {
      embed.setDescription('No activity this week.');
    } else {
      const description = stats.slice(0, 15).map(([id, data], i) => {
        const rank = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        return `${rank} <@${id}>\n   📊 ${data.logs} logs • 👁️ ${data.views.toLocaleString()} views`;
      }).join('\n');
      embed.setDescription(description).setFooter({ text: `Active: ${stats.length}` });
    }
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
