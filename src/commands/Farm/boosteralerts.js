import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const safe = (value, max = 50) => String(value ?? 'Unknown').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1').slice(0, max);
const mention = id => /^\d{17,20}$/.test(String(id || '')) ? `<@${id}>` : 'Unknown';
const DAY = 86400000;
const threshold = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const age = (now, time) => {
  const n = Number(time);
  return Number.isFinite(n) && n > 0 && n <= now ? (now - n) / DAY : null;
};

export default {
  data: new SlashCommandBuilder().setName('boosteralerts')
    .setDescription('Review stalled and aging booster orders (Booster Manager only)'),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const orders = await readRecords(client, interaction.guildId, 'boosterOrders');
    const unfinished = orders.filter(order => order.status === 'Pending' || order.status === 'In Progress');
    const now = Date.now();
    const pendingDays = threshold('BOOSTER_PENDING_ALERT_DAYS', 2);
    const progressDays = threshold('BOOSTER_PROGRESS_ALERT_DAYS', 3);
    const overdueDays = threshold('BOOSTER_OVERDUE_ALERT_DAYS', 7);
    const multipleCount = Math.max(2, Math.ceil(threshold('BOOSTER_MULTIPLE_OPEN_ALERT_COUNT', 3)));
    const perBooster = new Map();
    for (const order of unfinished) {
      if (order.booster_id) perBooster.set(order.booster_id, (perBooster.get(order.booster_id) || 0) + 1);
    }
    const alerts = [];
    for (const order of unfinished) {
      const created = age(now, order.created_at);
      const updates = [
        Number(order.created_at),
        Number(order.updated_at),
        ...(Array.isArray(order.status_history) ? order.status_history.map(entry => Number(entry.timestamp)) : [])
      ].filter(n => Number.isFinite(n) && n > 0 && n <= now);
      const last = updates.length ? Math.max(...updates) : 0;
      const idle = age(now, last);
      const flags = [];
      if (created !== null && created >= overdueDays) flags.push(`Aging order (${created.toFixed(1)}d)`);
      if (order.status === 'Pending' && idle !== null && idle >= pendingDays) flags.push(`Pending ${idle.toFixed(1)}d`);
      if (order.status === 'In Progress' && idle !== null && idle >= progressDays) flags.push(`No update ${idle.toFixed(1)}d`);
      const open = perBooster.get(order.booster_id) || 0;
      if (open >= multipleCount) flags.push(`${open} unfinished assignments`);
      if (!flags.length) continue;
      const priority = created !== null && created >= overdueDays * 2 ? 3
        : created !== null && created >= overdueDays ? 2
        : idle !== null && idle >= (order.status === 'Pending' ? pendingDays : progressDays) * 2 ? 2 : 1;
      alerts.push({ order, priority, idle, created, flags });
    }
    alerts.sort((a, b) => b.priority - a.priority || (b.idle ?? -1) - (a.idle ?? -1));
    const high = alerts.filter(a => a.priority === 3).length;
    const medium = alerts.filter(a => a.priority === 2).length;
    const low = alerts.filter(a => a.priority === 1).length;
    const lines = alerts.slice(0, 10).map(item => {
      const level = item.priority === 3 ? '🔴 URGENT' : item.priority === 2 ? '🟠 HIGH' : '🟡 REVIEW';
      return `${level} · \`${safe(item.order.order_id, 40)}\` · ${mention(item.order.booster_id)}\n**${safe(item.order.status, 20)}** · Last activity: ${item.idle === null ? 'Unknown' : `${item.idle.toFixed(1)}d ago`}\n${item.flags.map(f => safe(f, 55)).join(' · ')}`;
    });
    const embed = new EmbedBuilder().setColor(alerts.length ? 0xE67E22 : 0x2ECC71).setTitle('🚨 Booster Order Alerts')
      .setDescription(`**Unfinished orders:** ${unfinished.length} · **Flagged:** ${alerts.length}\n🔴 Urgent: ${high} · 🟠 High: ${medium} · 🟡 Review: ${low}\n\n${lines.join('\n\n') || '✅ No orders currently meet the alert thresholds.'}`.slice(0, 4096))
      .addFields({ name: 'Alert thresholds', value: `Pending without update: **${pendingDays}d** · In Progress without update: **${progressDays}d**\nAging order: **${overdueDays}d** · Multiple unfinished assignments: **${multipleCount}**` })
      .setFooter({ text: 'Shows up to 10 alerts · Aging is not a customer deadline · Thresholds configurable via Railway environment variables' }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
