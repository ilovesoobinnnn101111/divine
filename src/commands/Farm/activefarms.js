import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getActiveFarms, farmDuration, farmSlots } from '../../services/farm/sessionService.js';
import { farmConfig } from '../../services/farm/config.js';

export default {
 data:new SlashCommandBuilder().setName('activefarms').setDescription('View all active farms'),
 async execute(interaction,guildConfig,client){
 if(!interaction.inGuild()||(farmConfig.guildId&&interaction.guildId!==farmConfig.guildId))return interaction.reply({content:'Farm commands are not enabled here.',flags:MessageFlags.Ephemeral});
 await interaction.deferReply({flags:MessageFlags.Ephemeral});
 const farms=await getActiveFarms(client,interaction.guildId);
 if(!farms.length)return interaction.editReply('There are no active farms.');
 const pages=[];
 let page='**Active farms ('+farms.length+')**';
 for(const farm of farms){
 const duration=farmDuration(farm.type);
 const end=farm.fullStartedAt?Math.floor((farm.fullStartedAt+duration*60000)/1000):null;
 const line='\n\n**'+farm.type+' farm** • <@'+farm.hostId+'>\nPlayers: '+farmSlots(farm)+'/12 • '+(end?'Ends <t:'+end+':R>':'Waiting for players ('+duration+' minutes)')+'\n[View farm](https://discord.com/channels/'+interaction.guildId+'/'+farm.channelId+'/'+farm.messageId+')';
 if(page.length+line.length>1900){pages.push(page);page='**Active farms (continued)**';}
 page+=line;
 }
 pages.push(page);
 await interaction.editReply({content:pages[0],allowedMentions:{parse:[]}});
 for(const content of pages.slice(1))await interaction.followUp({content,allowedMentions:{parse:[]},flags:MessageFlags.Ephemeral});
 }
};
