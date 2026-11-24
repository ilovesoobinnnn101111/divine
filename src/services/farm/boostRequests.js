import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { appendRecord, readRecords, withRecordLock } from './records.js';
import { farmConfig, memberHasFarmRole } from './config.js';
import { createTicket } from '../ticket.js';
import { ChannelType } from 'discord.js';

const key = (guild, kind) => `${farmConfig.databasePrefix}${guild}:${kind}`;
const safe = (v, max=1600) => String(v ?? '').replace(/[\x00-\x1F\x7F]/g,' ').replace(/<@/g,'<\\@').slice(0,max);
export const requestManager = member => memberHasFarmRole(member, (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x=>x.trim()).filter(Boolean));
export const requestEmbed = req => new EmbedBuilder().setColor(req.status === 'Pending' ? 0x5865F2 : req.status === 'Declined' ? 0xE74C3C : 0x2ECC71)
  .setTitle('📋 Boost Request · ' + req.status)
  .setDescription(`**Request ID:** \`${req.request_id}\`\n**Customer:** <@${req.customer_id}>\n**Type:** ${safe(req.type,40)}\n**Estimate:** ${req.total === null ? 'Negotiable / custom quote' : '$'+Number(req.total).toFixed(2)}\n\n${safe(req.summary,2500)}`)
  .setFooter({text:'Estimate only · No payment processed'}).setTimestamp(req.created_at);
export async function postBoostTicketUpdate(client, request, { title, description, color = 0x5865F2 }) {
  if (!request?.ticket_channel_id) return false;
  const channel = await client.channels.fetch(request.ticket_channel_id).catch(() => null);
  if (!channel?.send || channel.guildId !== request.guild_id) return false;
  const embed = new EmbedBuilder().setColor(color).setTitle(title)
    .setDescription(safe(description, 3900)).setFooter({ text: `Request ${request.request_id} · Ticket updates` }).setTimestamp();
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  return true;
}
export const reviewRow = id => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('boostreview:accept:'+id).setLabel('Accept Request').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId('boostreview:decline:'+id).setLabel('Decline Request').setStyle(ButtonStyle.Danger)
);
export async function submitBoostRequest(interaction, client, payload) {
  if (!client.db?.isAvailable?.() || !interaction.guildId) return {error:'Database or server unavailable.'};
  return withRecordLock(client,interaction.guildId,'boostSubmission:'+interaction.user.id,()=>submitLocked(interaction,client,payload));
}
async function submitLocked(interaction, client, payload) {
  if (!client.db?.isAvailable?.()) return { error:'PostgreSQL unavailable. Request not saved.' };
  if (!interaction.guild || !interaction.member) return {error:'Only server members can open boost tickets.'};
  const managerRoleId = '1571956072913178629';
  if (!interaction.guild.roles.cache.has(managerRoleId)) return {error:'Booster Manager role not found in this server.'};
  const req = {
    request_id:'REQ-'+interaction.id, guild_id:interaction.guildId, customer_id:interaction.user.id,
    type:payload.type, summary:payload.summary, total:payload.total,
    details:payload.details, status:'Pending', created_at:Date.now(), updated_at:Date.now()
  };
  const existing=(await readRecords(client,interaction.guildId,'boostRequests')).find(x=>x.request_id===req.request_id || (x.customer_id===req.customer_id&&x.type===req.type&&x.summary===req.summary&&x.total===req.total&&['Pending','Ticket Setup'].includes(x.status)&&Date.now()-x.created_at<120000));
  if(existing){
    if(existing.ticket_channel_id&&existing.status==='Pending')return {request:existing,ticketChannelId:existing.ticket_channel_id};
    return {error:'This request is already being processed or needs manager recovery. Reference '+existing.request_id};
  }
  req.status='Ticket Setup';
  try{await appendRecord(client,interaction.guildId,'boostRequests',req);}catch{return {error:'Could not save request. No ticket was opened.'};}
  const persist=async patch=>withRecordLock(client,interaction.guildId,'boostRequests',async()=>{
    const rows=await readRecords(client,interaction.guildId,'boostRequests'),i=rows.findIndex(x=>x.request_id===req.request_id);
    if(i<0)throw new Error('Request record missing');
    rows[i]={...rows[i],...patch,updated_at:Date.now()};
    await client.db.set(key(interaction.guildId,'boostRequests'),rows);
    Object.assign(req,rows[i]);
  });
  let ticket;
  try {
    const category = await interaction.guild.channels.fetch('1571956074008027142').catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) throw new Error('Configured boost ticket category is unavailable.');
    ticket = await createTicket(interaction.guild, interaction.member, category.id, `Boost request ${req.request_id} — ${payload.type}`);
    await persist({ticket_channel_id:ticket.channel.id});
    await ticket.channel.permissionOverwrites.edit(managerRoleId, {
      ViewChannel:true,SendMessages:true,ReadMessageHistory:true,AttachFiles:true
    });
    const manager=interaction.guild.roles.cache.get(managerRoleId);
    if(!ticket.channel.permissionsFor(manager)?.has(['ViewChannel','SendMessages'])||!ticket.channel.permissionsFor(interaction.member)?.has(['ViewChannel','SendMessages']))throw new Error('Ticket access validation failed');
    await persist({status:'Pending',review_channel_id:ticket.channel.id});
  } catch (error) {
    await persist({status:'Ticket Setup',setup_error:String(error.message||error).slice(0,300),...(ticket?.channel?.id?{ticket_channel_id:ticket.channel.id}:{})}).catch(console.error);
    try{
      const alert=await client.channels.fetch(process.env.BOOSTER_ALERT_CHANNEL_ID);
      if(alert?.guildId===interaction.guildId&&alert.send)await alert.send({content:`<@&${managerRoleId}> Boost ticket recovery required: ${req.request_id}${ticket?.channel?.id?' · <#'+ticket.channel.id+'>':''}. Request details preserved. Check ticket records before retrying.`,allowedMentions:{parse:[],roles:[managerRoleId]}});
    }catch(e){console.error('Ticket recovery alert failed',e);}
    return {error:'Ticket setup could not finish. Your request was saved for manager recovery: '+req.request_id};
  }
  try {
    const msg=await ticket.channel.send({
      content:`⏳ Please wait shortly, our <@&${managerRoleId}> will be with you shortly.`,
      embeds:[requestEmbed(req)],components:[reviewRow(req.request_id)],
      allowedMentions:{roles:[managerRoleId],users:[]}
    });
    await withRecordLock(client,interaction.guildId,'boostRequests',async()=>{
      const rows=await readRecords(client,interaction.guildId,'boostRequests');
      const index=rows.findIndex(x=>x.request_id===req.request_id);
      if(index>=0){rows[index]={...rows[index],review_channel_id:ticket.channel.id,review_message_id:msg.id};await client.db.set(key(interaction.guildId,'boostRequests'),rows);}
    });
    return {request:req,ticketChannelId:ticket.channel.id};
  } catch { return {request:req,ticketChannelId:ticket.channel.id,warning:'Ticket opened and request saved, but the request embed could not be posted. Contact a manager in your ticket.'}; }
}
export const safeRequest = safe;
