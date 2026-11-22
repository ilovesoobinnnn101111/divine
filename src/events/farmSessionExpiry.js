import { Events } from 'discord.js';
import { getActiveFarm, completeFarm } from '../services/farm/sessionService.js';
import { farmConfig } from '../services/farm/config.js';

export default {
 name:Events.ClientReady,
 async execute(client){
  const expire=async()=>{
   if(!farmConfig.guildId||!client.db?.isAvailable?.()) return;
   const session=await getActiveFarm(client,farmConfig.guildId);
   if(!session||Date.now()-session.startedAt<3600000) return;
   await completeFarm(client,farmConfig.guildId,session,'EXPIRED');
   const channel=await client.channels.fetch(session.channelId).catch(()=>null);
   const message=await channel?.messages.fetch(session.messageId).catch(()=>null);
   if(message) await message.edit({content:'Farm session ended automatically after one hour.',embeds:[],components:[]}).catch(()=>{});
  };
  await expire();
  const interval=setInterval(()=>expire().catch(error=>console.error('Farm expiry failed:',error)),60000);
  interval.unref?.();
 }
};
