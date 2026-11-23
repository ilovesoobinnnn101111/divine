import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { appendRecord, readRecords, withRecordLock } from './records.js';
import { farmConfig, memberHasFarmRole } from './config.js';

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
  const channelId = process.env.BOOST_REQUEST_CHANNEL_ID;
  if (!/^\d{17,20}$/.test(String(channelId||''))) return {error:'Managers have not configured BOOST_REQUEST_CHANNEL_ID in Railway yet.'};
  const channel = await client.channels.fetch(channelId).catch(()=>null);
  if (!channel?.send || channel.guildId !== interaction.guildId) return {error:'The boost request channel is unavailable or belongs to another server.'};
  const req = {
    request_id:'REQ-'+interaction.id, guild_id:interaction.guildId, customer_id:interaction.user.id,
    type:payload.type, summary:payload.summary, total:payload.total,
    details:payload.details, status:'Pending', created_at:Date.now(), updated_at:Date.now()
  };
  await appendRecord(client,interaction.guildId,'boostRequests',req);
  try {
    const msg=await channel.send({embeds:[requestEmbed(req)],components:[reviewRow(req.request_id)],allowedMentions:{parse:[]}});
    await withRecordLock(client,interaction.guildId,'boostRequests',async()=>{
      const rows=await readRecords(client,interaction.guildId,'boostRequests');
      const index=rows.findIndex(x=>x.request_id===req.request_id);
      if(index>=0){rows[index]={...rows[index],review_channel_id:channel.id,review_message_id:msg.id};await client.db.set(key(interaction.guildId,'boostRequests'),rows);}
    });
    return {request:req};
  } catch { return {request:req,warning:'Request saved, but posting to the review channel failed. Managers can still locate it in PostgreSQL.'}; }
}
export const safeRequest = safe;
