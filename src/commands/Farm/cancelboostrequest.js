import { SlashCommandBuilder, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig } from '../../services/farm/config.js';
import { safeRequest, requestEmbed } from '../../services/farm/boostRequests.js';

const key=(guild,kind)=>`${farmConfig.databasePrefix}${guild}:${kind}`;
export default {
 data:new SlashCommandBuilder().setName('cancelboostrequest').setDescription('Withdraw a pending boost request or ask to cancel an accepted order')
  .addStringOption(o=>o.setName('request_id').setDescription('Your exact REQ- request ID').setRequired(true).setMaxLength(40))
  .addStringOption(o=>o.setName('reason').setDescription('Why you want to cancel').setRequired(true).setMinLength(3).setMaxLength(300)),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))
   return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  if(!client.db?.isAvailable?.())return interaction.reply({content:'PostgreSQL unavailable. Nothing changed.',flags:MessageFlags.Ephemeral});
  const id=interaction.options.getString('request_id',true).trim(),reason=interaction.options.getString('reason',true).trim();
  if(!/^REQ-\d{17,20}$/.test(id)||reason.length<3)return interaction.reply({content:'Enter a valid request ID and a reason of at least 3 characters.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  let outcome='missing',req;
  try {
   await withRecordLock(client,interaction.guildId,'boostRequests',async()=>{
    const rows=await readRecords(client,interaction.guildId,'boostRequests');
    const index=rows.findIndex(x=>x.request_id===id&&x.customer_id===interaction.user.id);
    if(index<0)return;
    const current=rows[index];
    if(current.status==='Pending'){
      const now=Date.now();
      req={...current,status:'Withdrawn',withdrawn_at:now,withdrawn_reason:reason,updated_at:now};
      rows[index]=req;await client.db.set(key(interaction.guildId,'boostRequests'),rows);outcome='withdrawn';
    }else if(current.status==='Accepted'){
      if(current.cancellation_request?.status==='Pending'){outcome='already';return;}
      if(current.cancellation_request?.status==='Approved'){outcome='closed';return;}
      const orders=await readRecords(client,interaction.guildId,'boosterOrders');
      const order=orders.find(o=>o.request_id===id&&o.customer_id===interaction.user.id);
      if(!order||!['Pending','In Progress'].includes(order.status)){outcome='closed';return;}
      const now=Date.now();
      req={...current,cancellation_request:{status:'Pending',reason,requested_at:now,requested_by:interaction.user.id},updated_at:now};
      rows[index]=req;await client.db.set(key(interaction.guildId,'boostRequests'),rows);outcome='review';
    }else outcome='closed';
   });
  }catch{return interaction.editReply('Database error. Please retry; no new request was confirmed.');}
  if(outcome==='missing')return interaction.editReply('No request with that ID belongs to you.');
  if(outcome==='already')return interaction.editReply('Your cancellation request is already awaiting manager review.');
  if(outcome==='closed')return interaction.editReply('This request or its linked order is not eligible for cancellation.');
  if(outcome==='withdrawn'){
   try{
    const channel=await client.channels.fetch(req.review_channel_id).catch(()=>null);
    const msg=await channel?.messages?.fetch(req.review_message_id).catch(()=>null);
    if(msg)await msg.edit({embeds:[requestEmbed(req)],components:[],allowedMentions:{parse:[]}}).catch(()=>{});
   }catch{}
   return interaction.editReply(`✅ Request \`${id}\` withdrawn. No order was created by this action.`);
  }
  const channelId=process.env.BOOST_REQUEST_CHANNEL_ID;
  const channel=await client.channels.fetch(channelId).catch(()=>null);
  let posted=false;
  if(channel?.send&&channel.guildId===interaction.guildId){
   const embed=new EmbedBuilder().setColor(0xE67E22).setTitle('⚠️ Customer Cancellation Approval')
    .setDescription(`**Request:** \`${id}\`\n**Order:** \`${safeRequest(req.order_id,40)}\`\n**Customer:** <@${req.customer_id}>\n**Reason:** ${safeRequest(reason,300)}\n\nReview the linked order before deciding.`);
   const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`boostcancelrequest:approve:${id}`).setLabel('Approve Cancellation').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`boostcancelrequest:deny:${id}`).setLabel('Deny Cancellation').setStyle(ButtonStyle.Secondary));
   try{await channel.send({embeds:[embed],components:[row],allowedMentions:{parse:[]}});posted=true;}catch{}
  }
  return interaction.editReply(posted
   ?`🟠 Cancellation requested for \`${id}\`. A Booster Manager must approve it before your order is cancelled.`
   :`🟠 Cancellation request saved for \`${id}\`, but the manager notification could not be posted. Please contact a Booster Manager with this ID.`);
 }
};
