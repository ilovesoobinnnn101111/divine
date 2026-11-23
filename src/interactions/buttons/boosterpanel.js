import { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { renderBoosterPanel } from '../../services/farm/boosterPanel.js';
import { updateBoosterProgress } from '../../services/farm/boosterProgress.js';
import { readRecords } from '../../services/farm/records.js';
import { requestManager } from '../../services/farm/boostRequests.js';

export default {
 name:'boosterpanel',
 async execute(interaction,client,args){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))
   return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  if(!client.db?.isAvailable?.())return interaction.reply({content:'PostgreSQL unavailable.',flags:MessageFlags.Ephemeral});
  const [action,providedId]=args;
  const id=action==='select'?interaction.values?.[0]:providedId;
  if(!['select','refresh','start','complete','note'].includes(action))
   return interaction.reply({content:'Invalid panel action.',flags:MessageFlags.Ephemeral});
  if(action==='note'){
   if(!/^ORD-\d{17,20}$/.test(id))return interaction.reply({content:'Invalid order ID.',flags:MessageFlags.Ephemeral});
   const orders=await readRecords(client,interaction.guildId,'boosterOrders');
   const order=orders.find(o=>o.order_id===id);
   if(!order||!['Pending','In Progress'].includes(order.status)||(order.booster_id!==interaction.user.id&&!requestManager(interaction.member)))
    return interaction.reply({content:'This order is not available to you.',flags:MessageFlags.Ephemeral});
   const modal=new ModalBuilder().setCustomId('boosterpanelnote:'+id).setTitle('Add Booster Progress Note');
   modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Progress update').setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(3).setMaxLength(500)));
   return interaction.showModal(modal);
  }
  await interaction.deferUpdate();
  try{
   if(action==='start'||action==='complete'){
    const result=await updateBoosterProgress(client,interaction,id,action);
    if(result.error)return interaction.followUp({content:result.error,flags:MessageFlags.Ephemeral});
   }
   return interaction.editReply(await renderBoosterPanel(client,interaction,id));
  }catch{return interaction.followUp({content:'Unable to update the panel. Please try again.',flags:MessageFlags.Ephemeral});}
 }
};
