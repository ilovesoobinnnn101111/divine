import { MessageFlags } from 'discord.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);

export default {
  name: 'boosterarchive',
  async execute(interaction, client, args) {
    const [action, userId, requestId] = args;
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (interaction.user.id !== userId || !memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Only the Booster Manager who requested this archive can confirm it.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable; nothing archived.', flags: MessageFlags.Ephemeral });
    const pendingKey = `booster:archive:pending:${interaction.guildId}:${requestId}`;
    const pending = await client.db.get(pendingKey, null);
    if (!pending || pending.userId !== interaction.user.id || !pending.createdAt || Date.now() - pending.createdAt > 5 * 60 * 1000)
      return interaction.update({ content: 'This confirmation has expired. Run /boosterremoveorder again.', embeds: [], components: [] });
    if (action === 'cancel') {
      await client.db.set(pendingKey, null);
      return interaction.update({ content: 'Archive cancelled. No order was changed.', embeds: [], components: [] });
    }
    if (action !== 'confirm') return interaction.reply({ content: 'Invalid action.', flags: MessageFlags.Ephemeral });
    await interaction.deferUpdate();
    let result = 'not_found';
    await withRecordLock(client, interaction.guildId, 'boosterOrders', async () => {
      const orders = await readRecords(client, interaction.guildId, 'boosterOrders');
      const index = orders.findIndex(order => order.order_id === pending.orderId);
      if (index < 0) return;
      const order = orders[index];
      const archive = await readRecords(client, interaction.guildId, 'boosterOrdersArchive');
      if (!archive.some(item => item.order_id === order.order_id)) {
        archive.push({ ...order, archived_at: Date.now(), archived_by: interaction.user.id, archive_reason: 'Manager archived via /boosterremoveorder' });
        await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:boosterOrdersArchive`, archive);
      }
      orders.splice(index, 1);
      await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:boosterOrders`, orders);
      result = 'archived';
    });
    await client.db.set(pendingKey, null);
    return interaction.editReply({ content: result === 'archived' ? `✅ Order \`${pending.orderId}\` archived by <@${interaction.user.id}>. The original record is preserved in the audit archive.` : 'This order is no longer active; no changes made.', embeds: [], components: [], allowedMentions: { parse: [] } });
  }
};
