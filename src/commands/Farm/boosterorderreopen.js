import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);
const safe = (v, max = 500) => String(v ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1').replace(/<@/g, '<\\@').slice(0, max);
const mention = id => /^\d{17,20}$/.test(String(id || '')) ? `<@${id}>` : 'Unknown';

export default {
  data: new SlashCommandBuilder().setName('boosterorderreopen')
    .setDescription('Reopen a completed booster order (Booster Manager only)')
    .addStringOption(o => o.setName('order_id').setAutocomplete(true).setDescription('Exact completed order ID').setRequired(true).setMaxLength(40))
    .addStringOption(o => o.setName('reason').setDescription('Required reason for reopening').setRequired(true).setMinLength(3).setMaxLength(500)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable. Nothing changed.', flags: MessageFlags.Ephemeral });
    const id = interaction.options.getString('order_id', true).trim();
    const reason = interaction.options.getString('reason', true).trim();
    if (reason.length < 3) return interaction.reply({ content: 'Please provide a reason of at least 3 characters.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const order = (await readRecords(client, interaction.guildId, 'boosterOrders')).find(x => x.order_id === id);
    if (!order) return interaction.editReply({ content: `Active record \`${safe(id, 40)}\` not found.` });
    if (order.status !== 'Completed')
      return interaction.editReply({ content: `Only Completed orders can be reopened. Current status: **${safe(order.status, 30)}**.` });
    const confirm = `boostreopen:yes:${interaction.id}`;
    const cancel = `boostreopen:no:${interaction.id}`;
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(confirm).setLabel('Confirm Reopen').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(cancel).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );
    const embed = new EmbedBuilder().setColor(0xE67E22).setTitle('⚠️ Confirm Reopening')
      .setDescription(`**Order:** \`${safe(id, 40)}\`\n**Booster:** ${mention(order.booster_id)}\n**Current status:** Completed\n**New status:** In Progress\n**Reason:** ${safe(reason)}\n\nOriginal completion history will be preserved.`);
    const reply = await interaction.editReply({ embeds: [embed], components: [buttons], allowedMentions: { parse: [] } });
    let click;
    try {
      click = await reply.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id && [confirm, cancel].includes(i.customId), time: 60000 });
    } catch {
      return interaction.editReply({ content: '⏳ Reopening confirmation expired. No changes made.', embeds: [], components: [] });
    }
    if (click.customId === cancel) {
      await click.update({ content: 'Reopening cancelled. No changes made.', embeds: [], components: [] });
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
        if (current.status !== 'Completed') { outcome = 'changed'; return; }
        const now = Date.now();
        updated = {
          ...current,
          status: 'In Progress',
          reopened_at: now,
          reopened_by: interaction.user.id,
          updated_at: now,
          status_history: [...(Array.isArray(current.status_history) ? current.status_history : []),
            { status: 'In Progress', timestamp: now, by: interaction.user.id, notes: `Reopened: ${reason}` }],
          reopening_history: [...(Array.isArray(current.reopening_history) ? current.reopening_history : []),
            { timestamp: now, by: interaction.user.id, reason, from_status: 'Completed', to_status: 'In Progress' }]
        };
        records[index] = updated;
        await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:boosterOrders`, records);
        outcome = 'saved';
      });
    } catch {
      return interaction.editReply({ content: 'Could not save reopening. Please retry.', embeds: [], components: [] });
    }
    if (outcome !== 'saved')
      return interaction.editReply({ content: outcome === 'changed' ? 'Order status changed before confirmation. No reopening applied.' : 'Order no longer exists. Nothing changed.', embeds: [], components: [] });
    let dm = false;
    if (/^\d{17,20}$/.test(String(updated.booster_id || ''))) {
      try {
        const booster = await client.users.fetch(updated.booster_id);
        const notification = new EmbedBuilder().setColor(0x3498DB).setTitle('🔄 Booster Order Reopened')
          .setDescription(`**Order:** \`${safe(id, 40)}\`\n**New status:** In Progress\n**Reopened by:** ${mention(interaction.user.id)}\n**When:** <t:${Math.floor(updated.reopened_at / 1000)}:f>\n**Reason:** ${safe(reason)}`);
        await booster.send({ embeds: [notification], allowedMentions: { parse: [] } });
        dm = true;
      } catch { /* DMs may be disabled */ }
    }
    const result = new EmbedBuilder().setColor(0x3498DB).setTitle('🔄 Order Reopened')
      .setDescription(`**Order:** \`${safe(id, 40)}\`\n**Booster:** ${mention(updated.booster_id)}\n**Status:** In Progress\n**Reopened by:** ${mention(interaction.user.id)}\n**When:** <t:${Math.floor(updated.reopened_at / 1000)}:f>\n**Reason:** ${safe(reason)}\n**Booster DM:** ${dm ? 'Delivered' : 'Not delivered'}`)
      .setFooter({ text: 'Saved to PostgreSQL · Previous completion history preserved' }).setTimestamp();
    return interaction.editReply({ embeds: [result], components: [], content: '', allowedMentions: { parse: [] } });
  }
};
