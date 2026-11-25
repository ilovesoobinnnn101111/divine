import { EmbedBuilder } from 'discord.js';
import { notifyBooster, notificationText } from './boosterNotifications.js';
import { readRecords, withRecordLock } from './records.js';
import { farmConfig } from './config.js';

const HOUR=3600000;
const managerRole=()=>String(process.env.BOOSTER_MANAGER_ROLE_ID||'').split(',').map(x=>x.trim()).find(x=>/^\d{17,20}$/.test(x));
const validId=id=>/^\d{17,20}$/.test(String(id||''));
const time=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:null;};
const safe=value=>String(value??'Unknown').replace(/[\x00-\x1F\x7F]/g,' ').replace(/<@/g,'<\\@').replace(/[*_`~|]/g,' ').slice(0,150);
const activity=order=>Math.max(0,...[order.created_at,order.updated_at,
 ...(Array.isArray(order.status_history)?order.status_history.map(x=>x.timestamp):[]),
 ...(Array.isArray(order.progress_notes_history)?order.progress_notes_history.map(x=>x.timestamp):[])
].map(time).filter(Boolean));
function issues(order,now){
 if(!['Pending','In Progress'].includes(order.status))return [];
 const found=[];
 const due=time(order.deadline_at);
 if(due&&due<=now)found.push({kind:'overdue',signature:String(due),label:'🔴 Overdue deadline'});
 else if(due&&due-now<=24*HOUR)found.push({kind:'due24',signature:String(due),label:'⏰ Deadline within 24 hours'});
 if(!validId(order.booster_id))found.push({kind:'unassigned',signature:'unassigned',label:'👤 Booster needed'});
 const assigned=Math.max(0,time(order.created_at)||0,...(Array.isArray(order.reassignment_history)?order.reassignment_history.map(x=>time(x.timestamp)||0):[]));
 if(validId(order.booster_id)&&assigned&&order.assignment_response==='Awaiting Confirmation'){
  const signature=order.booster_id+':'+assigned;
  if(now-assigned>=30*60000)found.push({kind:'confirmation_dm',signature,label:'Assignment confirmation reminder'});
  if(now-assigned>=60*60000)found.push({kind:'confirmation_overdue',signature,label:'⚠️ Assignment awaiting confirmation for 60 minutes'});
 }
 const last=activity(order);
 if(order.status==='In Progress'&&last&&now-last>=48*HOUR)
  found.push({kind:'stalled',signature:String(last),label:'🕒 No progress for 48 hours'});
 return found;
}
export async function scanBoosterOrderAlerts(client){
 const guildId=process.env.TEST_GUILD_ID;
 const channelId=process.env.BOOSTER_ALERT_CHANNEL_ID||process.env.BOOST_REQUEST_CHANNEL_ID;
 if(!guildId||!validId(channelId)||!client.db?.isAvailable?.())return {skipped:'Configuration or database unavailable'};
 const channel=await client.channels.fetch(channelId).catch(()=>null);
 if(!channel?.send||channel.guildId!==guildId)return {skipped:'Alert channel missing or not in test guild'};
 const orders=await readRecords(client,guildId,'boosterOrders');
 const now=Date.now(),current=new Map();
 for(const order of orders){
  if(!/^ORD-\d{17,20}$/.test(String(order.order_id)))continue;
  for(const issue of issues(order,now))current.set(`${order.order_id}:${issue.kind}`,{order,issue});
 }
 let sent=0,failed=0;
 await withRecordLock(client,guildId,'boosterAutoAlertState',async()=>{
  const key=`${farmConfig.databasePrefix}${guildId}:boosterAutoAlertState`;
  const old=await client.db.get(key,{});
  const state=old&&typeof old==='object'&&!Array.isArray(old)?old:{};
  const next={};
  for(const [id,{order,issue}] of current){
   if(state[id]===issue.signature){next[id]=issue.signature;continue;}
   if(issue.kind==='confirmation_dm'){
    const delivery=await notifyBooster(client,guildId,{orderId:order.order_id,recipientId:order.booster_id,type:'confirmation_reminder',message:notificationText('⏰ Please confirm your Divine assignment',order,'Use /boosterrespond in the server to accept or decline your assignment.')});
    // Record one attempt per assignment, including blocked DMs; managers still receive escalation.
    next[id]=issue.signature;
    if(delivery.status==='Delivered')sent++;else failed++;
    await client.db.set(key,{...state,...next});
    continue;
   }
   const due=time(order.deadline_at);
   const embed=new EmbedBuilder().setColor(issue.kind==='overdue'?0xE74C3C:0xE67E22)
    .setTitle(issue.label)
    .setDescription(`**Order:** \`${safe(order.order_id)}\`\n**Status:** ${safe(order.status)}\n**Boost:** ${safe(order.hero)}\n**Booster:** ${validId(order.booster_id)?`<@${order.booster_id}>`:'Unassigned'}\n**Deadline:** ${due?`<t:${Math.floor(due/1000)}:F>`:'Not set'}`)
    .setFooter({text:'Automated booster order monitoring'}).setTimestamp();
   try{
    const role=managerRole();
    await channel.send({content:role?`<@&${role}>`:'Booster Manager alert',embeds:[embed],
     allowedMentions:{parse:[],roles:role?[role]:[]}});
    next[id]=issue.signature;sent++;
    await client.db.set(key,{...state,...next});
   }catch(error){failed++;if(state[id]!==undefined)next[id]=state[id];console.error('Booster alert send failed:',error);}
  }
  await client.db.set(key,next);
 });
 return {sent,failed,active:current.size};
}
export function startBoosterOrderAlertMonitor(client){
 if(client.boosterAlertMonitor)return;
 const run=async()=>{
  if(client.boosterAlertScanRunning)return;
  client.boosterAlertScanRunning=true;
  try{await scanBoosterOrderAlerts(client);}
  catch(error){console.error('Booster alert scan failed:',error);}
  finally{client.boosterAlertScanRunning=false;}
 };
 void run();
 client.boosterAlertMonitor=setInterval(()=>void run(),15*60*1000);
 client.boosterAlertMonitor.unref?.();
}
