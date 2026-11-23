import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);
const statusEmoji = { Pending: '🟡', 'In Progress': '🔵', Completed: '✅', Cancelled: '❌', Failed: '⚠️' };

export default {
  data: new SlashCommandBuilder().setName('boosterhistory')
    .setDescription('Review an individual booster\'s order history (Booster Manager only)')
    .addUserOption(o => o.setName('booster').setDescription('Booster to review').setRequired(true)),
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
      .filter(order => order.booster_id === booster.id)
      .sort((a, b) => (b.updated_at || b.created_at || 0) - (a.updated_at || a.created_at || 0));
    if (!orders.length) return interaction.editReply(`📋 <@${booster.id}> has no assigned orders yet.`);
    const count = status => orders.filter(order => order.status === status).length;
    const active = count('Pending') + count('In Progress');
    const completed = count('Completed');
    const cancelled = count('Cancelled');
    const failed = count('Failed');
    const recent = orders.slice(0, 8).map(order => {
      const status = order.status || 'Unknown';
      const timestamp = order.updated_at || order.created_at;
      const date = timestamp ? ` · <t:${Math.floor(timestamp / 1000)}:R>` : '';
      return `${statusEmoji[status] || '⚪'} \`${String(order.order_id || 'Unknown').slice(0, 50)}\` — **${String(order.hero || 'Unknown').slice(0, 60)}** (${String(order.level || 'Unknown').slice(0, 50)}) · ${status}${date}`;
    }).join('\n');
    const latest = orders.slice(0, 4).flatMap(order => (Array.isArray(order.status_history) ? order.status_history : [])
      .map(h => ({ orderId: order.order_id, ...h })))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 6)
      .map(h => `\`${String(h.orderId).slice(0, 50)}\` — ${statusEmoji[h.status] || '⚪'} ${h.status}${h.timestamp ? ` <t:${Math.floor(h.timestamp / 1000)}:R>` : ''}`);
    const embed = new EmbedBuilder().setColor(0x3498DB).setTitle('📜 Booster Order History')
      .setDescription(`**Booster:** <@${booster.id}>\n**Total Assignments:** ${orders.length}\n**Active:** ${active} · **Completed:** ${completed} · **Cancelled:** ${cancelled} · **Failed:** ${failed}`)
      .addFields(
        { name: '📋 Recent Orders', value: recent.slice(0, 1024) || 'None', inline: false },
        { name: '🕒 Recent Status Changes', value: latest.join('\n').slice(0, 1024) || 'No changes recorded.', inline: false }
      ).setFooter({ text: 'Shows up to 8 recent orders and recent status history' }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
