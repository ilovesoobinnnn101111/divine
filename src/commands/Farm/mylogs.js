import { SlashCommandBuilder, MessageFlags, EmbedBuilder, escapeMarkdown } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
const quotas=[['1571956072896532676',5],['1571956072896532677',7],['1571956072896532678',9],['1571956072896532679',11],['1571956072913178624',13],['1571956072913178625',15],['1571956072913178626',5]];
const check='<:1CL_checkwhite:1575465471015260190>', cross='<:1CL_crosswhite:1575465528472903700>', sparkle='<a:001_sparkles:1575070315724279918>', butterfly='<:gs_white_butterfly:1573946745577279608>', arrow='<:x_whitearrow:1575129831988002968>', cat='<:qw_pwhitekat:1575470985405010022>';
const format=m=>Math.floor(m/60)+'h '+Math.floor(m%60)+'m';
export default {
 data:new SlashCommandBuilder().setName('mylogs').setDescription('View your host quota and logged hours'),
 async execute(interaction,guildConfig,client){
 if(!interaction.inGuild())return interaction.reply({content:'Server only.',flags:MessageFlags.Ephemeral});
 await interaction.deferReply({flags:MessageFlags.Ephemeral});
 const member=await interaction.guild.members.fetch(interaction.user.id);
 const role=quotas.filter(([id])=>member.roles.cache.has(id)).sort((a,b)=>b[1]-a[1])[0];
 const now=new Date(), week=new Date(now);week.setUTCHours(0,0,0,0);week.setUTCDate(week.getUTCDate()-(week.getUTCDay()+6)%7);
 const mine=x=>x.hostId===member.id||x.cohostId===member.id;
 const logs=(await readRecords(client,interaction.guildId,'hostLogs')).filter(mine);
 const sum=rows=>rows.reduce((s,x)=>s+(Number.isFinite(x.minutes)&&x.minutes>0?x.minutes:0),0);
 const weekly=sum(logs.filter(x=>x.timestamp>=week.getTime()&&x.timestamp<=now.getTime()));
 const sessions=(await readRecords(client,interaction.guildId,'completedSessions')).filter(x=>x.hostId===member.id||x.coHostId===member.id).filter(x=>x.endedAt>=week.getTime()&&x.endedAt<=now.getTime());
 const status=role?(weekly>=role[1]*60?check+' Met Quota':cross+' Not Met'):'No quota assigned';
 const embed=new EmbedBuilder().setColor(0xFFFFFF).setThumbnail(member.displayAvatarURL()).setDescription('## '+sparkle+' Quota Status - '+escapeMarkdown(member.displayName)).addFields(
 {name:butterfly+' Rank',value:role?escapeMarkdown(member.roles.cache.get(role[0]).name):'Unassigned',inline:true},
 {name:sparkle+' Weekly Time',value:format(weekly)+' / '+(role?role[1]+'h':'N/A'),inline:true},
 {name:sparkle+' Status',value:status,inline:true},
 {name:cat+' Farm Breakdown (weekly)',value:check+' **Completed:** '+sessions.filter(x=>x.reason==='COMPLETED').length+'\n'+cross+' **Early Ends:** '+sessions.filter(x=>x.reason==='EARLY').length+'\n'+arrow+' **Host logs:** '+logs.filter(x=>x.timestamp>=week.getTime()&&x.timestamp<=now.getTime()).length},
 {name:sparkle+' Total Lifetime Hours',value:'**'+format(sum(logs))+'**'}
 ).setFooter({text:'Week of '+week.toLocaleDateString('en-US',{timeZone:'UTC',month:'long',day:'numeric',year:'numeric'})+' (UTC)'}).setTimestamp(now);
 return interaction.editReply({embeds:[embed],allowedMentions:{parse:[]}});
 }
};
