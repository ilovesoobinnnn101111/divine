import { MessageFlags } from 'discord.js';
import { requestManager } from '../../services/farm/boostRequests.js';
import { renderBoosterRoster } from '../../services/farm/boosterRoster.js';
export default {
 name:'boostroster',
 async execute(interaction,client,args){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  if(!requestManager(interaction.member))return interaction.reply({content:'Booster Manager role required.',flags:MessageFlags.Ephemeral});
  if(!client.db?.isAvailable?.())return interaction.reply({content:'PostgreSQL unavailable.',flags:MessageFlags.Ephemeral});
  const [action,raw,rawPage]=args;
  const filter=raw?.replace('_',' ');
  if(!['filter','page'].includes(action)||!['all','Available','Busy','Offline','Not Set'].includes(filter))return interaction.reply({content:'Invalid roster action.',flags:MessageFlags.Ephemeral});
  const page=action==='page'?Number(rawPage):0;
  if(!Number.isInteger(page)||Math.abs(page)>10000)return interaction.reply({content:'Invalid page.',flags:MessageFlags.Ephemeral});
  await interaction.deferUpdate();
  try{return interaction.editReply(await renderBoosterRoster(client,interaction.guildId,filter,page));}
  catch{return interaction.followUp({content:'Unable to refresh roster.',flags:MessageFlags.Ephemeral});}
 }
};
