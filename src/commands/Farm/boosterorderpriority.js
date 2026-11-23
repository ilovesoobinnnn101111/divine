import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const clean = (value, max = 300) => String(value ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1').replace(/<@/g, '<\\@').slice(0, max);
const mention = id => /^\d{17,20}$/.test(String(id || '')) ? `<@${id}>` : 'Unknown';
const priorityColors = { Low: 0x95A5A6, Normal: 0x3498DB, High: 0xE67E22, Urgent: 0xE74C3C };
const priorityIcons = { Low: '⚪', Normal: '🔵', High: '🟠', Urgent: '🔴' };

export default {
  data: new SlashCommandBuilder().setName('boosterorderpriority')
    .setDescription('Set an active booster order’s priority (Booster Manager only)')
    .addStringOption(option => option.setName('order_id').setDescription('Exact active order ID').setRequired(true).setMaxLength(40))
    .addStringOption(option => option.setName('priority').setDescription('New priority level').setRequired(true).addChoices(
      { name: '⚪ Low', value: 'Low' },
      { name: '🔵 Normal', value: 'Normal' },
      { name: '🟠 High', value: 'High' },
      { name: '🔴 Urgent', value: 'Urgent' }
    ))
    .addStringOption(option => option.setName('reason').setDescription('Optional reason for this priority change').setRequired(false).setMaxLength(300)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable. Priority was not changed.', flags: MessageFlags.Ephemeral });
    const id = interaction.options.getString('order_id', true).trim();
    const priority = interaction.options.getString('priority', true);
    const reason = interaction.options.getString('reason')?.trim() || '';
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let updated = null;
    let previous = null;
    let unchanged = false;
    try {
      await withRecordLock(client, interaction.guildId, 'boosterOrders', async () => {
        const orders = await readRecords(client, interaction.guildId, 'boosterOrders');
        const index = orders.findIndex(order => order.order_id === id);
        if (index < 0) return;
        const current = orders[index];
        previous = current.priority || 'Normal';
        if (previous === priority) { unchanged = true; return; }
        const now = Date.now();
        updated = {
          ...current,
          priority,
          priority_updated_at: now,
          priority_updated_by: interaction.user.id,
          updated_at: now,
          priority_history: [
            ...(Array.isArray(current.priority_history) ? current.priority_history : []),
            { from: previous, to: priority, by: interaction.user.id, timestamp: now, reason }
          ]
        };
        orders[index] = updated;
        await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:boosterOrders`, orders);
      });
    } catch {
      return interaction.editReply({ content: 'Could not save the priority change. Please retry.' });
    }
    if (unchanged) return interaction.editReply({ content: `Order \`${clean(id, 40)}\` is already set to **${priority}**. No changes made.` });
    if (!updated) return interaction.editReply({ content: `Active order \`${clean(id, 40)}\` was not found.` });
    const history = updated.priority_history || [];
    const embed = new EmbedBuilder().setColor(priorityColors[priority]).setTitle(`${priorityIcons[priority]} Order Priority Updated`)
      .setDescription(`**Order:** \`${clean(updated.order_id, 40)}\`\n**Booster:** ${mention(updated.booster_id)}\n**Previous priority:** ${priorityIcons[previous] || '🔵'} ${clean(previous, 20)}\n**New priority:** ${priorityIcons[priority]} **${priority}**\n**Status (unchanged):** ${clean(updated.status, 40)}\n**Updated by:** ${mention(interaction.user.id)}\n**When:** <t:${Math.floor(updated.priority_updated_at / 1000)}:f>${reason ? `\n**Reason:** ${clean(reason)}` : ''}`)
      .addFields({ name: 'Priority changes recorded', value: String(history.length), inline: true })
      .setFooter({ text: 'Priority changes are saved in PostgreSQL · Status and notes preserved' }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
