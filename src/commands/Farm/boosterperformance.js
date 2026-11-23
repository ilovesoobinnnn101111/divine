import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const duration = ms => {
  const hours = ms / 3600000;
  return hours < 24 ? `${hours.toFixed(1)} hours` : `${(hours / 24).toFixed(1)} days`;
};

export default {
  data: new SlashCommandBuilder().setName('boosterperformance')
    .setDescription('View booster performance statistics (Booster Manager only)')
    .addUserOption(option => option.setName('booster').setDescription('Booster to review').setRequired(true)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL is unavailable.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const booster = interaction.options.getUser('booster', true);
    const orders = (await readRecords(client, interaction.guildId, 'boosterOrders'))
      .filter(order => order.booster_id === booster.id);
    if (!orders.length) return interaction.editReply(`📊 <@${booster.id}> has no assigned orders yet.`);
    const count = status => orders.filter(order => order.status === status).length;
    const completed = count('Completed');
    const pending = count('Pending');
    const inProgress = count('In Progress');
    const cancelled = count('Cancelled');
    const failed = count('Failed');
    const rate = (completed / orders.length * 100).toFixed(1);
    const durations = orders.filter(order => order.status === 'Completed').map(order => {
      const created = Number(order.created_at);
      const completionTimes = (Array.isArray(order.status_history) ? order.status_history : [])
        .filter(event => event.status === 'Completed' && Number.isFinite(Number(event.timestamp)))
        .map(event => Number(event.timestamp)).filter(time => time >= created).sort((a, b) => a - b);
      if (!Number.isFinite(created) || created <= 0 || !completionTimes.length) return null;
      return completionTimes[0] - created;
    }).filter(ms => ms !== null);
    const average = durations.length ? duration(durations.reduce((sum, ms) => sum + ms, 0) / durations.length) : 'Not available';
    const embed = new EmbedBuilder().setColor(0x9B59B6).setTitle('📊 Booster Performance Report')
      .setDescription(`**Booster:** <@${booster.id}>\nStatistics are based on recorded order statuses.`)
      .addFields(
        { name: '📋 Total Assigned', value: String(orders.length), inline: true },
        { name: '✅ Completed', value: String(completed), inline: true },
        { name: '📈 Completion Rate', value: `${rate}%`, inline: true },
        { name: '🟡 Pending', value: String(pending), inline: true },
        { name: '🔵 In Progress', value: String(inProgress), inline: true },
        { name: '❌ Cancelled', value: String(cancelled), inline: true },
        { name: '⚠️ Failed', value: String(failed), inline: true },
        { name: '⏱️ Average Completion Time', value: average, inline: false }
      )
      .setFooter({ text: `Average uses ${durations.length} completed order(s) with recorded completion timestamps` })
      .setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
