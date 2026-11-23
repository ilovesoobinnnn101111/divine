import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.PROMOTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);

export default {
  data: new SlashCommandBuilder().setName('searchpromotions')
    .setDescription('View a promoter’s statistics (promoter managers only)')
    .addUserOption(option => option.setName('promoter').setDescription('Promoter to look up').setRequired(true)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID)) {
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    }
    if (!memberHasFarmRole(interaction.member, managerRoles())) {
      return interaction.reply({ content: 'Promoter manager role required.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.()) return interaction.editReply('PostgreSQL is unavailable. Please try again later.');
    const promoter = interaction.options.getUser('promoter', true);
    const allLogs = await readRecords(client, interaction.guildId, 'promoterLogs');
    const logs = allLogs.filter(entry => entry?.promoterId === promoter.id);
    const embed = new EmbedBuilder().setColor(0x9B59B6)
      .setTitle(`Promotion Statistics — ${promoter.username}`)
      .setThumbnail(promoter.displayAvatarURL()).setTimestamp();
    if (!logs.length) {
      embed.setDescription('No promotion logs found for this promoter.');
      return interaction.editReply({ embeds: [embed] });
    }
    const views = logs.reduce((sum, log) => sum + (Number(log.viewsToday) || 0), 0);
    const counts = new Map();
    for (const log of logs) {
      const platform = String(log.platform || 'Other');
      counts.set(platform, (counts.get(platform) || 0) + 1);
    }
    const breakdown = [...counts.entries()].sort((a,b) => b[1]-a[1])
      .map(([platform,count]) => `${platform}: ${count}`).join('\n');
    embed.addFields(
      { name: 'Total logs', value: logs.length.toLocaleString(), inline: true },
      { name: 'Combined views today', value: views.toLocaleString(), inline: true },
      { name: 'Average per log', value: Math.round(views/logs.length).toLocaleString(), inline: true },
      { name: 'Platform breakdown', value: breakdown.slice(0,1024) || 'None', inline: false }
    );
    const links = await readRecords(client, interaction.guildId, 'promoterLinks');
    const socials = links.filter(link => link?.promoterId === promoter.id && typeof link.url === 'string' && /^https?:\/\//i.test(link.url));
    if (socials.length) {
      embed.addFields({ name: 'Linked socials', value: socials.slice(0,10).map(link => `${String(link.platform || 'Social').slice(0,40)}: ${link.url}`).join('\n').slice(0,1024) });
    }
    return interaction.editReply({ embeds: [embed] });
  }
};
