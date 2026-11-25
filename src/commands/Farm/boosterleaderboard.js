import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);

export default {
  data: new SlashCommandBuilder().setName('boosterleaderboard')
    .setDescription('Rank boosters by completed orders (Booster Manager only)'),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL is unavailable.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const orders = await readRecords(client, interaction.guildId, 'boosterOrders');
    const byBooster = new Map();
    for (const order of orders) {
      if (!order.booster_id) continue;
      const row = byBooster.get(order.booster_id) || { assigned: 0, completed: 0, active: 0 };
      row.assigned += 1;
      if (order.status === 'Completed') row.completed += 1;
      if (order.status === 'Pending' || order.status === 'In Progress') row.active += 1;
      byBooster.set(order.booster_id, row);
    }
    const ranked = [...byBooster.entries()]
      .sort((a, b) => b[1].completed - a[1].completed || b[1].assigned - a[1].assigned || a[0].localeCompare(b[0]));
    if (!ranked.length) return interaction.editReply('🏆 No booster orders have been assigned yet.');
    const lines = ranked.slice(0, 10).map(([id, data], index) => {
      const medal = ['🥇', '🥈', '🥉'][index] || `**${index + 1}.**`;
      const rate = Math.round(data.completed / data.assigned * 100);
      return `${medal} <@${id}>\n**${data.completed} completed** · ${data.assigned} assigned · ${rate}% completion · ${data.active} active`;
    });
    const embed = new EmbedBuilder().setColor(0xF1C40F).setTitle('🏆 Booster Leaderboard')
      .setDescription(lines.join('\n\n').slice(0, 4096))
      .addFields(
        { name: '📋 Total Orders', value: String(orders.length), inline: true },
        { name: '👥 Boosters Ranked', value: String(ranked.length), inline: true },
        { name: '✅ Completed Orders', value: String(orders.filter(o => o.status === 'Completed').length), inline: true }
      ).setFooter({ text: 'All-time results · Ranked by completed orders · Top 10' }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
