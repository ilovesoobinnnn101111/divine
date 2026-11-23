import { MessageFlags } from 'discord.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig } from '../../services/farm/config.js';
import { requestManager, safeRequest } from '../../services/farm/boostRequests.js';

const key=(guild,kind)=>`${farmConfig.databasePrefix}${guild}:${kind}`;
export default {
 name:'boostcancelrequest',
 async execute(interaction,client,args){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))
   return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  if(!requestManager(interaction.member))return interaction.reply({content:'Booster Manager role required.',flags:MessageFlags.Ephemeral});
  if(!client.db?.isAvailable?.())return interaction.reply({content:'PostgreSQL unavailable.',flags:MessageFlags.Ephemeral});
  const [action,id]=args;
  if(!['approve','deny'].includes(action)||!/^REQ-\d{17,20}$/.test(id))
   return interaction.reply({content:'Invalid cancellation action.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  let outcome='missing',req,order;
  try {
   await withRecordLock(client,interaction.guildId,'boostRequests',async()=>{
    const requests=await readRecords(client,interaction.guildId,'boostRequests');
    const ix=requests.findIndex(r=>r.request_id===id);
    if(ix<0)return;
    const current=requests[ix];
    if(current.status!=='Accepted'||current.cancellation_request?.status!=='Pending'){outcome='reviewed';return;}
    if(action==='approve'){
     await withRecordLock(client,interaction.guildId,'boosterOrders',async()=>{
      const orders=await readRecords(client,interaction.guildId,'boosterOrders');
      const oi=orders.findIndex(o=>o.request_id===id&&o.customer_id===current.customer_id);
      if(oi<0){outcome='noorder';return;}
      const previous=orders[oi];
      if(!['Pending','In Progress'].includes(previous.status)){outcome='closed';return;}
      const now=Date.now(),reason=current.cancellation_request.reason;
      order={...previous,status:'Cancelled',cancelled_at:now,cancelled_by:interaction.user.id,
       cancellation_reason:reason,updated_at:now,
       status_history:[...(previous.status_history||[]),{status:'Cancelled',timestamp:now,by:interaction.user.id,notes:reason}],
       cancellation_history:[...(previous.cancellation_history||[]),{timestamp:now,by:interaction.user.id,reason,previous_status:previous.status,customer_requested:true}]};
      orders[oi]=order;await client.db.set(key(interaction.guildId,'boosterOrders'),orders);
     });
     if(!order)return;
    }
    const now=Date.now();
    req={...current,status:action==='approve'?'Cancelled':current.status,
     cancellation_request:{...current.cancellation_request,status:action==='approve'?'Approved':'Denied',reviewed_by:interaction.user.id,reviewed_at:now},
     updated_at:now};
    requests[ix]=req;
    await client.db.set(key(interaction.guildId,'boostRequests'),requests);
    outcome='saved';
   });
  }catch{return interaction.editReply('Database error. Please check the order status before trying again.');}
  if(outcome!=='saved')return interaction.editReply(outcome==='reviewed'?'This cancellation request was already reviewed.':outcome==='closed'?'Order is no longer active; cancellation was not applied.':outcome==='noorder'?'Linked order not found; cancellation was not applied.':'Cancellation request not found.');
  await interaction.message.edit({components:[],embeds:interaction.message.embeds.map(e=>{
   const data=e.toJSON();return {...data,color:action==='approve'?0xE74C3C:0x95A5A6,footer:{text:`Cancellation ${action==='approve'?'approved':'denied'} by ${interaction.user.username}`}};
  }),allowedMentions:{parse:[]}}).catch(()=>{});
  try{
   const customer=await client.users.fetch(req.customer_id);
   await customer.send({content:action==='approve'
    ?`Your cancellation request for ${id} was approved. Order ${order.order_id} is now Cancelled.`
    :`Your cancellation request for ${id} was denied. Your boost order remains active.`,allowedMentions:{parse:[]}});
  }catch{}
  if(order?.booster_id){
   try{
    const booster=await client.users.fetch(order.booster_id);
    await booster.send({content:`Order ${order.order_id} was cancelled following a customer request approved by a manager. Reason: ${safeRequest(req.cancellation_request.reason,250)}`,allowedMentions:{parse:[]}});
   }catch{}
  }
  return interaction.editReply(action==='approve'
   ?`✅ Cancellation approved. Order \`${order.order_id}\` and request \`${id}\` are now Cancelled.`
   :`❎ Cancellation denied for \`${id}\`. The order remains active.`);
 }
};
