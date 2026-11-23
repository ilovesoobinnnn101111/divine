import { MessageFlags } from 'discord.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);

export default {
  name: 'boosterrestore',
  async execute(interaction, client, args) {
    const [action, userId, requestId] = args;
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (interaction.user.id !== userId || !memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Only the requesting Booster Manager can confirm restoration.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable; nothing restored.', flags: MessageFlags.Ephemeral });
    const key = `booster:restore:pending:${interaction.guildId}:${requestId}`;
    const pending = await client.db.get(key, null);
    if (!pending || pending.userId !== interaction.user.id || !pending.createdAt || Date.now() - pending.createdAt > 5 * 60 * 1000)
      return interaction.update({ content: 'This confirmation has expired. Run /boosterrestoreorder again.', embeds: [], components: [] });
    if (action === 'cancel') {
      await client.db.set(key, null);
      return interaction.update({ content: 'Restoration cancelled. No order was changed.', embeds: [], components: [] });
    }
    if (action !== 'confirm') return interaction.reply({ content: 'Invalid action.', flags: MessageFlags.Ephemeral });
    await interaction.deferUpdate();
    let result = 'not_found';
    await withRecordLock(client, interaction.guildId, 'boosterOrders', async () => {
      const orders = await readRecords(client, interaction.guildId, 'boosterOrders');
      if (orders.some(o => o.order_id === pending.orderId)) { result = 'duplicate'; return; }
      const archive = await readRecords(client, interaction.guildId, 'boosterOrdersArchive');
      const index = archive.findIndex(o => o.order_id === pending.orderId);
      if (index < 0) return;
      const archived = archive[index];
      const now = Date.now();
      const restored = { ...archived,
        restoration_history: [...(Array.isArray(archived.restoration_history) ? archived.restoration_history : []),
          { restored_at: now, restored_by: interaction.user.id, archived_at: archived.archived_at, archived_by: archived.archived_by }]
      };
      delete restored.archived_at;
      delete restored.archived_by;
      delete restored.archive_reason;
      // Save active record before removing the archived copy, preventing loss if a write fails.
      orders.push(restored);
      await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:boosterOrders`, orders);
      archive.splice(index, 1);
      await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:boosterOrdersArchive`, archive);
      result = 'restored';
    });
    await client.db.set(key, null);
    const message = result === 'restored'
      ? `✅ Order \`${pending.orderId}\` restored by <@${interaction.user.id}> with its original history preserved.`
      : result === 'duplicate'
        ? `⚠️ Order \`${pending.orderId}\` is already active. No duplicate was created.`
        : 'This order is no longer in the archive. Nothing restored.';
    return interaction.editReply({ content: message, embeds: [], components: [], allowedMentions: { parse: [] } });
  }
};
