import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);
const safe = (v, max = 500) => String(v ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1').replace(/<@/g, '<\\@').slice(0, max);
const mention = id => /^\d{17,20}$/.test(String(id || '')) ? `<@${id}>` : 'Unknown';

export default {
  data: new SlashCommandBuilder().setName('boosterordercomplete')
    .setDescription('Confirm and approve completion of an active booster order (Booster Manager only)')
    .addStringOption(o => o.setName('order_id').setDescription('Exact active order ID').setRequired(true).setMaxLength(40))
    .addStringOption(o => o.setName('notes').setDescription('Optional completion notes').setRequired(false).setMaxLength(500)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable. Nothing changed.', flags: MessageFlags.Ephemeral });
    const id = interaction.options.getString('order_id', true).trim();
    const notes = interaction.options.getString('notes')?.trim() || '';
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const order = (await readRecords(client, interaction.guildId, 'boosterOrders')).find(x => x.order_id === id);
    if (!order) return interaction.editReply({ content: `Active order \`${safe(id, 40)}\` not found.` });
    if (!['Pending', 'In Progress'].includes(order.status))
      return interaction.editReply({ content: `Order is already **${safe(order.status, 30)}**. Only Pending or In Progress orders can be completed.` });
    const confirm = `boostcomplete:yes:${interaction.id}`;
    const cancel = `boostcomplete:no:${interaction.id}`;
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(confirm).setLabel('Confirm Completion').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(cancel).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );
    const embed = new EmbedBuilder().setColor(0xF1C40F).setTitle('⚠️ Confirm Order Completion')
      .setDescription(`**Order:** \`${safe(id, 40)}\`\n**Booster:** ${mention(order.booster_id)}\n**Current status:** ${safe(order.status, 30)}\n**Priority:** ${safe(order.priority || 'Normal', 20)}${notes ? `\n**Completion notes:** ${safe(notes)}` : ''}\n\nConfirm to mark this order as **Completed**.`);
    const reply = await interaction.editReply({ embeds: [embed], components: [buttons], allowedMentions: { parse: [] } });
    let click;
    try {
      click = await reply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id && [confirm, cancel].includes(i.customId), time: 60000 });
    } catch {
      return interaction.editReply({ content: '⏳ Completion confirmation expired. No changes made.', embeds: [], components: [] });
    }
    if (click.customId === cancel) {
      await click.update({ content: 'Completion cancelled. No changes made.', embeds: [], components: [] });
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
        if (!['Pending', 'In Progress'].includes(current.status)) { outcome = 'already'; return; }
        const now = Date.now();
        updated = {
          ...current,
          status: 'Completed',
          completed_at: now,
          completed_by: interaction.user.id,
          completion_notes: notes,
          updated_at: now,
          status_history: [...(Array.isArray(current.status_history) ? current.status_history : []),
            { status: 'Completed', timestamp: now, by: interaction.user.id, notes }],
          completion_history: [...(Array.isArray(current.completion_history) ? current.completion_history : []),
            { timestamp: now, by: interaction.user.id, notes, previous_status: current.status }]
        };
        records[index] = updated;
        await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:boosterOrders`, records);
        outcome = 'saved';
      });
    } catch {
      return interaction.editReply({ content: 'Could not save completion. Please retry.', embeds: [], components: [] });
    }
    if (outcome !== 'saved') return interaction.editReply({ content: outcome === 'already' ? 'Order status changed before confirmation. No completion was applied.' : 'Order no longer exists. Nothing changed.', embeds: [], components: [] });
    let dm = false;
    if (/^\d{17,20}$/.test(String(updated.booster_id || ''))) {
      try {
        const booster = await client.users.fetch(updated.booster_id);
        const notification = new EmbedBuilder().setColor(0x2ECC71).setTitle('✅ Booster Order Completed')
          .setDescription(`**Order:** \`${safe(id, 40)}\`\n**Status:** Completed\n**Approved by:** ${mention(interaction.user.id)}\n**Completed:** <t:${Math.floor(updated.completed_at / 1000)}:f>${notes ? `\n**Notes:** ${safe(notes)}` : ''}`);
        await booster.send({ embeds: [notification], allowedMentions: { parse: [] } });
        dm = true;
      } catch { /* DMs may be disabled */ }
    }
    const result = new EmbedBuilder().setColor(0x2ECC71).setTitle('✅ Order Completion Approved')
      .setDescription(`**Order:** \`${safe(id, 40)}\`\n**Booster:** ${mention(updated.booster_id)}\n**Status:** Completed\n**Approved by:** ${mention(interaction.user.id)}\n**Completed:** <t:${Math.floor(updated.completed_at / 1000)}:f>\n**Booster DM:** ${dm ? 'Delivered' : 'Not delivered'}${notes ? `\n**Notes:** ${safe(notes)}` : ''}`)
      .setFooter({ text: 'Saved to PostgreSQL · Existing order history preserved' }).setTimestamp();
    return interaction.editReply({ embeds: [result], components: [], content: '', allowedMentions: { parse: [] } });
  }
};
