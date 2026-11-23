import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';

const roles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);
const safe = (v, n = 500) => String(v ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1').replace(/<@/g, '<\\@').slice(0, n);
const validId = id => /^\d{17,20}$/.test(String(id || ''));
const COOLDOWN = 15 * 60 * 1000;
const priorityColor = { Low: 0x95A5A6, Normal: 0x3498DB, High: 0xE67E22, Urgent: 0xE74C3C };

export default {
  data: new SlashCommandBuilder().setName('boosterorderreminder')
    .setDescription('DM an assigned booster about an active order (Booster Manager only)')
    .addStringOption(o => o.setName('order_id').setDescription('Exact active order ID').setRequired(true).setMaxLength(40))
    .addStringOption(o => o.setName('message').setDescription('Optional reminder message').setRequired(false).setMaxLength(500)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, roles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const id = interaction.options.getString('order_id', true).trim();
    const message = interaction.options.getString('message')?.trim() || '';
    const key = `${farmConfig.databasePrefix}${interaction.guildId}:boosterOrders`;
    let order = null, result = 'missing', remaining = 0;
    const requestId = interaction.id;
    try {
      // Reserve a send under the record lock so simultaneous managers cannot bypass the cooldown.
      await withRecordLock(client, interaction.guildId, 'boosterOrders', async () => {
        const records = await readRecords(client, interaction.guildId, 'boosterOrders');
        const index = records.findIndex(x => x.order_id === id);
        if (index < 0) return;
        const current = records[index];
        if (!['Pending', 'In Progress'].includes(current.status)) { result = 'closed'; return; }
        if (!validId(current.booster_id)) { result = 'invalid'; return; }
        const last = Number(current.reminder_last_attempt_at) || 0;
        const now = Date.now();
        if (last > now - COOLDOWN && last <= now) {
          result = 'cooldown';
          remaining = last + COOLDOWN - now;
          return;
        }
        order = { ...current };
        records[index] = { ...current, reminder_last_attempt_at: now, reminder_pending_id: requestId };
        await client.db.set(key, records);
        result = 'reserved';
      });
    } catch {
      return interaction.editReply({ content: 'Could not reserve the reminder. Please try again.' });
    }
    if (result === 'missing') return interaction.editReply({ content: `Active order \`${safe(id, 40)}\` not found.` });
    if (result === 'closed') return interaction.editReply({ content: 'Reminders are only available for Pending or In Progress orders.' });
    if (result === 'invalid') return interaction.editReply({ content: 'This order has no valid assigned booster ID.' });
    if (result === 'cooldown') return interaction.editReply({ content: `A reminder was recently attempted for this order. Try again <t:${Math.floor((Date.now() + remaining) / 1000)}:R> (15-minute cooldown).` });
    const priority = ['Low', 'Normal', 'High', 'Urgent'].includes(order.priority) ? order.priority : 'Normal';
    const deadline = Number(order.deadline_at);
    const deadlineText = Number.isFinite(deadline) && deadline > 0
      ? `<t:${Math.floor(deadline / 1000)}:f> (<t:${Math.floor(deadline / 1000)}:R>)${deadline < Date.now() ? ' 🔴 OVERDUE' : ''}`
      : 'Not set';
    const dmEmbed = new EmbedBuilder().setColor(priorityColor[priority]).setTitle('📩 Booster Order Reminder')
      .setDescription(`**Order ID:** \`${safe(id, 40)}\`\n**Status:** ${safe(order.status, 30)}\n**Priority:** ${priority}\n**Deadline:** ${deadlineText}${message ? `\n\n**Manager message:**\n${safe(message)}` : ''}`)
      .setFooter({ text: 'Reminder from your server Booster Manager' }).setTimestamp();
    let delivered = false;
    try {
      const booster = await client.users.fetch(order.booster_id);
      await booster.send({ embeds: [dmEmbed], allowedMentions: { parse: [] } });
      delivered = true;
    } catch {
      // A closed DM or Discord error is recorded as a failed delivery.
    }
    let saved = false;
    try {
      await withRecordLock(client, interaction.guildId, 'boosterOrders', async () => {
        const records = await readRecords(client, interaction.guildId, 'boosterOrders');
        const index = records.findIndex(x => x.order_id === id);
        if (index < 0) return;
        const current = records[index];
        const now = Date.now();
        records[index] = {
          ...current,
          reminder_history: [...(Array.isArray(current.reminder_history) ? current.reminder_history : []),
            { timestamp: now, by: interaction.user.id, to_booster_id: order.booster_id, delivered, message }],
          reminder_pending_id: current.reminder_pending_id === requestId ? null : current.reminder_pending_id,
          updated_at: now
        };
        await client.db.set(key, records);
        saved = true;
      });
    } catch {
      return interaction.editReply({ content: delivered
        ? 'The Discord DM was delivered, but saving its history failed. Check PostgreSQL before retrying.'
        : 'The DM could not be delivered, and saving the failed attempt also failed.' });
    }
    if (!saved) return interaction.editReply({ content: delivered ? 'DM delivered, but order was no longer available to save its history.' : 'DM delivery failed and the order was no longer available.' });
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(delivered ? 0x2ECC71 : 0xE74C3C)
      .setTitle(delivered ? '✅ Reminder Delivered' : '❌ Reminder Not Delivered')
      .setDescription(`**Order:** \`${safe(id, 40)}\`\n**Booster:** <@${order.booster_id}>\n**Priority:** ${priority}\n**Deadline:** ${deadlineText}\n**Delivery:** ${delivered ? 'Discord DM sent successfully.' : 'Could not send DM (possibly closed DMs or Discord unavailable).'}\n**History:** Saved to PostgreSQL.\n**Cooldown:** 15 minutes per order.`)
      .setTimestamp()], allowedMentions: { parse: [] } });
  }
};
