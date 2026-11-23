import { appendRecord } from './records.js';

const valid=id=>/^\d{17,20}$/.test(String(id||''));
const clean=(value,max=500)=>String(value??'').replace(/[\x00-\x1F\x7F]/g,' ').replace(/<@/g,'<\\@').slice(0,max);

/** Delivery failure never rolls back an already saved order change. */
export async function notifyBooster(client,guildId,{orderId,recipientId,type,message}){
 const attempt={notification_id:`NOT-${Date.now()}-${Math.random().toString(36).slice(2,10)}`,
  order_id:orderId,recipient_id:recipientId||null,type,created_at:Date.now(),status:'Failed',error:null};
 if(!valid(recipientId))attempt.error='No valid assigned booster';
 else{
  try{
   const user=await client.users.fetch(recipientId);
   await user.send({content:clean(message,1800),allowedMentions:{parse:[]}});
   attempt.status='Delivered';
  }catch(error){attempt.error=clean(error?.message||'Discord DM unavailable',250);}
 }
 try{await appendRecord(client,guildId,'boosterNotifications',attempt);}
 catch(error){console.error('Could not save booster notification delivery history:',error);}
 return attempt;
}
export const notificationText=(heading,order,extra='')=>`${heading}\nOrder: ${clean(order.order_id,45)}\nBoost: ${clean(order.hero,120)}\nLevel: ${clean(order.level,100)}\nStatus: ${clean(order.status,50)}${extra?'\n'+clean(extra,500):''}`;
