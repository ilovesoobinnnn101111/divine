import { SlashCommandBuilder, EmbedBuilder, escapeMarkdown, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { readRecords } from './records.js';
const arrow='<:UtilityArrow:1575069345321582662>';
const star='<:awhitestar:1573946665520337017>';
export function vouchCommand(name,boost=false){
 return {
 data:new SlashCommandBuilder().setName(name).setDescription(boost?'View booster vouches':'View host vouch statistics').addUserOption(o=>o.setName(boost?'booster':'host').setDescription('Member to view (defaults to yourself)')).addIntegerOption(o=>o.setName('page').setDescription('Review page').setMinValue(1)),
 async execute(interaction,guildConfig,client){
 if(!interaction.inGuild())return interaction.reply('Server only.');
 await interaction.deferReply();
 const user=interaction.options.getUser(boost?'booster':'host')||interaction.user;
 const entries=(await readRecords(client,interaction.guildId,boost?'boostVouches':'vouches')).filter(x=>(boost?x.boosterId:x.hostId)===user.id&&Number.isInteger(x.rating)&&x.rating>=1&&x.rating<=5).sort((a,b)=>b.timestamp-a.timestamp);
 const avg=entries.length?entries.reduce((s,x)=>s+x.rating,0)/entries.length:0;
 const size=5, pages=boost?1+Math.max(1,Math.ceil(entries.length/size)):1;
 let page=Math.min(pages,interaction.options.getInteger('page')||1);
 async function render(){
 const offset=Math.max(0,page-2)*size;
 const overview=boost&&page===1;
 const lines=[];
 if(overview){
 lines.push('**Vouch Statistics**\n> **Total Vouches:** '+entries.length+'\n> **Average Rating:** '+(entries.length?avg.toFixed(1)+'/5.0':'N/A')+'\n\n'+arrow+' **Recent Vouches**\n(Button below to check)');
 }else if(boost){
 for(const [i,v] of entries.slice(offset,offset+size).entries()){
 const reviewer=await client.users.fetch(v.voterId).catch(()=>null);
 lines.push(arrow+' **'+(offset+i+1)+'. '+escapeMarkdown(reviewer?.globalName||reviewer?.username||'Unknown member')+'**\n'+star.repeat(v.rating)+' **'+v.rating+'/5**\n> '+escapeMarkdown((v.comment||'No comment').slice(0,350)).replace(/\n/g,'\n> ')+'\n<t:'+Math.floor(v.timestamp/1000)+':D>');
 }
 }else{
 lines.push(entries.length?star.repeat(Math.round(avg))+' **'+avg.toFixed(1)+'/5**':'No ratings yet');
 }
 const embed=new EmbedBuilder().setColor(boost?0xFFFFFF:0xEBCDDC).setThumbnail(user.displayAvatarURL()).setDescription('## Vouches for '+escapeMarkdown(user.globalName||user.username)+'\n\n'+(overview?'':arrow+' **'+(boost?'Recent Vouches':'Host Ratings')+'**\n')+(boost&&!overview&&entries.length?'Entries '+(offset+1)+'–'+Math.min(offset+size,entries.length)+' of '+entries.length+'\n\n':'')+(lines.join('\n\n')||'No vouches yet')).setFooter({text:'Vouch count: '+entries.length+' | Average: '+(entries.length?avg.toFixed(1)+'/5.0':'N/A')+(boost?' | Page '+page+'/'+pages:'')}).setTimestamp();
 if(overview&&/^https:\/\//i.test(process.env.BOOST_VOUCH_BANNER_URL||''))embed.setImage(process.env.BOOST_VOUCH_BANNER_URL);
 const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('boost_vouch_prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page===1),new ButtonBuilder().setCustomId('boost_vouch_next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page===pages));
 return {embeds:[embed],components:boost?[row]:[],allowedMentions:{parse:[]}};
 }
 const message=await interaction.editReply(await render());
 if(!boost)return;
 const collector=message.createMessageComponentCollector({componentType:ComponentType.Button,time:600000});
 collector.on('collect',async i=>{try{if(i.user.id!==interaction.user.id)return await i.reply({content:'Only the command requester can navigate.',ephemeral:true});await i.deferUpdate();page=Math.max(1,Math.min(pages,page+(i.customId==='boost_vouch_next'?1:-1)));await i.editReply(await render());}catch(error){console.error('Vouch navigation failed:',error);}});
 collector.on('end',()=>interaction.editReply({components:[]}).catch(()=>{}));
 }
 };
}
