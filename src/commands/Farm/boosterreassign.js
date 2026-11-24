import {isEligibleBooster,eligibleBooster} from '../../services/farm/boosterSecurity.js';
import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, ComponentType } from 'discord.js';
import { workloadSnapshot } from '../../services/farm/boosterWorkload.js';
import { availabilityRows, availabilityOf, availabilityIcon } from '../../services/farm/boosterAvailability.js';
import { notifyBooster, notificationText } from '../../services/farm/boosterNotifications.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const safe = (value, max = 80) => String(value ?? 'Unknown').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1').slice(0, max);
const mention = id => /^\d{17,20}$/.test(String(id || '')) ? `<@${id}>` : 'Unknown';

export default {
  data: new SlashCommandBuilder().setName('boosterreassign')
    .setDescription('Transfer an existing booster order (Booster Manager only)')
    .addStringOption(option => option.setName('order_id').setDescription('Exact active order ID').setRequired(true).setMaxLength(40))
    .addUserOption(option => option.setName('new_booster').setDescription('Booster receiving the order').setRequired(true)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable; nothing changed.', flags: MessageFlags.Ephemeral });
    const id = interaction.options.getString('order_id', true).trim();
    const booster = interaction.options.getUser('new_booster', true);
    if (booster.bot) return interaction.reply({ content: 'Select a human booster, not a bot.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if(!await eligibleBooster(interaction.guild,booster.id))return interaction.editReply('Select a server member with the Booster role.');
    const availability=availabilityOf(await availabilityRows(client,interaction.guildId),booster.id);
    const orders = await readRecords(client, interaction.guildId, 'boosterOrders');
    const order = orders.find(item => item.order_id === id);
    if (!order) return interaction.editReply({ content: `Active order \`${safe(id, 40)}\` was not found.` });
    if(!await eligibleBooster(interaction.guild,booster.id,order.category))return interaction.editReply('Select a booster with the role required for this category.');
    const workload=await workloadSnapshot(client,interaction.guildId,id,interaction.guild,order.category);
    const selected=workload.people.find(x=>x.id===booster.id);
    if (order.booster_id === booster.id) return interaction.editReply({ content: 'This order is already assigned to that booster.' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`reassign:confirm:${interaction.id}`).setLabel('Confirm Reassignment').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reassign:cancel:${interaction.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );
    const embed = new EmbedBuilder().setColor(0xF39C12).setTitle('🔁 Confirm Booster Reassignment')
      .setDescription(`**Order:** \`${safe(id, 40)}\`\n**Current booster:** ${mention(order.booster_id)}\n**New booster:** ${mention(booster.id)}\n**Hero:** ${safe(order.hero)}\n**Status:** ${safe(order.status, 30)}\n\n${availability==='Busy'||availability==='Offline'?`⚠️ New booster is ${availabilityIcon(availability)} ${availability}.\\n\\n`:''}${selected?.limit!==null&&selected?.limit!==undefined&&selected.count>=selected.limit?`⚠️ Booster has reached workload limit (${selected.count}/${selected.limit}).\\n\\n`:''}${workload.recommended&&workload.recommended.id!==booster.id?`💡 Suggested: <@${workload.recommended.id}> (${workload.recommended.count} active).\\n\\n`:''}The existing status and history will be preserved.`);
    const response = await interaction.editReply({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
    let click;
    try {
      click = await response.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: button => button.user.id === interaction.user.id && button.customId.endsWith(interaction.id),
        time: 60000
      });
    } catch {
      return interaction.editReply({ content: 'Reassignment timed out. No changes were made.', embeds: [], components: [] });
    }
    if (click.customId.startsWith('reassign:cancel:'))
      return click.update({ content: 'Reassignment cancelled. No changes were made.', embeds: [], components: [] });
    await click.deferUpdate();
    let outcome = 'not_found';
    let updated;
    try {
      await withRecordLock(client, interaction.guildId, 'boosterOrders', async () => {
        const latest = await readRecords(client, interaction.guildId, 'boosterOrders');
        const index = latest.findIndex(item => item.order_id === id);
        if (index < 0) return;
        if (latest[index].booster_id !== order.booster_id) { outcome = 'changed'; return; }
        const manager=await interaction.guild.members.fetch({user:interaction.user.id,force:true}).catch(()=>null);
        if(!manager||!memberHasFarmRole(manager,managerRoles())||!['Pending','In Progress'].includes(latest[index].status)||!await eligibleBooster(interaction.guild,booster.id,latest[index].category)){outcome='forbidden';return;}
        const now = Date.now();
        updated = {
          ...latest[index],
          booster_id: booster.id,
          booster_tag: booster.tag,
          assignment_response:'Awaiting Confirmation', assignment_responded_at:null,
          updated_at: now,
          reassignment_history: [
            ...(Array.isArray(latest[index].reassignment_history) ? latest[index].reassignment_history : []),
            { from_booster_id: latest[index].booster_id, to_booster_id: booster.id, by: interaction.user.id, timestamp: now }
          ]
        };
        latest[index] = updated;
        await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:boosterOrders`, latest);
        outcome = 'saved';
      });
    } catch {
      return interaction.editReply({ content: 'Could not save the reassignment. Please retry.', embeds: [], components: [] });
    }
    if (outcome !== 'saved')
      return interaction.editReply({ content: outcome === 'forbidden' ? 'Order closed or required roles changed. No changes made.' : outcome === 'changed' ? 'The order was reassigned by someone else. No changes made.' : 'The order no longer exists. No changes made.', embeds: [], components: [] });
    const newDelivery=await notifyBooster(client,interaction.guildId,{orderId:id,recipientId:booster.id,type:'reassigned_to',message:notificationText('🔁 Divine order reassigned to you',updated,`Respond in the server using /boosterrespond with order ID ${id}.`)});
    const oldDelivery=await notifyBooster(client,interaction.guildId,{orderId:id,recipientId:order.booster_id,type:'reassigned_from',message:notificationText('↩️ Divine order transferred away from you',updated,`New booster: ${booster.username}`)});
    const dm=newDelivery.status==='Delivered'?'Sent':'Could not deliver (DMs may be disabled)';
    const result = new EmbedBuilder().setColor(0x2ECC71).setTitle('✅ Booster Order Reassigned')
      .setDescription(`**Order:** \`${safe(id, 40)}\`\n**Previous booster:** ${mention(order.booster_id)}\n**New booster:** ${mention(booster.id)}\n**Status preserved:** ${safe(updated.status, 30)}\n**Reassigned by:** ${mention(interaction.user.id)}\n**New booster DM:** ${dm}`)
      .setFooter({ text: 'Reassignment logged in reassignment_history' }).setTimestamp();
    return interaction.editReply({ content: '', embeds: [result], components: [], allowedMentions: { parse: [] } });
  }
};
