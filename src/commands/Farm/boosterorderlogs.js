import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const clean = (value, max = 90) => String(value ?? 'Unknown').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1').slice(0, max);
const mention = id => /^\d{17,20}$/.test(String(id || '')) ? `<@${id}>` : 'Unknown';
const validTime = value => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; };
const stamp = value => validTime(value) ? `<t:${Math.floor(Number(value) / 1000)}:f>` : 'Unknown time';
const emoji = { Pending: '🟡', 'In Progress': '🔵', Completed: '✅', Cancelled: '❌', Failed: '⚠️' };

export default {
  data: new SlashCommandBuilder().setName('boosterorderlogs')
    .setDescription('Review all recorded activity for a booster order (Booster Manager only)')
    .addStringOption(option => option.setName('order_id').setDescription('Exact active or archived order ID').setRequired(true).setMaxLength(40)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const id = interaction.options.getString('order_id', true).trim();
    const [active, archived] = await Promise.all([
      readRecords(client, interaction.guildId, 'boosterOrders'),
      readRecords(client, interaction.guildId, 'boosterOrdersArchive')
    ]);
    const order = active.find(item => item.order_id === id) || archived.find(item => item.order_id === id);
    if (!order) return interaction.editReply({ content: `Order \`${clean(id, 40)}\` not found in active or archived records.` });
    const events = [];
    const push = (time, label) => events.push({ time: validTime(time), label });
    const transfers = Array.isArray(order.reassignment_history) ? order.reassignment_history.filter(x => x && typeof x === 'object') : [];
    const original = transfers.length ? [...transfers].sort((a, b) => validTime(a.timestamp) - validTime(b.timestamp))[0].from_booster_id : order.booster_id;
    push(order.created_at, `📋 **Order created** · Assigned to ${mention(original)} · By ${mention(order.assigned_by)}`);
    const history = Array.isArray(order.status_history) ? order.status_history : [];
    for (const item of history) {
      if (!item || typeof item !== 'object') continue;
      // The first Pending entry at creation is already represented by the creation event.
      if (item.status === 'Pending' && validTime(item.timestamp) === validTime(order.created_at)) continue;
      push(item.timestamp, `${emoji[item.status] || '📌'} **Status: ${clean(item.status, 35)}** · By ${mention(item.by)}${item.notes ? ` · Notes: ${clean(item.notes, 130)}` : ''}`);
    }
    for (const item of (Array.isArray(order.priority_history) ? order.priority_history : [])) {
      if (!item || typeof item !== 'object') continue;
      push(item.timestamp, `🚩 **Priority: ${clean(item.from || 'Normal', 20)} → ${clean(item.to, 20)}** · By ${mention(item.by)}${item.reason ? ` · Reason: ${clean(item.reason, 130)}` : ''}`);
    }
    for (const item of (Array.isArray(order.deadline_history) ? order.deadline_history : [])) {
      if (!item || typeof item !== 'object') continue;
      const from = validTime(item.from) ? stamp(item.from) : 'None';
      const to = validTime(item.to) ? stamp(item.to) : 'None';
      push(item.timestamp, `📅 **Deadline changed:** ${from} → ${to} · By ${mention(item.by)}${item.reason ? ` · Reason: ${clean(item.reason, 130)}` : ''}`);
    }
    for (const item of (Array.isArray(order.reminder_history) ? order.reminder_history : [])) {
      if (!item || typeof item !== 'object') continue;
      push(item.timestamp, `📩 **Reminder ${item.delivered ? 'delivered' : 'failed'}** · To ${mention(item.to_booster_id)} · By ${mention(item.by)}${item.message ? ` · Message: ${clean(item.message, 130)}` : ''}`);
    }
    for (const item of (Array.isArray(order.completion_history) ? order.completion_history : [])) {
      if (!item || typeof item !== 'object') continue;
      push(item.timestamp, `✅ **Completion approved** · By ${mention(item.by)}${item.notes ? ` · Notes: ${clean(item.notes, 130)}` : ''}`);
    }
    for (const item of (Array.isArray(order.reopening_history) ? order.reopening_history : [])) {
      if (!item || typeof item !== 'object') continue;
      push(item.timestamp, `🔄 **Order reopened** · By ${mention(item.by)} · Reason: ${clean(item.reason, 130)}`);
    }
    for (const item of (Array.isArray(order.cancellation_history) ? order.cancellation_history : [])) {
      if (!item || typeof item !== 'object') continue;
      push(item.timestamp, `❌ **Cancellation approved** · By ${mention(item.by)} · Reason: ${clean(item.reason, 130)}`);
    }
    for (const item of (Array.isArray(order.failure_history) ? order.failure_history : [])) {
      if (!item || typeof item !== 'object') continue;
      push(item.timestamp, `⚠️ **Failure approved** · By ${mention(item.by)} · Reason: ${clean(item.reason, 130)}`);
    }
    for (const item of transfers)
      push(item.timestamp, `🔁 **Reassigned** · ${mention(item.from_booster_id)} → ${mention(item.to_booster_id)} · By ${mention(item.by)}`);
    if (validTime(order.archived_at))
      push(order.archived_at, `📦 **Archived** · By ${mention(order.archived_by)}${order.archive_reason ? ` · Reason: ${clean(order.archive_reason, 100)}` : ''}`);
    const restorations = Array.isArray(order.restoration_history) ? order.restoration_history : [];
    for (const item of restorations) {
      if (!item || typeof item !== 'object') continue;
      if (validTime(item.archived_at)) push(item.archived_at, `📦 **Archived** · By ${mention(item.archived_by)}`);
      push(item.restored_at, `♻️ **Restored** · By ${mention(item.restored_by)}`);
    }
    // Deduplicate archive events copied into restoration history and current archive metadata.
    const unique = [...new Map(events.map(item => [`${item.time}:${item.label}`, item])).values()];
    unique.sort((a, b) => a.time - b.time);
    const lines = unique.map((event, index) => `**${index + 1}.** ${stamp(event.time)}\n${event.label}`);
    const visible = [];
    let size = 0;
    for (let i = lines.length - 1; i >= 0 && visible.length < 15; i--) {
      if (size + lines[i].length + 2 > 3000) break;
      visible.unshift(lines[i]);
      size += lines[i].length + 2;
    }
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📜 Booster Order Activity Log')
      .setDescription(`**Order:** \`${clean(order.order_id, 40)}\`\n**Record:** ${active.includes(order) ? 'Active' : 'Archived'}\n**Current / last booster:** ${mention(order.booster_id)}\n**Status:** ${clean(order.status, 35)}\n**Priority:** ${clean(order.priority || 'Normal', 20)}\n**Deadline:** ${validTime(order.deadline_at) ? stamp(order.deadline_at) : 'None'}\n**Total recorded events:** ${unique.length}\n\n**Timeline${visible.length < lines.length ? ` (latest ${visible.length} events)` : ''}:**\n${visible.join('\n\n') || 'No dated events found.'}`.slice(0, 4096))
      .setFooter({ text: 'Read-only · Chronological · Based on recorded data only' }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
