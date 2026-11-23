import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const safe = (value, max = 50) => String(value ?? 'Unknown').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1').slice(0, max);
const mention = id => /^\d{17,20}$/.test(String(id || '')) ? `<@${id}>` : 'Unknown';
const icons = { Assigned: '📋', Completed: '✅', Cancelled: '❌', Failed: '⚠️', 'In Progress': '🔵', Pending: '🟡', Archived: '📦', Restored: '♻️' };

export default {
  data: new SlashCommandBuilder().setName('boosteractivity')
    .setDescription('Review recent booster order activity (Booster Manager only)'),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL is unavailable.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [active, archived] = await Promise.all([
      readRecords(client, interaction.guildId, 'boosterOrders'),
      readRecords(client, interaction.guildId, 'boosterOrdersArchive')
    ]);
    const events = [];
    const add = (order, type, timestamp, actor) => {
      const ms = Number(timestamp);
      if (!Number.isFinite(ms) || ms <= 0) return;
      events.push({ orderId: order.order_id, type, ms, actor, booster: order.booster_id });
    };
    for (const order of [...active, ...archived]) {
      add(order, 'Assigned', order.created_at, order.assigned_by);
      const history = Array.isArray(order.status_history) ? order.status_history : [];
      for (const [index, item] of history.entries()) {
        // The initial Pending history entry is the assignment event, not a second update.
        if (index === 0 && item.status === 'Pending' && Number(item.timestamp) === Number(order.created_at)) continue;
        add(order, item.status || 'Status updated', item.timestamp, item.by);
      }
      if (order.archived_at) add(order, 'Archived', order.archived_at, order.archived_by);
      for (const restoration of Array.isArray(order.restoration_history) ? order.restoration_history : []) {
        if (restoration.archived_at) add(order, 'Archived', restoration.archived_at, restoration.archived_by);
        add(order, 'Restored', restoration.restored_at, restoration.restored_by);
      }
    }
    events.sort((a, b) => b.ms - a.ms);
    if (!events.length) return interaction.editReply('📜 No booster order activity has been recorded yet.');
    const lines = events.slice(0, 12).map(event => {
      const type = safe(event.type, 35);
      return `${icons[event.type] || '📝'} **${type}** · \`${safe(event.orderId, 40)}\`\n<t:${Math.floor(event.ms / 1000)}:f> · By ${mention(event.actor)} · Booster ${mention(event.booster)}`;
    });
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📜 Booster Activity Log')
      .setDescription(`**Recorded events:** ${events.length}\n**Active orders:** ${active.length} · **Archived orders:** ${archived.length}\n\n${lines.join('\n\n')}`.slice(0, 4096))
      .setFooter({ text: 'Most recent 12 events · Derived from saved order histories' }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
