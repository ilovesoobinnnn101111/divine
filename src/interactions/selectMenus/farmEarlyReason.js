import { MessageFlags } from 'discord.js';
import { getActiveFarm, completeFarm, earlyReasons } from '../../services/farm/sessionService.js';
export default {
 name:'farm_earlyreason',
 async execute(interaction,client){
 if(!interaction.inGuild())return interaction.reply({content:'Server only.',flags:MessageFlags.Ephemeral});
 const [id,reason]=String(interaction.values[0]||'').split(':');
 if(!Object.hasOwn(earlyReasons,reason))return interaction.reply({content:'Invalid reason.',flags:MessageFlags.Ephemeral});
 const session=await getActiveFarm(client,interaction.guildId,id);
 if(!session||session.hostId!==interaction.user.id)return interaction.reply({content:'Only the active farm host can end this farm.',flags:MessageFlags.Ephemeral});
 await interaction.deferUpdate();
 if(!await completeFarm(client,interaction.guildId,session,'EARLY',reason))return interaction.editReply({content:'Farm is no longer active.',components:[]});
 const channel=await client.channels.fetch(session.channelId).catch(()=>null);
 const message=await channel?.messages.fetch(session.messageId).catch(()=>null);
 if(message)await message.edit({content:'Farm has ended early. Reason: '+earlyReasons[reason],embeds:[],components:[]});
 return interaction.editReply({content:'Farm has ended early. Reason: '+earlyReasons[reason],components:[]});
 }
};
