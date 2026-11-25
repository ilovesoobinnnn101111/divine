import {earningsText,money} from '../../services/farm/boosterEarnings.js';
import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';

const statusEmoji = { Pending: '🟡', 'In Progress': '🔵', Completed: '✅', Cancelled: '❌', Failed: '⚠️' };
const priorityEmoji = { Low: '⚪', Normal: '🔵', High: '🟠', Urgent: '🔴' };
const activeStatuses = new Set(['Pending', 'In Progress']);

export default {
  data: new SlashCommandBuilder().setName('myorders').setDescription('View your assigned booster orders'),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL is unavailable. Cannot load orders.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const orders = (await readRecords(client, interaction.guildId, 'boosterOrders'))
      .filter(order => order.booster_id === interaction.user.id)
      .sort((a, b) => (b.updated_at || b.created_at || 0) - (a.updated_at || a.created_at || 0));
    if (!orders.length) return interaction.editReply('📋 You have no assigned booster orders yet.');
    const active = orders.filter(o => activeStatuses.has(o.status));
    const completed = orders.filter(o => o.status === 'Completed');
    const other = orders.filter(o => !activeStatuses.has(o.status) && o.status !== 'Completed');
    const format = order => {
      const id = String(order.order_id || 'Unknown').slice(0, 60);
      const hero = String(order.hero || 'Unknown').slice(0, 60);
      const level = String(order.level || 'Unknown').slice(0, 60);
      const status = order.status || 'Unknown';
      const priority = ['Low', 'Normal', 'High', 'Urgent'].includes(order.priority) ? order.priority : 'Normal';
      const deadline = Number(order.deadline_at);
      const deadlineText = Number.isFinite(deadline) && deadline > 0 ? ` · 📅 <t:${Math.floor(deadline / 1000)}:R>${activeStatuses.has(status) && deadline <= Date.now() ? ' 🔴 OVERDUE' : ''}` : '';
      return `${statusEmoji[status] || '⚪'} \`${id}\` — **${hero}** (${level}) · ${status} · ${priorityEmoji[priority]} ${priority}${deadlineText} · Earnings: ${earningsText(order)}`;
    };
    const embed = new EmbedBuilder().setColor(0x3498DB).setTitle('📋 My Booster Orders')
      .setDescription(`**Total:** ${orders.length}  |  **Active:** ${active.length}  |  **Completed:** ${completed.length}  |  **Other:** ${other.length}\n\nUse \`/orderstatus\` with an order ID for full details.`)
      .addFields(
        { name: '🔵 Active Orders', value: active.length ? active.slice(0, 8).map(format).join('\n').slice(0, 1024) : 'No active orders.', inline: false },
        { name: '✅ Completed Orders', value: completed.length ? completed.slice(0, 5).map(format).join('\n').slice(0, 1024) : 'No completed orders.', inline: false },
        { name: '📦 Cancelled / Failed / Other', value: other.length ? other.slice(0, 5).map(format).join('\n').slice(0, 1024) : 'None.', inline: false }
      ).setFooter({ text: 'Showing the most recently updated orders in each category' }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
