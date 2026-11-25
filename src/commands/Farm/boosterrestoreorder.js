import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);

export default {
  data: new SlashCommandBuilder().setName('boosterrestoreorder')
    .setDescription('Restore an archived booster order (Booster Manager only)')
    .addStringOption(o => o.setName('order_id').setAutocomplete(true).setDescription('Exact archived order ID').setRequired(true).setMaxLength(40)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable; nothing restored.', flags: MessageFlags.Ephemeral });
    const id = interaction.options.getString('order_id', true).trim();
    const archive = await readRecords(client, interaction.guildId, 'boosterOrdersArchive');
    const order = archive.find(o => o.order_id === id);
    if (!order) return interaction.reply({ content: `Archived order \`${id}\` was not found.`, flags: MessageFlags.Ephemeral });
    const active = await readRecords(client, interaction.guildId, 'boosterOrders');
    if (active.some(o => o.order_id === id))
      return interaction.reply({ content: `Order \`${id}\` already exists among active records. Nothing restored.`, flags: MessageFlags.Ephemeral });
    const requestId = interaction.id;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`boosterrestore:confirm:${interaction.user.id}:${requestId}`).setLabel('Confirm Restore').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`boosterrestore:cancel:${interaction.user.id}:${requestId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );
    await client.db.set(`booster:restore:pending:${interaction.guildId}:${requestId}`, {
      orderId: id, userId: interaction.user.id, createdAt: Date.now()
    });
    const embed = new EmbedBuilder().setColor(0x2ECC71).setTitle('♻️ Confirm Order Restoration')
      .setDescription(`Restore order \`${id}\` to active records?\n\n**Booster:** <@${order.booster_id}>\n**Hero:** ${String(order.hero || 'Unknown').slice(0, 100)}\n**Original status:** ${String(order.status || 'Unknown').slice(0, 50)}\n\nThe order will retain its original status and status history.`);
    return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  }
};
