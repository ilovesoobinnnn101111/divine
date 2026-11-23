import { MessageFlags } from 'discord.js';
import { updateBoosterProgress } from '../../services/farm/boosterProgress.js';
import { renderBoosterPanel } from '../../services/farm/boosterPanel.js';
export default {
 name:'boosterpanelnote',
 async execute(interaction,client,args){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))
   return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  const id=args[0],note=interaction.fields.getTextInputValue('note').trim();
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  try{
   const result=await updateBoosterProgress(client,interaction,id,'note',note);
   if(result.error)return interaction.editReply(result.error);
   return interaction.editReply({content:`📝 Progress note saved for \`${id}\`. Customer ticket: ${result.posted?'notified':'not linked or unavailable'}.`,allowedMentions:{parse:[]}});
  }catch{return interaction.editReply('Unable to save progress note. Check the order before retrying.');}
 }
};
