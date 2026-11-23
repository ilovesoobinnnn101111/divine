import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { availabilityRows, availabilityOf, availabilityIcon } from '../../services/farm/boosterAvailability.js';
import { notifyBooster, notificationText } from '../../services/farm/boosterNotifications.js';
import { appendRecord } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);

export default {
  data: new SlashCommandBuilder().setName('orderassignment').setDescription('Assign an order to a booster (Booster Manager only)')
    .addUserOption(o => o.setName('booster').setDescription('Booster to assign').setRequired(true))
    .addStringOption(o => o.setName('hero').setDescription('Hero').setRequired(true).setMaxLength(100))
    .addStringOption(o => o.setName('level').setDescription('Level').setRequired(true).setMaxLength(50))
    .addStringOption(o => o.setName('category').setDescription('Order category').setRequired(false).addChoices(
      {name:'Rank Boost',value:'Rank Boost'}, {name:'Hero Boost',value:'Hero Boost'},
      {name:'Duo Queue',value:'Duo Queue'}, {name:'Coaching',value:'Coaching'}))
    .addStringOption(o => o.setName('customer').setDescription('Customer').setRequired(false).setMaxLength(100))
    .addStringOption(o => o.setName('notes').setDescription('Additional instructions').setRequired(false).setMaxLength(500)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL is unavailable. No order was assigned.', flags: MessageFlags.Ephemeral });
    const booster = interaction.options.getUser('booster', true);
    const hero = interaction.options.getString('hero', true);
    const level = interaction.options.getString('level', true);
    const category = interaction.options.getString('category') || 'Rank Boost';
    const customer = interaction.options.getString('customer') || null;
    const notes = interaction.options.getString('notes') || '';
    await interaction.deferReply();
    const availability=availabilityOf(await availabilityRows(client,interaction.guildId),booster.id);
    const now = Date.now();
    const orderId = `ORD-${interaction.id}`;
    const record = {
      order_id: orderId, booster_id: booster.id, booster_tag: booster.tag,
      assigned_by: interaction.user.id, assigned_by_tag: interaction.user.tag,
      hero, level, category, customer, notes, status: 'Pending',
      status_history: [{ status: 'Pending', timestamp: now, by: interaction.user.id }],
      created_at: now, updated_at: now
    };
    await appendRecord(client, interaction.guildId, 'boosterOrders', record);
    const embed = new EmbedBuilder().setColor(0x3498DB).setTitle('📋 Order Assigned')
      .setDescription(`Order **${orderId}** → <@${booster.id}>`)
      .addFields(
        { name: '🆔 Order ID', value: `\`${orderId}\``, inline: true },
        { name: '👤 Booster', value: `<@${booster.id}>`, inline: true },
        { name: '📁 Type', value: category, inline: true },
        { name: '🦸 Hero', value: hero, inline: true },
        { name: '📊 Level', value: level, inline: true },
        { name: '📌 Status', value: '🟡 Pending', inline: true }
      ).setFooter({ text: `Assigned by ${interaction.user.username}` }).setTimestamp();
    if (customer) embed.addFields({ name: '👥 Customer', value: customer, inline: false });
    if (notes) embed.addFields({ name: '📝 Notes', value: notes, inline: false });
    if(availability==='Busy'||availability==='Offline')embed.addFields({name:'⚠️ Availability Warning',value:`${availabilityIcon(availability)} Booster is ${availability}. Assignment was still saved.`});
    await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    await notifyBooster(client,interaction.guildId,{orderId,recipientId:booster.id,type:'assignment',message:notificationText('📋 New Divine order assigned',record,`Category: ${category}`)});
  }
};
