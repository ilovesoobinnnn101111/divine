import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);
const emoji = { Pending:'🟡', 'In Progress':'🔵', Completed:'✅', Cancelled:'❌', Failed:'⚠️' };
const colors = { Pending:0xF1C40F, 'In Progress':0x3498DB, Completed:0x2ECC71, Cancelled:0x95A5A6, Failed:0xE74C3C };
export default {
  data: new SlashCommandBuilder().setName('orderupdate').setDescription('Update an assigned booster order (Booster Manager only)')
    .addStringOption(o => o.setName('order_id').setDescription('Order ID from /orderassignment').setRequired(true).setMaxLength(40))
    .addStringOption(o => o.setName('status').setDescription('New order status').setRequired(true).addChoices(
      {name:'🟡 Pending',value:'Pending'}, {name:'🔵 In Progress',value:'In Progress'},
      {name:'✅ Completed',value:'Completed'}, {name:'❌ Cancelled',value:'Cancelled'}, {name:'⚠️ Failed',value:'Failed'}))
    .addStringOption(o => o.setName('notes').setDescription('Update notes').setRequired(false).setMaxLength(500)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable. No order changed.', flags: MessageFlags.Ephemeral });
    const orderId = interaction.options.getString('order_id', true).trim();
    const status = interaction.options.getString('status', true);
    const notes = interaction.options.getString('notes')?.trim() || '';
    await interaction.deferReply();
    let updated = null;
    await withRecordLock(client, interaction.guildId, 'boosterOrders', async () => {
      const records = await readRecords(client, interaction.guildId, 'boosterOrders');
      const index = records.findIndex(r => r.order_id === orderId);
      if (index < 0) return;
      const a = records[index];
      const now = Date.now();
      a.status_history = Array.isArray(a.status_history) ? a.status_history : [];
      a.status_history.push({ status, timestamp: now, by: interaction.user.id, notes });
      a.status = status;
      a.updated_at = now;
      if (notes) a.notes = (a.notes ? a.notes + '\n' : '') + notes;
      await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:boosterOrders`, records);
      updated = a;
    });
    if (!updated) return interaction.editReply(`❌ Order \`${orderId}\` not found.`);
    const a = updated;
    const history = a.status_history.slice(-5).map(h => `${emoji[h.status] || '⚪'} **${h.status}** — <t:${Math.floor(h.timestamp / 1000)}:R>`).join('\n');
    const embed = new EmbedBuilder().setColor(colors[status] || 0x95A5A6).setTitle(`${emoji[status]} Order Updated`)
      .setDescription(`Order **${orderId}** → **${status}**`)
      .addFields(
        { name:'🆔 Order ID',value:`\`${orderId}\``,inline:true },
        { name:'👤 Booster',value:`<@${a.booster_id}>`,inline:true },
        { name:'📌 Status',value:`${emoji[status]} ${status}`,inline:true },
        { name:'🦸 Hero',value:a.hero,inline:true },
        { name:'📊 Level',value:a.level,inline:true },
        { name:'📁 Type',value:a.category,inline:true },
        { name:'📜 History',value:history || 'No history',inline:false }
      ).setFooter({text:`By ${interaction.user.username}`}).setTimestamp();
    if (notes) embed.addFields({name:'📝 Update',value:notes,inline:false});
    await interaction.editReply({embeds:[embed],allowedMentions:{parse:[]}});
    try {
      const booster = await client.users.fetch(a.booster_id);
      await booster.send(`📋 Order \`${orderId}\` is now **${status}**.${notes ? `\nNotes: ${notes}` : ''}`);
    } catch { /* DMs may be disabled */ }
  }
};
