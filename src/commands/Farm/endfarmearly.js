import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getActiveFarm, saveActiveFarm } from '../../services/farm/sessionService.js';
import { isManager } from '../../services/farm/records.js';
export default {
 data:new SlashCommandBuilder().setName('endfarmearly').setDescription('End a farm early (hosts only)')
 .addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true).addChoices({name:'Griefing',value:'GRIEF'},{name:'Disconnect',value:'DC'},{name:'AFK',value:'AFK'},{name:'Player left',value:'LEFT'},{name:'Technical',value:'TECH'},{name:'Other',value:'OTHER'})),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()) return interaction.reply({content:'Server only.',flags:MessageFlags.Ephemeral});
  const session=await getActiveFarm(client,interaction.guildId);
  if(!session) return interaction.reply({content:'No active farm.',flags:MessageFlags.Ephemeral});
  if(session.hostId!==interaction.user.id&&!isManager(interaction.member)) return interaction.reply({content:'Only the host or a manager can end the farm.',flags:MessageFlags.Ephemeral});
  await saveActiveFarm(client,interaction.guildId,null);
  const channel=await client.channels.fetch(session.channelId).catch(()=>null);
  const message=await channel?.messages.fetch(session.messageId).catch(()=>null);
  const reason=interaction.options.getString('reason');
  if(message) await message.edit({content:`Farm ended early. Reason: ${reason}`,embeds:[],components:[]}).catch(()=>{});
  return interaction.reply({content:`Farm ended early: ${reason}`,flags:MessageFlags.Ephemeral});
 }
};
