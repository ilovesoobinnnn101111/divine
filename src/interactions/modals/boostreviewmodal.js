import {earningsText} from '../../services/farm/boosterEarnings.js';
import {isEligibleBooster,eligibleBooster} from '../../services/farm/boosterSecurity.js';
import { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { readRecords, withRecordLock, appendRecord } from '../../services/farm/records.js';
import { farmConfig } from '../../services/farm/config.js';
import { requestManager, requestEmbed, safeRequest, postBoostTicketUpdate } from '../../services/farm/boostRequests.js';

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
    if(!await eligibleBooster(interaction.guild,value))return interaction.editReply('Select a server member with the Booster role.');
    if(!booster||booster.bot)return interaction.editReply({content:'Booster user not found or is a bot. Nothing changed.'});
  }
  let req=null, result='missing',orderSaved=false;
  try {
    await withRecordLock(client,interaction.guildId,'boostRequests',async()=>{
      const rows=await readRecords(client,interaction.guildId,'boostRequests');
      const index=rows.findIndex(x=>x.request_id===id);
      if(index<0)return;
      if(rows[index].status!=='Pending'){result='reviewed';return;}
      if(action==='accept'&&!await eligibleBooster(interaction.guild,booster.id,rows[index].type==='Lord Boost'?'Hero Boost':'Rank Boost')){result='wrong_role';return;}
      if(action==='decline'&&(await readRecords(client,interaction.guildId,'boosterOrders')).some(o=>o.request_id===id)){result='conflict';return;}
      req={...rows[index],status:action==='accept'?'Accepted':'Declined',reviewed_by:interaction.user.id,reviewed_at:Date.now(),
        ...(action==='accept'?{booster_id:booster.id,order_id:'ORD-'+interaction.id}:{decline_reason:value})};
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
      notes:`From request ${id}.`,request_id:id,
      estimated_price:req.total,status:'Pending',assignment_response:'Awaiting Confirmation',assignment_response_history:[],
      status_history:[{status:'Pending',timestamp:now,by:interaction.user.id}],
      created_at:now,updated_at:now
    };
    const existing=await readRecords(client,interaction.guildId,'boosterOrders');
    const linked=existing.find(o=>o.request_id===id);
    if(linked){
      if(linked.booster_id!==booster.id){result='conflict';return;}
      req.order_id=linked.order_id;
    }else await appendRecord(client,interaction.guildId,'boosterOrders',record);
    orderSaved=true;
  }

      rows[index]=req;
      await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:boostRequests`,rows);
      result='saved';
    });
  } catch {return interaction.editReply({content:'Database error while reviewing request. If an order was saved, retry acceptance with the same booster to recover the request.'});}
  if(result!=='saved')return interaction.editReply({content:result==='conflict'?'An order already exists for this request. Retry acceptance with the original assigned booster or contact a manager.':result==='wrong_role'?'Booster does not have the required role for this request.':result==='reviewed'?'This request has already been reviewed.':'Request not found.'});
  try {
    const channel=await client.channels.fetch(req.review_channel_id).catch(()=>null);
    const msg=await channel?.messages?.fetch(req.review_message_id).catch(()=>null);
    if(msg)await msg.edit({embeds:[requestEmbed(req)],components:[],allowedMentions:{parse:[]}}).catch(()=>{});
  } catch {}
  try {
    await postBoostTicketUpdate(client,req,{
      title:action==='accept'?(orderSaved?'✅ Boost Request Accepted':'⚠️ Assignment Needs Attention'):'❌ Boost Request Declined',
      description:action==='accept'
        ?orderSaved
          ?'Request '+id+' was accepted by <@'+interaction.user.id+'>.\\nOrder ID: '+req.order_id+'\\nAssigned booster: <@'+booster.id+'>\nOrder status: Pending'
          :'Request '+id+' was accepted, but creating the linked order failed. A manager must resolve this before work begins.'
        :'Request '+id+' was declined by <@'+interaction.user.id+'>.\\nReason: '+safeRequest(value,200),
      color:action==='accept'?(orderSaved?0x2ECC71:0xE67E22):0xE74C3C
    });
  } catch { /* Ticket may have been deleted or bot lacks access. */ }
  if(action==='accept'&&orderSaved&&req.ticket_channel_id){
    try {
      const ticket=await client.channels.fetch(req.ticket_channel_id).catch(()=>null);
      if(ticket?.send)await ticket.send({
        content:'📊 Track your order progress at any time:',
        components:[new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('booststatus:check:'+id)
            .setLabel('Check Order Status').setEmoji('📊').setStyle(ButtonStyle.Primary)
        )],
        allowedMentions:{parse:[]}
      });
    } catch { /* Ticket may be unavailable. */ }
  }
  try {
    const customer=await client.users.fetch(req.customer_id);
    await customer.send({content:action==='accept'
      ? `Your boost request ${id} was accepted.${orderSaved?` Order ID: ${req.order_id}.`:' Your manager is finalizing assignment.'} No payment has been processed.`
      : `Your boost request ${id} was declined. Reason: ${safeRequest(value,200)}`,allowedMentions:{parse:[]}});
  } catch {}
  if(action==='accept'&&orderSaved){
    try {await booster.send({content:`You've been assigned boost order ${req.order_id} (request ${id}). Your earnings: ${earningsText({estimated_price:req.total})}. Use /boosterrespond in the server to accept or decline.`,allowedMentions:{parse:[]}});} catch {}
  }
  return interaction.editReply({content:action==='accept'
    ?orderSaved?`Accepted ${id} and created order ${req.order_id} for <@${booster.id}>.`:`Accepted ${id}, but order creation failed. **Do not accept again.** Check PostgreSQL and manually resolve this request.`
    :`Declined ${id}. Reason: ${safeRequest(value,200)}`,allowedMentions:{parse:[]}});
 }
};
