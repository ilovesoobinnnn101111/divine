import {eligibleBooster} from './boosterSecurity.js';
import {readRecords,withRecordLock} from './records.js';
import {farmConfig} from './config.js';
import {availabilityRows,availabilityOf} from './boosterAvailability.js';
const valid=id=>/^\d{17,20}$/.test(String(id||''));
export async function workloadSettings(client,guildId){
 const rows=await readRecords(client,guildId,'boosterWorkloadLimits');
 return rows;
}
export function limitFor(rows,id){return rows.find(x=>x.booster_id===id)?.limit??null;}
export async function setWorkloadLimit(client,guildId,id,limit,by){
 if(!valid(id)||!Number.isInteger(limit)||limit<0||limit>100)throw new Error('Invalid limit');
 await withRecordLock(client,guildId,'boosterWorkloadLimits',async()=>{
  const rows=await workloadSettings(client,guildId),index=rows.findIndex(x=>x.booster_id===id),now=Date.now();
  const old=index>=0?rows[index]:{booster_id:id,history:[]};
  const updated={...old,limit,updated_at:now,history:[...(old.history||[]),{from:old.limit??null,to:limit,by,timestamp:now}]};
  if(index<0)rows.push(updated);else rows[index]=updated;
  await client.db.set(`${farmConfig.databasePrefix}${guildId}:boosterWorkloadLimits`,rows);
 });
}
export async function workloadSnapshot(client,guildId,excludeOrderId=null,guild=null,category=null){
 const [orders,availability,limits]=await Promise.all([readRecords(client,guildId,'boosterOrders'),availabilityRows(client,guildId),workloadSettings(client,guildId)]);
 const counts=new Map();
 for(const o of orders)if(['Pending','In Progress'].includes(o.status)&&o.order_id!==excludeOrderId&&valid(o.booster_id))counts.set(o.booster_id,(counts.get(o.booster_id)||0)+1);
 const ids=new Set([...availability.map(x=>x.booster_id),...counts.keys(),...limits.map(x=>x.booster_id)].filter(valid));
 const people=[...ids].map(id=>({id,status:availabilityOf(availability,id),count:counts.get(id)||0,limit:limitFor(limits,id)}));
 const eligible=guild?(await Promise.all(people.map(async x=>await eligibleBooster(guild,x.id,category)?x:null))).filter(Boolean):people;
 const recommended=eligible.filter(x=>x.status==='Available'&&(x.limit===null||x.count<x.limit)).sort((a,b)=>a.count-b.count||a.id.localeCompare(b.id))[0]||null;
 return {people:eligible,recommended};
}
