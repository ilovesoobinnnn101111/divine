import { getActiveFarms, getActiveFarm, saveActiveFarm, farmDuration, farmSlots, refreshFarmMessage, completeFarm, syncFarmListing } from './sessionService.js';
import { withRecordLock } from './records.js';
import { farmConfig } from './config.js';
import { logger } from '../../utils/logger.js';
let started=false;
export async function tickFarmMonitor(client,guildId){
 if(!client.db?.isAvailable?.())return;
 await withRecordLock(client,guildId,'activeMonitor',async()=>{
 for(const row of await getActiveFarms(client,guildId)){
 try{
 const session=await getActiveFarm(client,guildId,row.messageId);
 if(!session)continue;
 if(!session.fullStartedAt&&farmSlots(session)>=12){session.fullStartedAt=Date.now();await saveActiveFarm(client,guildId,session);}
 const elapsed=session.fullStartedAt?Math.max(0,Date.now()-session.fullStartedAt):0;
 const duration=farmDuration(session.type);
 const ids=[...new Set([session.hostId,...session.players])];
 if(session.fullStartedAt&&elapsed>=duration*60000){
 if(await completeFarm(client,guildId,session,'COMPLETED')===false)continue;
 session.completed=true;
 await refreshFarmMessage(client,session);
 const channel=await client.channels.fetch(session.channelId);
 await channel.send({content:'**Farm completed!** '+ids.map(id=>'<@'+id+'>').join(' '),allowedMentions:{parse:[],users:ids}});
 continue;
 }
 const interval=Math.floor(elapsed/900000);
 if(interval>(session.lastReminder||0)){
 const channel=await client.channels.fetch(session.channelId);
 await channel.send({content:'**Farm reminder — '+Math.ceil((duration*60000-elapsed)/60000)+' minutes remaining.** '+ids.map(id=>'<@'+id+'>').join(' '),allowedMentions:{parse:[],users:ids}});
 session.lastReminder=interval;
 await saveActiveFarm(client,guildId,session);
 }
 await Promise.all([refreshFarmMessage(client,session),syncFarmListing(client,guildId,session)]);
 }catch(error){logger.error('Farm monitor session failed:',error);}
 }
 });
}
export function startFarmMonitor(client){
 if(started)return;
 started=true;
 const guildId=farmConfig.guildId||process.env.TEST_GUILD_ID;
 if(!guildId)return;
 const tick=async()=>{
 try{await tickFarmMonitor(client,guildId);}
 catch(error){logger.error('Farm monitor failed:',error);}
 finally{setTimeout(tick,15000).unref?.();}
 };
 void tick();
}
