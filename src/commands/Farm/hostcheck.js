import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { readRecords, isManager } from '../../services/farm/records.js';
export default {
 data:new SlashCommandBuilder().setName('hostcheck').setDescription('Review hosting activity over the past 7 days (managers only)'),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()||!isManager(interaction.member)) return interaction.reply({content:'Manager role required.',flags:MessageFlags.Ephemeral});
  const logs=(await readRecords(client,interaction.guildId,'hostLogs')).filter(x=>x.timestamp>Date.now()-7*86400000);
  const byHost=new Map();
  for(const x of logs){const prev=byHost.get(x.hostId)||{count:0,minutes:0,games:0};prev.count++;prev.minutes+=x.minutes;prev.games+=x.games;byHost.set(x.hostId,prev);}
  const lines=[...byHost].sort((a,b)=>b[1].minutes-a[1].minutes).slice(0,20).map(([id,x])=>`<@${id}>: ${x.count} sessions, ${x.minutes} min, ${x.games} games`);
  return interaction.reply({content:lines.join('\n')||'No sessions logged in the past 7 days.',flags:MessageFlags.Ephemeral});
 }
};
