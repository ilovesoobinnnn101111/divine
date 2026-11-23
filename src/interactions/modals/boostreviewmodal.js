import { MessageFlags } from 'discord.js';
import { readRecords, withRecordLock, appendRecord } from '../../services/farm/records.js';
import { farmConfig } from '../../services/farm/config.js';
import { requestManager, requestEmbed, safeRequest } from '../../services/farm/boostRequests.js';

export default {
 name:'boostreviewmodal',
 async execute(interaction,client,args){
  if(!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId!==process.env.TEST_GUILD_ID))
    return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  if(!requestManager(interaction.member))return interaction.reply({content:'Booster Manager role required.',flags:MessageFlags.Ephemeral});
  if(!client.db?.isAvailable?.())return interaction.reply({content:'PostgreSQL unavailable.',flags:MessageFlags.Ephemeral});
  const [action,...parts]=args;const id=parts.join(':');
  if(!['accept','decline'].includes(action)||!/^REQ-\d{17,20}$/.test(id))
    return interaction.reply({content:'Invalid request.',flags:MessageFlags.Ephemeral});
  const value=interaction.fields.getTextInputValue('value').trim();
  if(action==='accept'&&!/^\d{17,20}$/.test(value))
    return interaction.reply({content:'Enter a valid booster Discord user ID (17–20 digits).',flags:MessageFlags.Ephemeral});
  if(action==='decline'&&value.length<3)
    return interaction.reply({content:'Enter a reason of at least 3 characters.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  let booster=null;
  if(action==='accept'){
    booster=await client.users.fetch(value).catch(()=>null);
    if(!booster||booster.bot)return interaction.editReply({content:'Booster user not found or is a bot. Nothing changed.'});
  }
  let req=null, result='missing';
  try {
    await withRecordLock(client,interaction.guildId,'boostRequests',async()=>{
      const rows=await readRecords(client,interaction.guildId,'boostRequests');
      const index=rows.findIndex(x=>x.request_id===id);
      if(index<0)return;
      if(rows[index].status!=='Pending'){result='reviewed';return;}
      req={...rows[index],status:action==='accept'?'Accepted':'Declined',reviewed_by:interaction.user.id,reviewed_at:Date.now(),
        ...(action==='accept'?{booster_id:booster.id,order_id:'ORD-'+interaction.id}:{decline_reason:value})};
      rows[index]=req;
      await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:boostRequests`,rows);
      result='saved';
    });
  } catch {return interaction.editReply({content:'Database error while reviewing request. Please check records before retrying.'});}
  if(result!=='saved')return interaction.editReply({content:result==='reviewed'?'This request has already been reviewed.':'Request not found.'});
  let orderSaved=false;
  if(action==='accept'){
    const now=Date.now();
    const d=req.details||{};
    const hero=req.type==='Lord Boost'?((d.items||[]).map(x=>x.hero).join(', ')||'Multiple heroes'):'Rank Boost';
    const level=req.type==='Lord Boost'?((d.items||[]).map(x=>x.start+' → '+x.end).join('; ')||'See notes'):`${d.start} → ${d.end}`;
    const record={
      order_id:req.order_id,booster_id:booster.id,booster_tag:booster.tag,assigned_by:interaction.user.id,
      assigned_by_tag:interaction.user.tag,hero:hero.slice(0,100),level:level.slice(0,200),
      category:req.type==='Lord Boost'?'Hero Boost':d.mode==='Duo'?'Duo Queue':'Rank Boost',
      customer:req.customer_id,customer_id:req.customer_id,
      notes:`From request ${id}. ${req.summary}`.slice(0,500),request_id:id,
      estimated_price:req.total,status:'Pending',
      status_history:[{status:'Pending',timestamp:now,by:interaction.user.id}],
      created_at:now,updated_at:now
    };
    try {await appendRecord(client,interaction.guildId,'boosterOrders',record);orderSaved=true;}
    catch { /* Record review remains accepted; manager must resolve this manually. */ }
  }
  try {
    const channel=await client.channels.fetch(req.review_channel_id).catch(()=>null);
    const msg=await channel?.messages?.fetch(req.review_message_id).catch(()=>null);
    if(msg)await msg.edit({embeds:[requestEmbed(req)],components:[],allowedMentions:{parse:[]}}).catch(()=>{});
  } catch {}
  try {
    const customer=await client.users.fetch(req.customer_id);
    await customer.send({content:action==='accept'
      ? `Your boost request ${id} was accepted.${orderSaved?` Order ID: ${req.order_id}.`:' Your manager is finalizing assignment.'} No payment has been processed.`
      : `Your boost request ${id} was declined. Reason: ${safeRequest(value,200)}`,allowedMentions:{parse:[]}});
  } catch {}
  if(action==='accept'&&orderSaved){
    try {await booster.send({content:`You've been assigned boost order ${req.order_id} (request ${id}). See your order commands for details.`,allowedMentions:{parse:[]}});} catch {}
  }
  return interaction.editReply({content:action==='accept'
    ?orderSaved?`Accepted ${id} and created order ${req.order_id} for <@${booster.id}>.`:`Accepted ${id}, but order creation failed. **Do not accept again.** Check PostgreSQL and manually resolve this request.`
    :`Declined ${id}. Reason: ${safeRequest(value,200)}`,allowedMentions:{parse:[]}});
 }
};
