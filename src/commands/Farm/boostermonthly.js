import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const validTime = value => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; };
const mention = id => /^\d{17,20}$/.test(String(id || '')) ? `<@${id}>` : 'Unknown';
const monthStartUTC = now => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const nextMonthUTC = start => { const d = new Date(start); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };
const previousMonthUTC = start => { const d = new Date(start); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1); };
const inRange = (time, start, end) => time >= start && time < end;
const pct = (n, total) => total ? `${(n / total * 100).toFixed(1)}%` : 'N/A';

function summarize(orders, start, end) {
  const assigned = orders.filter(order => inRange(validTime(order.created_at), start, end));
  const events = [];
  for (const order of orders) {
    const history = Array.isArray(order.status_history) ? order.status_history : [];
    for (const entry of history) {
      const time = validTime(entry.timestamp);
      if (inRange(time, start, end) && ['Completed', 'Cancelled', 'Failed'].includes(entry.status))
        events.push({ status: entry.status, booster: order.booster_id, orderId: order.order_id });
    }
  }
  // Count unique orders per outcome to avoid double-counting repeated identical updates.
  const unique = status => new Set(events.filter(event => event.status === status).map(event => event.orderId)).size;
  const completed = unique('Completed');
  const cancelled = unique('Cancelled');
  const failed = unique('Failed');
  const boosterStats = new Map();
  for (const order of assigned) {
    if (!order.booster_id) continue;
    const current = boosterStats.get(order.booster_id) || { assigned: 0, completed: 0 };
    current.assigned++;
    boosterStats.set(order.booster_id, current);
  }
  const completedOrders = new Set(events.filter(event => event.status === 'Completed').map(event => event.orderId));
  for (const order of orders) {
    if (!order.booster_id || !completedOrders.has(order.order_id)) continue;
    const current = boosterStats.get(order.booster_id) || { assigned: 0, completed: 0 };
    current.completed++;
    boosterStats.set(order.booster_id, current);
  }
  const top = [...boosterStats.entries()].sort((a, b) => b[1].completed - a[1].completed || b[1].assigned - a[1].assigned || a[0].localeCompare(b[0])).slice(0, 5);
  return {
    assigned: assigned.length, completed, cancelled, failed,
    pending: assigned.filter(order => order.status === 'Pending').length,
    inProgress: assigned.filter(order => order.status === 'In Progress').length,
    top
  };
}

export default {
  data: new SlashCommandBuilder().setName('boostermonthly')
    .setDescription('Review monthly booster team performance (Booster Manager only)'),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [active, archived] = await Promise.all([
      readRecords(client, interaction.guildId, 'boosterOrders'),
      readRecords(client, interaction.guildId, 'boosterOrdersArchive')
    ]);
    // De-duplicate order IDs if a partially completed archive/restore left both copies.
    const orders = [...new Map([...archived, ...active].filter(o => o?.order_id).map(o => [o.order_id, o])).values()];
    const now = Date.now();
    const start = monthStartUTC(now);
    const previous = previousMonthUTC(start);
    const next = nextMonthUTC(start);
    const currentStats = summarize(orders, start, now + 1);
    const previousStats = summarize(orders, previous, start);
    const diff = (a, b) => `${a - b >= 0 ? '+' : ''}${a - b}`;
    const topText = currentStats.top.map(([id, s], i) =>
      `${i + 1}. ${mention(id)} — **${s.completed} completed** · ${s.assigned} assigned`
    ).join('\n') || 'No booster assignments or completions recorded this month.';
    const embed = new EmbedBuilder().setColor(0x8E44AD).setTitle('📅 Monthly Booster Team Report')
      .setDescription(`**This month:** <t:${Math.floor(start / 1000)}:D> – <t:${Math.floor((next - 1) / 1000)}:D> (UTC)\n**Previous month:** <t:${Math.floor(previous / 1000)}:D> – <t:${Math.floor((start - 1) / 1000)}:D> (UTC)`)
      .addFields(
        { name: '📋 Assigned This Month', value: String(currentStats.assigned), inline: true },
        { name: '✅ Completed This Month', value: String(currentStats.completed), inline: true },
        { name: '📈 Completion-to-Assignment Ratio', value: pct(currentStats.completed, currentStats.assigned), inline: true },
        { name: '🟡 Still Pending', value: String(currentStats.pending), inline: true },
        { name: '🔵 Still In Progress', value: String(currentStats.inProgress), inline: true },
        { name: '❌ Cancelled This Month', value: String(currentStats.cancelled), inline: true },
        { name: '⚠️ Failed This Month', value: String(currentStats.failed), inline: true },
        { name: '📊 Previous Month Comparison', value: `Assignments: **${diff(currentStats.assigned, previousStats.assigned)}** (previous: ${previousStats.assigned})\nCompletions: **${diff(currentStats.completed, previousStats.completed)}** (previous: ${previousStats.completed})\nPrevious completion-to-assignment ratio: **${pct(previousStats.completed, previousStats.assigned)}**`, inline: false },
        { name: '🏆 Top Boosters This Month', value: topText.slice(0, 1024), inline: false }
      ).setFooter({ text: 'Assignments use creation dates; completions/cancellations/failures use status history. Pending/in-progress are current statuses of this month’s assignments. Completion-to-assignment ratio can exceed 100%.' }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
