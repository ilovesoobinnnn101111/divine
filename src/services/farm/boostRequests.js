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
export const reviewRow = id => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('boostreview:accept:'+id).setLabel('Accept Request').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId('boostreview:decline:'+id).setLabel('Decline Request').setStyle(ButtonStyle.Danger)
);
export async function submitBoostRequest(interaction, client, payload) {
  if (!client.db?.isAvailable?.()) return { error:'PostgreSQL unavailable. Request not saved.' };
  if (!interaction.guild || !interaction.member) return {error:'Only server members can open boost tickets.'};
  const managerRoleId = '1571956072913178629';
  if (!interaction.guild.roles.cache.has(managerRoleId)) return {error:'Booster Manager role not found in this server.'};
  const req = {
    request_id:'REQ-'+interaction.id, guild_id:interaction.guildId, customer_id:interaction.user.id,
    type:payload.type, summary:payload.summary, total:payload.total,
    details:payload.details, status:'Pending', created_at:Date.now(), updated_at:Date.now()
  };
  let ticket;
  try {
    const category = await interaction.guild.channels.fetch('1571956074008027142').catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) return {error:'Configured boost ticket category is unavailable.'};
    ticket = await createTicket(interaction.guild, interaction.member, category.id, `Boost request ${req.request_id} — ${payload.type}`);
    await ticket.channel.permissionOverwrites.edit(managerRoleId, {
      ViewChannel:true,SendMessages:true,ReadMessageHistory:true,AttachFiles:true
    });
  } catch (error) {
    return {error:'Could not open a private ticket. Please check ticket permissions or your open-ticket limit.'};
  }
  req.ticket_channel_id = ticket.channel.id;
  await appendRecord(client,interaction.guildId,'boostRequests',req);
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
