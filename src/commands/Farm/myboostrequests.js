import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';

const clean = (value, max = 100) => String(value ?? 'Unknown')
  .replace(/[\x00-\x1F\x7F]/g, ' ')
  .replace(/([*_~`|])/g, '\\$1')
  .replace(/<@/g, '<\\@')
  .slice(0, max);
const validId = value => /^\d{17,20}$/.test(String(value || ''));
const time = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `<t:${Math.floor(n / 1000)}:R>` : 'Unknown';
};
const statuses = { Pending: '🟡', Accepted: '✅', Declined: '❌', Withdrawn: '🚫', 'In Progress': '🔵', Completed: '🏁', Cancelled: '🚫', Failed: '⚠️' };

export default {
  data: new SlashCommandBuilder().setName('myboostrequests')
    .setDescription('Privately view your submitted Lord Boost and Rank Boost requests')
    .addStringOption(o => o.setName('request_id').setDescription('Optional exact request ID to view').setRequired(false).setMaxLength(40)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable. Cannot load requests.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const requestedId = interaction.options.getString('request_id')?.trim();
      const [requests, activeOrders, archivedOrders] = await Promise.all([
        readRecords(client, interaction.guildId, 'boostRequests'),
        readRecords(client, interaction.guildId, 'boosterOrders'),
        readRecords(client, interaction.guildId, 'boosterOrdersArchive')
      ]);
      const mine = requests.filter(r => r.customer_id === interaction.user.id)
        .filter(r => !requestedId || r.request_id === requestedId)
        .sort((a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0));
      if (!mine.length) return interaction.editReply({ content: requestedId
        ? 'No request with that ID belongs to your account.'
        : '📋 You have not submitted any boost requests yet. Use the Lord Boost or Rank Boost calculator to get started.' });
      const format = req => {
        const linked = [...activeOrders, ...archivedOrders].find(o =>
          o.request_id === req.request_id && (o.customer_id === interaction.user.id || o.customer === interaction.user.id));
        const price = req.total === null || req.total === undefined || !Number.isFinite(Number(req.total))
          ? 'Negotiable / custom quote' : `$${Number(req.total).toFixed(2)}`;
        const status = String(req.status || 'Pending');
        const lines = [
          `**${statuses[status] || '📋'} \`${clean(req.request_id, 40)}\` · ${clean(req.type, 35)}**`,
          `**Request:** ${clean(status, 25)} · **Estimate:** ${price} · **Submitted:** ${time(req.created_at)}`,
          `**Selection:** ${clean(req.summary, 240)}`
        ];
        if (status === 'Accepted' || status === 'Cancelled') {
          if (linked) {
            lines.push(`**Order:** \`${clean(linked.order_id, 40)}\` · **Progress:** ${statuses[linked.status] || '📋'} ${clean(linked.status, 25)}`);
            if (validId(linked.booster_id)) lines.push(`**Assigned booster:** <@${linked.booster_id}>`);
          } else {
            lines.push('**Order:** Awaiting assignment finalization');
          }
          if (req.cancellation_request) lines.push(`**Cancellation request:** ${clean(req.cancellation_request.status, 25)}`);
        } else if (status === 'Withdrawn') {
          lines.push('**Request withdrawn by customer**');
        } else if (status === 'Declined') {
          if (req.decline_reason) lines.push(`**Decline reason:** ${clean(req.decline_reason, 180)}`);
        }
        return lines.join('\n');
      };
      const visible = [];
      let used = 0;
      for (const req of mine) {
        const item = format(req);
        if (visible.length >= 8 || used + item.length + 2 > 3500) break;
        visible.push(item); used += item.length + 2;
      }
      const pending = mine.filter(r => r.status === 'Pending').length;
      const accepted = mine.filter(r => r.status === 'Accepted').length;
      const declined = mine.filter(r => r.status === 'Declined').length;
      const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📋 My Boost Requests')
        .setDescription(`**Requests found:** ${mine.length} · 🟡 Pending: ${pending} · ✅ Accepted: ${accepted} · ❌ Declined: ${declined}\n\n${visible.join('\n\n')}`)
        .setFooter({ text: visible.length < mine.length ? `Showing ${visible.length} newest · Use /myboostrequests request_id to view an older request` : 'Only you can see this response · Estimates are not payments' })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch {
      return interaction.editReply({ content: 'Could not load your boost requests. Please try again.' });
    }
  }
};
