import { SlashCommandBuilder } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
export default {
 data:new SlashCommandBuilder().setName('vouchstats').setDescription('Check host vouch statistics').addUserOption(o=>o.setName('host').setDescription('Host (defaults to yourself)')),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()) return interaction.reply('Server only.');
  const host=interaction.options.getUser('host')||interaction.user;
  const entries=(await readRecords(client,interaction.guildId,'vouches')).filter(x=>x.hostId===host.id);
  const average=entries.length?(entries.reduce((sum,x)=>sum+x.rating,0)/entries.length).toFixed(2):'N/A';
  return interaction.reply({content:`<@${host.id}> has ${entries.length} vouches. Average rating: ${average}/5.`,allowedMentions:{parse:[]}});
 }
};
