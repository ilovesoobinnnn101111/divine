import {eligibleBooster} from './boosterSecurity.js';
import { readRecords, withRecordLock } from './records.js';
import { farmConfig } from './config.js';
import { requestManager, postBoostTicketUpdate, safeRequest } from './boostRequests.js';

export async function updateBoosterProgress(client, interaction, id, action, note='') {
 if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId!==process.env.TEST_GUILD_ID)) return {error:'Test server only.'};
 if (!client.db?.isAvailable?.()) return {error:'PostgreSQL unavailable.'};
 if (!/^ORD-\d{17,20}$/.test(id) || !['start','complete','note'].includes(action)) return {error:'Invalid order or action.'};
 if (action==='note' && note.trim().length<3) return {error:'Progress notes must contain at least 3 characters.'};
 if (note.length>500) return {error:'Note is too long.'};
 let outcome='missing',order;
 await withRecordLock(client,interaction.guildId,'boosterOrders',async()=>{
  const rows=await readRecords(client,interaction.guildId,'boosterOrders');
  const index=rows.findIndex(o=>o.order_id===id);
  if(index<0)return;
  const prev=rows[index];
  if(prev.booster_id!==interaction.user.id&&!requestManager(interaction.member)){outcome='forbidden';return;}
  if(!requestManager(interaction.member)&&!await eligibleBooster(interaction.guild,interaction.user.id,prev.category)){outcome='forbidden';return;}
  if(!requestManager(interaction.member)&&prev.assignment_response&&prev.assignment_response!=='Accepted'){outcome='unconfirmed';return;}
  if(!['Pending','In Progress'].includes(prev.status)){outcome='closed';return;}
  if(action==='start'&&prev.status!=='Pending'){outcome='already';return;}
  if(action==='complete'&&prev.status!=='In Progress'){outcome='notstarted';return;}
  const now=Date.now(),status=action==='start'?'In Progress':action==='complete'?'Completed':prev.status;
  const history=[...(prev.status_history||[])];
  if(action!=='note')history.push({status,timestamp:now,by:interaction.user.id,notes:note||undefined});
  const notes=[...(prev.progress_notes_history||[])];
  if(note)notes.push({timestamp:now,by:interaction.user.id,note});
  order={...prev,status,status_history:history,progress_notes_history:notes,updated_at:now};
  if(action==='complete')order.completed_at=now;
  rows[index]=order;
  await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:boosterOrders`,rows);
  outcome='saved';
 });
 const errors={unconfirmed:'Accept your assignment using /boosterrespond before updating progress. Declined assignments require manager review.',missing:'Order not found.',forbidden:'Only the assigned booster or a Booster Manager can update this order.',closed:'This order is already closed.',already:'Order already started.',notstarted:'Start the order before completing it.'};
 if(outcome!=='saved')return {error:errors[outcome]||'Unable to update order.'};
 const label=action==='start'?'🔵 In Progress':action==='complete'?'✅ Completed':'📝 Progress Note';
 let posted=false;
 if(order.request_id){
  try{
   const req=(await readRecords(client,interaction.guildId,'boostRequests')).find(r=>r.request_id===order.request_id);
   if(req)posted=await postBoostTicketUpdate(client,req,{
    title:`📋 Boost Order Update · ${label}`,
    description:`Order ${id}: ${label}${note?'\\nNote: '+safeRequest(note,500):''}`,
    color:action==='complete'?0x2ECC71:0x3498DB
   });
  }catch{}
 }
 if(action==='complete'&&order.customer_id){
  try{
   const customer=await client.users.fetch(order.customer_id);
   await customer.send({content:`✅ Your boost order ${id} has been marked Completed.${note?' Note: '+safeRequest(note,300):''}`,allowedMentions:{parse:[]}});
  }catch{}
 }
 return {order,label,posted};
}
