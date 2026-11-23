import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const promoterRoles = () => (process.env.PROMOTER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);

export default {
  data: new SlashCommandBuilder()
    .setName('mypromotions')
    .setDescription('View your promotion logs and platform statistics'),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID)) {
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    }
    if (!memberHasFarmRole(interaction.member, promoterRoles())) {
      return interaction.reply({ content: 'Promoter role required.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.()) return interaction.editReply('PostgreSQL is unavailable. Please try again later.');
    const records = await readRecords(client, interaction.guildId, 'promoterLogs');
    const logs = records.filter(entry => entry?.promoterId === interaction.user.id);
    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle(`Promotion Statistics — ${interaction.user.username}`)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setTimestamp();
    if (!logs.length) {
      embed.setDescription('No promotions logged yet. Use /promoterlog to add your first promotion.');
      return interaction.editReply({ embeds: [embed] });
    }
    const totalViews = logs.reduce((sum, entry) => sum + (Number(entry.viewsToday) || 0), 0);
    const platformCounts = new Map();
    for (const entry of logs) {
      const platform = String(entry.platform || 'Other');
      platformCounts.set(platform, (platformCounts.get(platform) || 0) + 1);
    }
    const breakdown = [...platformCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([platform, count]) => `${platform}: ${count}`)
      .join('\n');
    embed.addFields(
      { name: 'Total promotion logs', value: logs.length.toLocaleString(), inline: true },
      { name: 'Combined views today', value: totalViews.toLocaleString(), inline: true },
      { name: 'Average views per log', value: Math.round(totalViews / logs.length).toLocaleString(), inline: true },
      { name: 'Platform breakdown', value: breakdown.slice(0, 1024) || 'None', inline: false }
    );
    return interaction.editReply({ embeds: [embed] });
  }
};
