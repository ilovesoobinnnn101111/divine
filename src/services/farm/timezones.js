import { EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
const CHANNEL='1571956075018846230';
const HOST='1571956072896532673';
const zones=[['🇵🇱 Warsaw','Europe/Warsaw'],['🇸🇦 Dammam','Asia/Riyadh'],['🇧🇷 São Paulo','America/Sao_Paulo'],['🇸🇬 Singapore','Asia/Singapore'],['🇯🇵 Tokyo','Asia/Tokyo'],['🇦🇺 Sydney','Australia/Sydney']];
const CHECK='<:1CL_checkwhite:1575465471015260190>';
const CROSS='<:1CL_crosswhite:1575465528472903700>';
const TITLE='<:yg_exclaim:1573609297231876126>';
const guildId=()=>process.env.TEST_GUILD_ID || process.env.GUILD_ID;
export function timezoneEmbed(now=new Date()){
 const lines=zones.map(([city,timeZone])=>{
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',hourCycle:'h23'}).format(now));
 const time=new Intl.DateTimeFormat('en-US',{timeZone,hour:'numeric',minute:'2-digit',hour12:true}).format(now);
 return '<:x_whitearrow:1575129831988002968> **'+city+'** <a:1z_2whitestar:1575070645174272001>\n<:UtilityArrow:1575069345321582662> '+time+' '+(hour<7?CHECK:CROSS);
 });
 return new EmbedBuilder().setColor(0xFFFFFF).setDescription('## <a:001_sparkles:1575070315724279918> Auto Timezone Update '+TITLE+'\n\n'+CHECK+' **Recommended servers to queue on** <:gwhiteheart:1575080015794536510>\n'+CROSS+' **Servers to avoid** <a:a_exclaim:1575468321279844376>\n\n'+lines.join('\n\n')).setFooter({text:'Auto-updated every hour • Recommended queue window: 12 AM–7 AM local time'}).setTimestamp(now);
}
export function manualTimezoneEmbed(now=new Date()){
 const arrow='<:x_whitearrow:1575129831988002968>';
 const sparkle='<:white_sparkle:1575071348173316216>';
 const check='<:1CL_checkwhite:1575465471015260190>';
 const cross='<:1CL_crosswhite:1575465528472903700>';
 const ordered=[1,3,5,4,2,0];
 const lines=ordered.map((index,i)=>{
 const [label,timeZone]=zones[index];
 const city=label.split(' ').slice(1).join(' ');
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',hourCycle:'h23'}).format(now));
 const time=new Intl.DateTimeFormat('en-US',{timeZone,hour:'2-digit',minute:'2-digit',hour12:true}).format(now);
 return (i%2===0?sparkle:arrow)+' **'+city+':** '+time+' '+(hour<7?check:cross);
 });
 return new EmbedBuilder().setColor(0xFFFFFF).setDescription('## <a:awhitestars:1575465312005136539> Global Time Zone\nCurrent local times for popular farming regions\n\n'+arrow+' **Current Local Times**\n'+lines.join('\n')+'\n\n<:gwhitefly:1573946548956569737> **Time Status**\n'+arrow+' '+check+' **Check:** Midnight to 7 AM (Prime farming hours)\n'+sparkle+' '+cross+' **X:** Outside prime farming hours').setFooter({text:'Use /timein to check current global times'}).setTimestamp(now);
}
const cooldown=new Map();
export async function handleTimezoneMessage(message){
 if(message.content.trim().toLowerCase()!=='!timezone'||message.guild.id!==guildId())return false;
 if(!message.member?.roles.cache.has(HOST)){await message.reply({content:'Host role required.',allowedMentions:{repliedUser:false}});return true;}
 const now=Date.now();
 if(now-(cooldown.get(message.author.id)||0)<15000)return true;
 cooldown.set(message.author.id,now);
 await message.channel.send({embeds:[manualTimezoneEmbed()],allowedMentions:{parse:[]}});
 return true;
}
let started=false;
export function startTimezoneUpdates(client){
 if(started||!guildId())return;
 started=true;
 const post=async()=>{
 try{
 const channel=await client.channels.fetch(process.env.TIMEZONE_CHANNEL_ID || CHANNEL);
 if(channel?.guildId!==guildId()||!channel.isTextBased()||!channel.isSendable())throw Error('Timezone channel unavailable in configured guild');
 const recent=await channel.messages.fetch({limit:30});
 if(recent.some(m=>m.author.id===client.user.id&&Math.floor(Date.now()/3600000)===Math.floor(m.createdTimestamp/3600000)&&m.embeds.some(e=>e.description?.includes('Auto Timezone Update'))))return;
 await channel.send({embeds:[timezoneEmbed()],allowedMentions:{parse:[]}});
 }catch(error){logger.error('Timezone update failed:',error);}
 };
 const schedule=()=>{const delay=3600000-Date.now()%3600000;setTimeout(async()=>{await post();schedule();},delay);};
 void post().finally(schedule);
}
