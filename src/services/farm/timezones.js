import { EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
const CHANNEL='1571956075018846230';
const HOST='1571956072896532673';
const zones=[['Warsaw','Europe/Warsaw'],['Dammam','Asia/Riyadh'],['São Paulo','America/Sao_Paulo'],['Singapore','Asia/Singapore'],['Tokyo','Asia/Tokyo'],['Sydney','Australia/Sydney']];
const CHECK='<a:32423check:1575061549008167085>';
const CROSS='<:X_:1575061409140707368>';
const TITLE='<:yg_exclaim:1573609297231876126>';
const guildId=()=>process.env.TEST_GUILD_ID || process.env.GUILD_ID;
export function timezoneEmbed(now=new Date()){
 const lines=zones.map(([city,timeZone])=>{
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',hourCycle:'h23'}).format(now));
 const time=new Intl.DateTimeFormat('en-US',{timeZone,hour:'numeric',minute:'2-digit',hour12:true}).format(now);
 return '**'+city+'**\n**'+time+'** '+(hour<8?CHECK:CROSS);
 });
 return new EmbedBuilder().setColor(0xFFFFFF).setDescription('# '+TITLE+' **Auto Timezone Update**\n\n'+lines.join('\n\n')).setFooter({text:'Auto-updated every hour • Recommended queue window: 12 AM–8 AM local time'}).setTimestamp(now);
}
const cooldown=new Map();
export async function handleTimezoneMessage(message){
 if(message.content.trim().toLowerCase()!=='!timezone'||message.guild.id!==guildId())return false;
 if(!message.member?.roles.cache.has(HOST)){await message.reply({content:'Host role required.',allowedMentions:{repliedUser:false}});return true;}
 const now=Date.now();
 if(now-(cooldown.get(message.author.id)||0)<15000)return true;
 cooldown.set(message.author.id,now);
 await message.channel.send({embeds:[timezoneEmbed()],allowedMentions:{parse:[]}});
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
 if(recent.some(m=>m.author.id===client.user.id&&Date.now()-m.createdTimestamp<3600000&&m.embeds.some(e=>e.description?.includes('Auto Timezone Update'))))return;
 await channel.send({embeds:[timezoneEmbed()],allowedMentions:{parse:[]}});
 }catch(error){logger.error('Timezone update failed:',error);}
 };
 const schedule=()=>{const delay=3600000-Date.now()%3600000;setTimeout(async()=>{await post();schedule();},delay);};
 void post().finally(schedule);
}
