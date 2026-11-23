import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);

export default {
  data: new SlashCommandBuilder().setName('boosterremoveorder')
    .setDescription('Archive an incorrect booster order (Booster Manager only)')
    .addStringOption(o => o.setName('order_id').setDescription('Exact order ID to archive').setRequired(true).setMaxLength(40)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable; nothing archived.', flags: MessageFlags.Ephemeral });
    const id = interaction.options.getString('order_id', true).trim();
    const order = (await readRecords(client, interaction.guildId, 'boosterOrders')).find(o => o.order_id === id);
    if (!order) return interaction.reply({ content: `Order \`${id}\` was not found.`, flags: MessageFlags.Ephemeral });
    const confirmation = `boosterarchive:confirm:${interaction.user.id}:${interaction.id}`;
    const cancellation = `boosterarchive:cancel:${interaction.user.id}:${interaction.id}`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(confirmation).setLabel('Confirm Archive').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(cancellation).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );
    // Store the order ID against the interaction token in persistent storage so buttons
    // cannot inject or change order IDs and confirmation survives a restart.
    await client.db.set(`booster:archive:pending:${interaction.guildId}:${interaction.id}`, {
      orderId: id, userId: interaction.user.id, createdAt: Date.now()
    });
    const embed = new EmbedBuilder().setColor(0xE67E22).setTitle('⚠️ Confirm Order Archive')
      .setDescription(`Archive order \`${id}\`?\n\n**Booster:** <@${order.booster_id}>\n**Hero:** ${String(order.hero || 'Unknown').slice(0, 100)}\n**Status:** ${String(order.status || 'Unknown').slice(0, 50)}\n\nThis removes the order from active reports and saves it in the archive for auditing.`);
    return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  }
};
