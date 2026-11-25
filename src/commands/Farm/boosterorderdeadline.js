import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { notifyBooster, notificationText } from '../../services/farm/boosterNotifications.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const clean = (value, max = 300) => String(value ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1').replace(/<@/g, '<\\@').slice(0, max);
const mention = id => /^\d{17,20}$/.test(String(id || '')) ? `<@${id}>` : 'Unknown';
const display = ms => ms ? `<t:${Math.floor(ms / 1000)}:f> (<t:${Math.floor(ms / 1000)}:R>)` : 'None';
function parseUTC(value) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) return null;
  const ms = Date.parse(value.replace(' ', 'T') + ':00Z');
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') === value ? ms : null;
}

export default {
  data: new SlashCommandBuilder().setName('boosterorderdeadline')
    .setDescription('Set or remove an active booster order deadline (Booster Manager only)')
    .addStringOption(option => option.setName('order_id').setAutocomplete(true).setDescription('Exact active order ID').setRequired(true).setMaxLength(40))
    .addStringOption(option => option.setName('action').setDescription('Set or remove the deadline').setRequired(true).addChoices(
      { name: 'Set / change deadline', value: 'set' }, { name: 'Remove deadline', value: 'remove' }))
    .addStringOption(option => option.setName('deadline_utc').setDescription('For Set: YYYY-MM-DD HH:mm in UTC, e.g. 2026-12-01 18:30').setRequired(false).setMaxLength(16))
    .addStringOption(option => option.setName('reason').setDescription('Optional reason for the change').setRequired(false).setMaxLength(300)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable. No deadline changed.', flags: MessageFlags.Ephemeral });
    const id = interaction.options.getString('order_id', true).trim();
    const action = interaction.options.getString('action', true);
    const input = interaction.options.getString('deadline_utc')?.trim() || '';
    const reason = interaction.options.getString('reason')?.trim() || '';
    if (action === 'set' && !input)
      return interaction.reply({ content: 'Provide deadline_utc in YYYY-MM-DD HH:mm format (UTC).', flags: MessageFlags.Ephemeral });
    if (action === 'remove' && input)
      return interaction.reply({ content: 'Leave deadline_utc blank when removing a deadline.', flags: MessageFlags.Ephemeral });
    const deadline = action === 'set' ? parseUTC(input) : null;
    if (action === 'set' && deadline === null)
      return interaction.reply({ content: 'Invalid UTC date/time. Use YYYY-MM-DD HH:mm, e.g. 2026-12-01 18:30.', flags: MessageFlags.Ephemeral });
    if (action === 'set' && deadline <= Date.now())
      return interaction.reply({ content: 'Choose a future UTC deadline.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let updated = null;
    let previous = null;
    let outcome = 'missing';
    try {
      await withRecordLock(client, interaction.guildId, 'boosterOrders', async () => {
        const orders = await readRecords(client, interaction.guildId, 'boosterOrders');
        const index = orders.findIndex(order => order.order_id === id);
        if (index < 0) return;
        const current = orders[index];
        const old = Number(current.deadline_at);
        previous = Number.isFinite(old) && old > 0 ? old : null;
        if (previous === deadline) { outcome = 'unchanged'; return; }
        const now = Date.now();
        updated = {
          ...current,
          deadline_at: deadline,
          deadline_updated_at: now,
          deadline_updated_by: interaction.user.id,
          updated_at: now,
          deadline_history: [
            ...(Array.isArray(current.deadline_history) ? current.deadline_history : []),
            { from: previous, to: deadline, by: interaction.user.id, timestamp: now, reason }
          ]
        };
        orders[index] = updated;
        await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:boosterOrders`, orders);
        outcome = 'saved';
      });
    } catch {
      return interaction.editReply({ content: 'Could not save the deadline change. Please retry.' });
    }
    if (outcome === 'missing') return interaction.editReply({ content: `Active order \`${clean(id, 40)}\` not found.` });
    if (outcome === 'unchanged') return interaction.editReply({ content: `Order \`${clean(id, 40)}\` already has that deadline. No changes made.` });
    const embed = new EmbedBuilder().setColor(deadline ? 0x3498DB : 0x95A5A6).setTitle(deadline ? '📅 Order Deadline Saved' : '📅 Order Deadline Removed')
      .setDescription(`**Order:** \`${clean(id, 40)}\`\n**Booster:** ${mention(updated.booster_id)}\n**Previous deadline:** ${display(previous)}\n**New deadline:** ${display(deadline)}\n**Order status:** ${clean(updated.status, 40)}\n**Changed by:** ${mention(interaction.user.id)}${reason ? `\n**Reason:** ${clean(reason)}` : ''}`)
      .setFooter({ text: 'UTC deadline · Change saved to deadline_history · Order status and priority unchanged' }).setTimestamp();
    await notifyBooster(client,interaction.guildId,{orderId:id,recipientId:updated.booster_id,type:'deadline_changed',message:notificationText('📅 Divine order deadline changed',updated,`New deadline: ${deadline?new Date(deadline).toISOString():'Removed'}`)});
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
