import { MessageFlags } from 'discord.js';
import { requestManager } from '../../services/farm/boostRequests.js';
import { renderBoosterDashboard } from '../../services/farm/boosterDashboard.js';
export default {
 name:'boostdashboard',
 async execute(interaction,client,args){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))
   return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  if(!requestManager(interaction.member))
   return interaction.reply({content:'Booster Manager role required.',flags:MessageFlags.Ephemeral});
  if(!client.db?.isAvailable?.())return interaction.reply({content:'PostgreSQL unavailable.',flags:MessageFlags.Ephemeral});
  const [action,mode]=args;
  if(!['view','refresh','select'].includes(action)||!['active','unassigned','overdue'].includes(mode))
   return interaction.reply({content:'Invalid dashboard action.',flags:MessageFlags.Ephemeral});
  const id=action==='select'?interaction.values?.[0]:null;
  await interaction.deferUpdate();
  try{return interaction.editReply(await renderBoosterDashboard(client,interaction.guildId,mode,id));}
  catch{return interaction.followUp({content:'Unable to refresh dashboard. Please try again.',flags:MessageFlags.Ephemeral});}
 }
};
