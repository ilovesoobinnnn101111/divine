import { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, StringSelectMenuBuilder, escapeMarkdown } from 'discord.js';
import { rivalsRequest, getDefaultProfile, saveDefaultProfile } from './client.js';
const labels={profile:'Profile',overview:'Overview',livegame:'Live Game',proficiency:'Proficiency',matchhistory:'Match History',top500:'Top 500'};
const val=x=>x==null?'Unavailable':typeof x==='object'?'Unavailable':escapeMarkdown(String(x)).slice(0,200);
const rows=x=>Object.values(x||{}).filter(x=>x&&typeof x==='object');
const lines=(a)=>a.join('\n').slice(0,3900)||'No data returned.';
function embed(kind,r){
 const d=r.data;
 const e=new EmbedBuilder().setColor(0xffffff).setTitle((kind==='top500'?'Marvel Rivals':val(r.name))+' • '+labels[kind]).setFooter({text:'Divine • Unofficial provider data'}).setTimestamp();
 if(kind==='profile'||kind==='overview'){
 e.addFields({name:'UID',value:val(r.uid),inline:true},{name:'Level',value:val(d?.level),inline:true},{name:'XP',value:val(d?.xp),inline:true},{name:'Status',value:val(d?.status?.status)});
 const ranks=rows(d?.rank_game_season).slice(-8);
 e.addFields({name:'Reported rank records',value:lines(ranks.map(x=>'Rank '+val(x.rank_level??x.level)+' • Score '+val(x.rank_score)+' • Wins '+val(x.win_count))).slice(0,1024)});
 }else if(kind==='livegame'){
 if(!d)return e.setDescription('No active match reported by the provider.');
 const groups=new Map();
 for(const p of rows(d.players)){const side=String(p.side??p.team_id??'Unknown');if(!groups.has(side))groups.set(side,[]);groups.get(side).push('**'+val(p.name)+'** • Rank '+val(p.rank));}
 for(const [side,players] of groups)e.addFields({name:'Team '+val(side),value:lines(players).slice(0,1024)});
 e.setDescription('Live roster • ongoing combat statistics are unavailable.');
 }else if(kind==='proficiency'){
 const heroes=rows(d).flatMap(a=>Object.entries(a.hero_proficiency_infos||{})).sort((a,b)=>(b[1].proficiency_level??0)-(a[1].proficiency_level??0));
 e.setDescription(lines(heroes.map(([id,h])=>'**'+val(h.hero_name??('Hero '+id))+'** • Level '+val(h.proficiency_level)+' • '+val(h.proficiency_point)+' XP')));
 }else if(kind==='matchhistory'){
 e.setDescription(lines(rows(d?.matches).slice(0,10).map(m=>(m.is_win===true?'Win':m.is_win===false?'Loss':'Result unavailable')+' • '+val(m.map??m.map_id)+' • K/D/A '+[m.kills,m.deaths,m.assists].map(val).join('/'))));
 }else{
 e.setDescription(lines(rows(d?.players).slice(0,25).map(p=>'**#'+val(p.position)+' '+val(p.name)+'** • '+val(p.rank_score))));
 }
 return e;
}
export function command(kind){
 const data=new SlashCommandBuilder().setName(kind).setDescription(kind==='defaultprofile'?'Save your Marvel Rivals account':kind==='lookup'?'Look up Marvel Rivals statistics':'View Marvel Rivals '+labels[kind]);
 if(kind!=='top500')data.addStringOption(o=>o.setName('player').setDescription('Marvel Rivals username or UID').setMaxLength(100).setRequired(kind==='defaultprofile'));
 return {data,registrationScope:'guild',async execute(i,guildConfig,client){
 if(!i.inGuild())return i.reply({content:'Server only.',flags:MessageFlags.Ephemeral});
 await i.deferReply({flags:MessageFlags.Ephemeral});
 try{
 let player=i.options.getString('player')?.trim();
 if(!player&&kind!=='top500')player=(await getDefaultProfile(client,i.guildId,i.user.id))?.uid;
 if(!player&&kind!=='top500')return i.editReply('Enter a username or UID, or use /defaultprofile first.');
 if(kind==='defaultprofile'){
 const p=await saveDefaultProfile(client,i.guildId,i.user.id,await rivalsRequest('profile',player));
 return i.editReply({embeds:[new EmbedBuilder().setColor(0xffffff).setTitle('Default profile saved').setDescription(val(p.name)+' • '+val(p.uid))],allowedMentions:{parse:[]}});
 }
 if(kind==='lookup'){
 const r=await rivalsRequest('profile',player);
 const menu=new StringSelectMenuBuilder().setCustomId('rivals_lookup_'+i.id).setPlaceholder('Choose statistics').addOptions(Object.entries(labels).filter(([k])=>k!=='overview').map(([value,label])=>({value,label})));
 const components=[new ActionRowBuilder().addComponents(menu)];
 const msg=await i.editReply({embeds:[embed('profile',r)],components,allowedMentions:{parse:[]}});
 const collector=msg.createMessageComponentCollector({filter:x=>x.customId===menu.data.custom_id&&x.user.id===i.user.id,time:120000});
 collector.on('collect',async x=>{try{await x.deferUpdate();const k=x.values[0];await x.editReply({embeds:[embed(k,await rivalsRequest(k,k==='top500'?'':r.uid))],components,allowedMentions:{parse:[]}});}catch{await x.followUp({content:'Statistics unavailable. Try again later.',flags:MessageFlags.Ephemeral}).catch(()=>{});}});
 collector.on('end',()=>i.editReply({components:[]}).catch(()=>{}));
 return;
 }
 return i.editReply({embeds:[embed(kind,await rivalsRequest(kind==='overview'?'profile':kind,player))],allowedMentions:{parse:[]}});
 }catch{return i.editReply({content:'Statistics unavailable or player not found. Please try again later.',components:[]});}
 }};
}
