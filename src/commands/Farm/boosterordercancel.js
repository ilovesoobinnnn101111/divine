import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { notifyBooster, notificationText } from '../../services/farm/boosterNotifications.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);
const safe = (v, max = 500) => String(v ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1').replace(/<@/g, '<\\@').slice(0, max);
const mention = id => /^\d{17,20}$/.test(String(id || '')) ? `<@${id}>` : 'Unknown';

export default {
  data: new SlashCommandBuilder().setName('boosterordercancel')
    .setDescription('Cancel an active booster order with approval (Booster Manager only)')
    .addStringOption(o => o.setName('order_id').setDescription('Exact active order ID').setRequired(true).setMaxLength(40))
    .addStringOption(o => o.setName('reason').setDescription('Required cancellation reason').setRequired(true).setMinLength(3).setMaxLength(500)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable. Nothing changed.', flags: MessageFlags.Ephemeral });
    const id = interaction.options.getString('order_id', true).trim();
    const reason = interaction.options.getString('reason', true).trim();
    if (reason.length < 3) return interaction.reply({ content: 'Please provide a cancellation reason of at least 3 characters.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let order;
    try {
      order = (await readRecords(client, interaction.guildId, 'boosterOrders')).find(x => x.order_id === id);
    } catch {
      return interaction.editReply({ content: 'Could not load the order. Nothing changed.' });
    }
    if (!order) return interaction.editReply({ content: `Active order \`${safe(id, 40)}\` not found.` });
    if (!['Pending', 'In Progress'].includes(order.status))
      return interaction.editReply({ content: `Only Pending or In Progress orders can be cancelled. Current status: **${safe(order.status, 30)}**.` });
    const confirm = `boostcancel:yes:${interaction.id}`;
    const cancel = `boostcancel:no:${interaction.id}`;
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(confirm).setLabel('Confirm Cancellation').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(cancel).setLabel('Keep Order').setStyle(ButtonStyle.Secondary)
    );
    const embed = new EmbedBuilder().setColor(0xE67E22).setTitle('⚠️ Confirm Order Cancellation')
      .setDescription(`**Order:** \`${safe(id, 40)}\`\n**Booster:** ${mention(order.booster_id)}\n**Current status:** ${safe(order.status, 30)}\n**New status:** Cancelled\n**Reason:** ${safe(reason)}\n\nThe order will remain in records with its history preserved.`);
    const reply = await interaction.editReply({ embeds: [embed], components: [buttons], allowedMentions: { parse: [] } });
    let click;
    try {
      click = await reply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id && [confirm, cancel].includes(i.customId), time: 60000 });
    } catch {
      return interaction.editReply({ content: '⏳ Cancellation confirmation expired. No changes made.', embeds: [], components: [] });
    }
    if (click.customId === cancel) {
      await click.update({ content: 'Order kept. No changes made.', embeds: [], components: [] });
      return;
    }
    await click.deferUpdate();
    let updated = null, outcome = 'missing';
    try {
      await withRecordLock(client, interaction.guildId, 'boosterOrders', async () => {
        const records = await readRecords(client, interaction.guildId, 'boosterOrders');
        const index = records.findIndex(x => x.order_id === id);
        if (index < 0) return;
        const current = records[index];
        if (!['Pending', 'In Progress'].includes(current.status)) { outcome = 'changed'; return; }
        const now = Date.now();
        updated = {
          ...current,
          status: 'Cancelled',
          cancelled_at: now,
          cancelled_by: interaction.user.id,
          cancellation_reason: reason,
          updated_at: now,
          status_history: [...(Array.isArray(current.status_history) ? current.status_history : []),
            { status: 'Cancelled', timestamp: now, by: interaction.user.id, notes: reason }],
          cancellation_history: [...(Array.isArray(current.cancellation_history) ? current.cancellation_history : []),
            { timestamp: now, by: interaction.user.id, reason, previous_status: current.status }]
        };
        records[index] = updated;
        await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:boosterOrders`, records);
        outcome = 'saved';
      });
    } catch {
      return interaction.editReply({ content: 'Could not save cancellation. Please retry.', embeds: [], components: [] });
    }
    if (outcome !== 'saved')
      return interaction.editReply({ content: outcome === 'changed' ? 'Order status changed before confirmation. No cancellation applied.' : 'Order no longer exists. Nothing changed.', embeds: [], components: [] });
    const delivery=await notifyBooster(client,interaction.guildId,{orderId:id,recipientId:updated.booster_id,type:'cancelled',message:notificationText('❌ Divine order cancelled',updated,`Reason: ${reason}`)});
    const dm=delivery.status==='Delivered';
    const result = new EmbedBuilder().setColor(0xE74C3C).setTitle('❌ Order Cancelled')
      .setDescription(`**Order:** \`${safe(id, 40)}\`\n**Booster:** ${mention(updated.booster_id)}\n**Status:** Cancelled\n**Cancelled by:** ${mention(interaction.user.id)}\n**When:** <t:${Math.floor(updated.cancelled_at / 1000)}:f>\n**Reason:** ${safe(reason)}\n**Booster DM:** ${dm ? 'Delivered' : 'Not delivered'}`)
      .setFooter({ text: 'Saved to PostgreSQL · Existing order history preserved' }).setTimestamp();
    return interaction.editReply({ embeds: [result], components: [], content: '', allowedMentions: { parse: [] } });
  }
};
