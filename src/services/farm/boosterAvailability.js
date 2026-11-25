import { readRecords, withRecordLock } from './records.js';
import { farmConfig } from './config.js';
export const availabilityStatuses=['Available','Busy','Offline'];
export async function availabilityRows(client,guildId){return readRecords(client,guildId,'boosterAvailability');}
export function availabilityOf(rows,userId){return rows.find(r=>r.booster_id===userId)?.status||'Not Set';}
export async function setBoosterAvailability(client,guildId,userId,status){
 if(!availabilityStatuses.includes(status))throw new Error('Invalid availability');
 let updated;
 await withRecordLock(client,guildId,'boosterAvailability',async()=>{
  const rows=await availabilityRows(client,guildId),index=rows.findIndex(r=>r.booster_id===userId),now=Date.now();
  const previous=index>=0?rows[index]:{booster_id:userId,status:'Not Set',history:[]};
  updated={...previous,status,updated_at:now,history:[...(previous.history||[]),{from:previous.status,to:status,timestamp:now,by:userId}]};
  if(index>=0)rows[index]=updated;else rows.push(updated);
  await client.db.set(`${farmConfig.databasePrefix}${guildId}:boosterAvailability`,rows);
 });
 return updated;
}
export const availabilityIcon=status=>({Available:'🟢',Busy:'🟡',Offline:'🔴','Not Set':'⚪'}[status]||'⚪');
