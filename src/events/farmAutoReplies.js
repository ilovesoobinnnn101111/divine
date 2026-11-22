import { Events } from 'discord.js';
import { getActiveFarm } from '../services/farm/sessionService.js';
import { farmConfig } from '../services/farm/config.js';
const cooldown=new Map();
export default {
 name:Events.MessageCreate,
 async execute(message,client){
  if(message.author.bot||!message.guild||!farmConfig.guildId||message.guild.id!==farmConfig.guildId) return;
  const session=await getActiveFarm(client,message.guild.id);
  if(!session) return;
  const inFarmChannel=message.channelId===session.channelId;
  const inFarmVoice=Boolean(session.voiceChannelId&&message.member?.voice?.channelId===session.voiceChannelId);
  if(!inFarmChannel&&!inFarmVoice) return;
  const content=message.content.toLowerCase().trim();
  const join=/\\b(join|joining|spot|slots|room|invite)\\b/i.test(content);
  const time=/\\b(time|long|remaining|left|finish|end)\\b/i.test(content);
  if(!join&&!time) return;
  const key=`${message.channelId}:${message.author.id}`;
  if((cooldown.get(key)||0)>Date.now()) return;
  cooldown.set(key,Date.now()+30000);
  if(cooldown.size>500) for(const [k,v] of cooldown) if(v<Date.now()) cooldown.delete(k);
  const spots=Math.max(0,12-(1+session.altAccounts+session.players.length));
  const remaining=Math.max(0,Math.ceil((session.startedAt+3600000-Date.now())/60000));
  const answer=join?`There are ${spots} spots left. Use the Join button in <#${session.channelId}>.`:`This farm has about ${remaining} minute(s) remaining.`;
  await message.reply({content:answer,allowedMentions:{repliedUser:false}}).catch(()=>{});
 }
};
