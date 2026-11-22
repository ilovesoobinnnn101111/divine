import { SlashCommandBuilder } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
export default {
 data:new SlashCommandBuilder().setName('hostleaderboard').setDescription('View the top hosts by activity and vouches'),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()) return interaction.reply('Server only.');
  const logs=await readRecords(client,interaction.guildId,'hostLogs');
  const vouches=await readRecords(client,interaction.guildId,'vouches');
  const hosts=new Map();
  for(const x of logs){const v=hosts.get(x.hostId)||{minutes:0,games:0,vouches:0,ratingTotal:0};v.minutes+=x.minutes;v.games+=x.games;hosts.set(x.hostId,v);}
  for(const x of vouches){const v=hosts.get(x.hostId)||{minutes:0,games:0,vouches:0,ratingTotal:0};v.vouches++;v.ratingTotal+=x.rating;hosts.set(x.hostId,v);}
  const lines=[...hosts].sort((a,b)=>b[1].minutes-a[1].minutes).slice(0,10).map(([id,x],i)=>`${i+1}. <@${id}> — ${x.minutes} min, ${x.games} games, ${x.vouches} vouches${x.vouches?`, ★ ${(x.ratingTotal/x.vouches).toFixed(1)}`:''}`);
  return interaction.reply({content:lines.join('\n')||'No host activity yet.',allowedMentions:{parse:[]}});
 }
};
