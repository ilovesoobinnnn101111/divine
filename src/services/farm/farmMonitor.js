import { getActiveFarm, saveActiveFarm, farmDuration, farmSlots, refreshFarmMessage, completeFarm } from './sessionService.js';
import { withRecordLock } from './records.js';
import { logger } from '../../utils/logger.js';
let started=false;
export function startFarmMonitor(client){
 if(started)return;
 started=true;
 const guildId=process.env.TEST_GUILD_ID||process.env.GUILD_ID;
 if(!guildId)return;
 const tick=async()=>{
 try{await withRecordLock(client,guildId,'activeMonitor',async()=>{
 if(!client.db?.isAvailable?.())return;
 const session=await getActiveFarm(client,guildId);
 if(!session)return;
 if(!session.fullStartedAt&&farmSlots(session)>=12){session.fullStartedAt=Date.now();await saveActiveFarm(client,guildId,session);}
 if(!session.fullStartedAt)return;
 const elapsed=Date.now()-session.fullStartedAt;
 const duration=farmDuration(session.type);
 const channel=await client.channels.fetch(session.channelId);
 const ids=[...new Set([session.hostId,...session.players])];
 if(elapsed>=duration*60000){
 await completeFarm(client,guildId,session,'COMPLETED');
 session.completed=true;
 await refreshFarmMessage(client,session);
 await channel.send({content:'**Farm completed!** '+ids.map(id=>'<@'+id+'>').join(' '),allowedMentions:{parse:[],users:ids}});
 return;
 }
 const interval=Math.floor(elapsed/900000);
 if(interval>(session.lastReminder||0)){
 session.lastReminder=interval;
 await saveActiveFarm(client,guildId,session);
 await channel.send({content:'**Farm reminder — '+Math.ceil((duration*60000-elapsed)/60000)+' minutes remaining.** '+ids.map(id=>'<@'+id+'>').join(' '),allowedMentions:{parse:[],users:ids}});
 }
 await refreshFarmMessage(client,session);
 });}catch(error){logger.error('Farm monitor failed:',error);}
 finally{setTimeout(tick,15000);}
 };
 void tick();
}
