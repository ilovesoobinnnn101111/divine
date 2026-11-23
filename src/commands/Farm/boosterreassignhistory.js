import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const clean = (value, max = 80) => String(value ?? 'Unknown').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1').slice(0, max);
const mention = id => /^\d{17,20}$/.test(String(id || '')) ? `<@${id}>` : 'Unknown';
const stamp = value => {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? `<t:${Math.floor(ms / 1000)}:f>` : 'Unknown';
};

export default {
  data: new SlashCommandBuilder().setName('boosterreassignhistory')
    .setDescription('Review an order’s booster reassignment timeline (Booster Manager only)')
    .addStringOption(option => option.setName('order_id').setDescription('Exact order ID (active or archived)').setRequired(true).setMaxLength(40)),
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
    if (!order) return interaction.editReply({ content: `Order \`${clean(id, 40)}\` was not found in active or archived records.` });
    const history = (Array.isArray(order.reassignment_history) ? order.reassignment_history : [])
      .filter(entry => entry && typeof entry === 'object')
      .sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
    const initialBooster = history.length ? history[0].from_booster_id : order.booster_id;
    const timeline = history.map((entry, index) =>
      `**${index + 1}.** ${mention(entry.from_booster_id)} → ${mention(entry.to_booster_id)}\n**When:** ${stamp(entry.timestamp)} · **Manager:** ${mention(entry.by)}`
    );
    const shown = timeline.slice(-12);
    const embed = new EmbedBuilder().setColor(0x9B59B6).setTitle('🔁 Booster Reassignment History')
      .setDescription(`**Order:** \`${clean(order.order_id, 40)}\`\n**Record:** ${active.includes(order) ? 'Active' : 'Archived'}\n**Original booster:** ${mention(initialBooster)}\n**Current / last assigned booster:** ${mention(order.booster_id)}\n**Status:** ${clean(order.status, 40)}\n**Created:** ${stamp(order.created_at)}\n**Total reassignments:** ${history.length}\n\n**Reassignment timeline${history.length > shown.length ? ' (latest 12)' : ''}:**\n${shown.join('\n\n') || 'No reassignments recorded for this order.'}`.slice(0, 4096))
      .setFooter({ text: 'Read-only history · Chronological order · Up to 12 most recent transfers displayed' }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
