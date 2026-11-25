import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const clean = (value, max = 500) => String(value ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1').replace(/<@/g, '<\\@').slice(0, max);
const mention = id => /^\d{17,20}$/.test(String(id || '')) ? `<@${id}>` : 'Unknown';
const stamp = value => { const n = Number(value); return Number.isFinite(n) && n > 0 ? `<t:${Math.floor(n / 1000)}:f>` : 'Unknown'; };

export default {
  data: new SlashCommandBuilder().setName('boosterordernotes')
    .setDescription('Add or review internal notes on an active booster order (Booster Manager only)')
    .addStringOption(option => option.setName('order_id').setAutocomplete(true).setDescription('Exact active order ID').setRequired(true).setMaxLength(40))
    .addStringOption(option => option.setName('note').setDescription('New internal note (leave blank to view history)').setRequired(false).setMaxLength(500)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable.', flags: MessageFlags.Ephemeral });
    const id = interaction.options.getString('order_id', true).trim();
    const note = interaction.options.getString('note')?.trim() || '';
    if (interaction.options.getString('note') !== null && !note)
      return interaction.reply({ content: 'The note cannot be empty.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let order = null;
    if (note) {
      await withRecordLock(client, interaction.guildId, 'boosterOrders', async () => {
        const orders = await readRecords(client, interaction.guildId, 'boosterOrders');
        const index = orders.findIndex(item => item.order_id === id);
        if (index < 0) return;
        const now = Date.now();
        const current = orders[index];
        const history = Array.isArray(current.internal_notes_history) ? current.internal_notes_history : [];
        order = { ...current, internal_notes_history: [...history, { note, by: interaction.user.id, timestamp: now }], updated_at: now };
        orders[index] = order;
        await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:boosterOrders`, orders);
      });
    } else {
      order = (await readRecords(client, interaction.guildId, 'boosterOrders')).find(item => item.order_id === id);
    }
    if (!order) return interaction.editReply({ content: `Active order \`${clean(id, 40)}\` not found.` });
    const history = Array.isArray(order.internal_notes_history) ? order.internal_notes_history : [];
    const entries = history.map((entry, index) =>
      `**${index + 1}.** ${stamp(entry.timestamp)} · By ${mention(entry.by)}\n${clean(entry.note)}`);
    const visible = [];
    let size = 0;
    for (let i = entries.length - 1; i >= 0 && visible.length < 10; i--) {
      if (size + entries[i].length + 2 > 3000) break;
      visible.unshift(entries[i]);
      size += entries[i].length + 2;
    }
    const embed = new EmbedBuilder().setColor(note ? 0x2ECC71 : 0x5865F2)
      .setTitle(note ? '📝 Internal Order Note Saved' : '📝 Internal Order Notes')
      .setDescription(`**Order:** \`${clean(order.order_id, 40)}\`\n**Booster:** ${mention(order.booster_id)}\n**Status:** ${clean(order.status, 40)}\n**Total internal notes:** ${history.length}\n\n**Note history${visible.length < entries.length ? ` (latest ${visible.length})` : ''}:**\n${visible.join('\n\n') || 'No internal notes recorded yet.'}`.slice(0, 4096))
      .setFooter({ text: 'Private manager-only view · Internal notes are separate from order status history' }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
