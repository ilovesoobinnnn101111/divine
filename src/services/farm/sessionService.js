import { postReviewPanel } from './reviews.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { farmConfig, memberHasFarmRole } from './config.js';
import { appendRecord, withRecordLock } from './records.js';

const key = guildId => `${farmConfig.databasePrefix}${guildId}:active`;

export function canHost(member) {
  return memberHasFarmRole(member, [...farmConfig.roles.host, ...farmConfig.roles.manager]);
}

export async function getActiveFarms(client,guildId){
 const value=await client.db.get(key(guildId),null);
 return Array.isArray(value)?value:value?[value]:[];
}
export async function getActiveFarm(client,guildId,selector){
 const rows=await getActiveFarms(client,guildId);
 return selector?rows.find(s=>s.messageId===selector||s.hostId===selector):rows[0];
}
export async function saveActiveFarm(client,guildId,session){
 if(!client.db?.isAvailable?.())throw Error('Database unavailable');
 if(!session)throw Error('Session required');
 await withRecordLock(client,guildId,'activeStorage',async()=>{
 const rows=await getActiveFarms(client,guildId);
 const i=rows.findIndex(s=>s.messageId===session.messageId);
 if(i>=0)rows[i]={...rows[i],...session,startAnnouncementId:rows[i].startAnnouncementId||session.startAnnouncementId,listingId:rows[i].listingId||session.listingId};
 else {if(rows.some(s=>s.hostId===session.hostId))throw Error('Host already has an active farm');rows.push(session);}
 await client.db.set(key(guildId),rows);
 });
}
const listingChannel=process.env.ACTIVE_FARMS_CHANNEL_ID || '1571956075366711401';
export const earlyReasons = Object.freeze({DC:'DC',GRIEF:'Griefing',TROLL:'Trolling',OTHER:'Other reason'});
export async function syncFarmListing(client,guildId,session){
 const channel=await client.channels.fetch(listingChannel).catch(()=>null);
 if(channel?.guildId!==guildId||!channel.isSendable())return;
 const payload={embeds:[farmEmbed(session)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('View Farm').setURL('https://discord.com/channels/'+guildId+'/'+session.channelId+'/'+session.messageId))],allowedMentions:{parse:[]}};
 const old=session.listingId?await channel.messages.fetch(session.listingId).catch(()=>null):null;
 if(old)await old.edit(payload);
 else {
 await withRecordLock(client,guildId,'activeStorage',async()=>{
 const rows=await getActiveFarms(client,guildId);
 const current=rows.find(s=>s.messageId===session.messageId);
 if(!current||current.listingId!==session.listingId)return;
 const msg=await channel.send(payload);
 current.listingId=msg.id;
 try{await client.db.set(key(guildId),rows);}catch(error){await msg.delete().catch(()=>{});throw error;}
 });
 }
}
export function farmButtons(session) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('farm_join').setLabel('Join').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('farm_leave').setLabel('Leave').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('farm_removealts').setLabel('Remove alts').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('farm_end').setLabel('End farm').setStyle(ButtonStyle.Danger),
  )];
}

export const farmDuration = type => type === '222' ? 30 : 60;
export const farmSlots = session => Math.min(12, 1 + session.altAccounts + session.players.length);
export function farmEmbed(session) {
 const duration=farmDuration(session.type);
 const start=session.fullStartedAt;
 const elapsed=start?Math.max(0,Date.now()-start):0;
 const progress=session.completed?100:Math.min(100,elapsed/(duration*60000)*100);
 const filled=Math.floor(progress/5);
 const remaining=Math.max(0,Math.ceil((duration*60000-elapsed)/60000));
 const type=session.type==='HYBRID'?'Hybrid':session.type==='REGULAR'?'Regular':session.type;
 const slots=farmSlots(session);
 const sparkle='<a:001_sparkles:1575070315724279918>';
 const arrow='<:UtilityArrow:1575069345321582662>';
 const white='<:gwhitearrow:1575129688190226475>';
 const branch='<:x_whitearrow:1575129831988002968>';
 const cross='<:w_xno:1575126942011760642>';
 const status=session.completed?'COMPLETED':start?'ACTIVE':'WAITING';
 const end=start?Math.floor((start+duration*60000)/1000):null;
 const roster=[...new Set([session.hostId,...session.players])].map(id=>'<@'+id+'>').join(' ');
 const embed=new EmbedBuilder().setColor(0xEBCDDC)
 .setDescription('## '+sparkle+' Current '+type+' Farm Status\n\n**Progress**\n`'+ '█'.repeat(filled)+'░'.repeat(20-filled)+'`\n`'+progress.toFixed(1)+'%` | **'+(session.completed?'Complete':remaining+'m remaining')+'**')
 .addFields(
 {name:branch+' Host',value:arrow+' <@'+session.hostId+'>',inline:true},
 {name:branch+' Status',value:white+' **'+status+'**'+(end&&!session.completed?'\nEnds <t:'+end+':R>':''),inline:true},
 {name:branch+' Farm Type',value:arrow+' **'+type+'**',inline:true},
 {name:branch+' Capacity',value:arrow+' **'+slots+'/12 Players** | '+(slots>=12?cross+' **FULL**':'**'+(12-slots)+' OPEN**')},
 {name:branch+' Players',value:roster},
 {name:branch+' Alt Accounts',value:arrow+' '+session.altAccounts+' alt account(s)'}
 ).setFooter({text:type+' Farm • '+duration+' minutes'});
 if(end)embed.setTimestamp(end*1000);
 const banner=process.env.FARM_BANNER_URL;
 if(banner&&/^https:\/\//i.test(banner))embed.setImage(banner);
 return embed;
}

export async function refreshFarmMessage(client, session) {
  const channel = await client.channels.fetch(session.channelId).catch(() => null);
  const message = await channel?.messages.fetch(session.messageId).catch(() => null);
  if (message) await message.edit({ embeds: [farmEmbed(session)], components: session.completed ? [] : farmButtons(session) });
}

/** Save a completed session before removing the active session. */
export async function completeFarm(client, guildId, session, reason = 'COMPLETED', earlyReason = null) {
  const removed=await withRecordLock(client,guildId,'activeStorage',async()=>{
  const rows=await getActiveFarms(client,guildId);
  const current=rows.find(s=>s.messageId===session.messageId);
  if(!current)return null;
  const endedAt=Date.now();
  const record={
    id: current.messageId,
    hostId: current.hostId,
    playerIds: [...new Set(current.players || [])].filter(id => id !== current.hostId),
    startedAt: current.startedAt,
    fullStartedAt: current.fullStartedAt || null,
    endedAt,
    durationMs: current.fullStartedAt ? Math.max(0,endedAt-current.fullStartedAt) : 0,
    type: current.type,
    reason,
    earlyReason,
  };
  await appendRecord(client,guildId,'completedSessions',record);
   await client.db.set(key(guildId),rows.filter(s=>s.messageId!==session.messageId));
   return {...current,record};
  });
  if(!removed)return false;
  session.listingId=removed.listingId;
  if(session.listingId){const channel=await client.channels.fetch(listingChannel).catch(()=>null);if(channel?.guildId===guildId)await channel.messages.delete(session.listingId).catch(()=>{});}
  try {
    const channel=await client.channels.fetch(process.env.FARM_END_LOG_CHANNEL_ID || '1573919237347741776');
    if(channel?.guildId===guildId && channel.isSendable()){
      const r=removed.record, seconds=Math.floor(r.durationMs/1000);
      const embed=new EmbedBuilder().setColor(reason==='COMPLETED'?0xF5A9D0:0xED4245).setTitle(reason==='COMPLETED'?'Farm completed':reason==='EARLY'?'Farm has ended early':'Farm '+reason.toLowerCase()).addFields({name:'Host',value:'<@'+r.hostId+'>'},{name:'Farm type',value:r.type},{name:'Farming duration',value:Math.floor(seconds/60)+'m '+seconds%60+'s / '+farmDuration(r.type)+'m'},{name:'Ended early',value:reason==='EARLY'||reason==='CANCELLED'?'Yes':'No'},{name:'Reason',value:earlyReasons[earlyReason]||reason}).setTimestamp(r.endedAt);
      await channel.send({embeds:[embed],allowedMentions:{parse:[]}});
    } else console.warn('Farm end log channel unavailable in configured guild');
  } catch(error){console.error('Farm end log failed:',error);}
  if(reason!=='CANCELLED')try{await postReviewPanel(client,guildId,removed.record,removed.channelId);}catch(error){console.error('Farm review panel failed:',error);}
  return true;
}

export async function announceFarmStart(client,guildId,messageId){
 return withRecordLock(client,guildId,'activeStorage',async()=>{
 const rows=await getActiveFarms(client,guildId);
 const farm=rows.find(s=>s.messageId===messageId);
 if(!farm?.fullStartedAt||farm.startAnnouncementId||Date.now()-farm.fullStartedAt>=farmDuration(farm.type)*60000)return;
 const channel=await client.channels.fetch(farm.channelId);
 if((channel.guildId??channel.guild?.id)!==guildId||!channel.send)return;
 const ids=[...new Set([farm.hostId,...farm.players])];
 const type=farm.type==='HYBRID'?'Hybrid':farm.type;
 const message=await channel.send({content:'🎉 **Farm Started!** '+ids.map(id=>'<@'+id+'>').join(' ')+'\nGood luck with your '+type+' farm! ⏰ '+farmDuration(farm.type)+' minutes',allowedMentions:{parse:[],users:ids}});
 farm.startAnnouncementId=message.id;
 try{await client.db.set(key(guildId),rows);}catch(error){await message.delete().catch(()=>{});throw error;}
 });
}
