import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);
const emoji = { Pending:'🟡', 'In Progress':'🔵', Completed:'✅', Cancelled:'❌', Failed:'⚠️' };
const priorityEmoji = { Low: '⚪', Normal: '🔵', High: '🟠', Urgent: '🔴' };
const colors = { Pending:0xF1C40F, 'In Progress':0x3498DB, Completed:0x2ECC71, Cancelled:0x95A5A6, Failed:0xE74C3C };
export default {
  data: new SlashCommandBuilder().setName('orderstatus').setDescription('Look up a booster order and its status history')
    .addStringOption(o => o.setName('order_id').setDescription('Order ID (ORD-...)').setRequired(true).setMaxLength(40)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.()) return interaction.reply({ content: 'PostgreSQL unavailable.', flags: MessageFlags.Ephemeral });
    const orderId = interaction.options.getString('order_id', true).trim();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const orders = await readRecords(client, interaction.guildId, 'boosterOrders');
    const a = orders.find(x => x.order_id === orderId);
    if (!a) return interaction.editReply(`Order \`${orderId}\` was not found.`);
    const manager = memberHasFarmRole(interaction.member, managerRoles());
    if (!manager && a.booster_id !== interaction.user.id)
      return interaction.editReply('Only the assigned booster or a Booster Manager can view this order.');
    const history = (Array.isArray(a.status_history) ? a.status_history : []).slice(-5)
      .map(h => `${emoji[h.status] || '⚪'} **${h.status}** — <t:${Math.floor(h.timestamp / 1000)}:R>`).join('\n');
    const embed = new EmbedBuilder().setColor(colors[a.status] || 0x95A5A6)
      .setTitle(`${emoji[a.status] || '📋'} Booster Order Status`)
      .setDescription(`**Order ID:** \`${a.order_id}\``)
      .addFields(
        { name: '👤 Booster', value: `<@${a.booster_id}>`, inline: true },
        { name: '📌 Status', value: a.status || 'Unknown', inline: true },
        { name: '🚩 Priority', value: `${priorityEmoji[a.priority] || '🔵'} ${['Low', 'Normal', 'High', 'Urgent'].includes(a.priority) ? a.priority : 'Normal'}`, inline: true },
        { name: '📁 Category', value: a.category || 'Unknown', inline: true },
        { name: '🦸 Hero', value: a.hero || 'Unknown', inline: true },
        { name: '📊 Level', value: a.level || 'Unknown', inline: true },
        { name: '📜 Recent History', value: history || 'No history recorded', inline: false }
      ).setTimestamp();
    const deadline = Number(a.deadline_at);
    if (Number.isFinite(deadline) && deadline > 0) embed.addFields({ name: '📅 Deadline (UTC)', value: `<t:${Math.floor(deadline / 1000)}:f> (<t:${Math.floor(deadline / 1000)}:R>)${['Pending', 'In Progress'].includes(a.status) && deadline <= Date.now() ? ' 🔴 OVERDUE' : ''}`, inline: false });
    if (a.created_at) embed.addFields({ name: '📅 Assigned', value: `<t:${Math.floor(a.created_at / 1000)}:f>`, inline: true });
    if (a.updated_at) embed.addFields({ name: '🕒 Last Updated', value: `<t:${Math.floor(a.updated_at / 1000)}:R>`, inline: true });
    if (a.notes) embed.addFields({ name: '📝 Notes', value: String(a.notes).slice(0, 1024), inline: false });
    if (manager && a.customer) embed.addFields({ name: '👥 Customer', value: String(a.customer).slice(0, 1024), inline: false });
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
