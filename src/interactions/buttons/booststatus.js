import { EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { requestManager, safeRequest } from '../../services/farm/boostRequests.js';

const icons={Pending:'🟡','In Progress':'🔵',Completed:'✅',Cancelled:'❌',Failed:'⚠️'};
const colors={Pending:0xF1C40F,'In Progress':0x3498DB,Completed:0x2ECC71,Cancelled:0x95A5A6,Failed:0xE74C3C};
export default {
 name:'booststatus',
 async execute(interaction,client,args){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))
   return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  const [action,id]=args;
  if(action!=='check'||!/^REQ-\d{17,20}$/.test(id))
   return interaction.reply({content:'Invalid status button.',flags:MessageFlags.Ephemeral});
  if(!client.db?.isAvailable?.())return interaction.reply({content:'PostgreSQL unavailable. Please try again later.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  try {
   const req=(await readRecords(client,interaction.guildId,'boostRequests')).find(r=>r.request_id===id);
   if(!req||req.ticket_channel_id!==interaction.channelId)
    return interaction.editReply('This request does not belong to this ticket.');
   if(req.customer_id!==interaction.user.id&&!requestManager(interaction.member))
    return interaction.editReply('Only the customer or a Booster Manager can view this order status.');
   const orders=await readRecords(client,interaction.guildId,'boosterOrders');
   const archives=await readRecords(client,interaction.guildId,'boosterOrdersArchive');
   const order=orders.find(o=>o.request_id===id)||archives.find(o=>o.request_id===id);
   if(!order)return interaction.editReply('The request has no linked order yet. Ask a Booster Manager for assistance.');
   const status=order.status||'Pending';
   const history=(Array.isArray(order.status_history)?order.status_history:[]).slice(-5)
    .map(h=>`${icons[h.status]||'⚪'} ${safeRequest(h.status,35)} · <t:${Math.floor(h.timestamp/1000)}:R>`).join('\n')||'No updates yet';
   const embed=new EmbedBuilder().setColor(colors[status]||0x5865F2)
    .setTitle(`${icons[status]||'📋'} Boost Order · ${status}`)
    .addFields(
      {name:'Order ID',value:`\`${safeRequest(order.order_id,60)}\``,inline:true},
      {name:'Assigned Booster',value:/^\d{17,20}$/.test(String(order.booster_id))?`<@${order.booster_id}>`:'Not assigned',inline:true},
      {name:'Request',value:`\`${id}\``,inline:false},
      {name:'Recent Progress',value:history.slice(0,1024)}
    ).setFooter({text:'Live status from PostgreSQL · No payment processed'}).setTimestamp();
   return interaction.editReply({embeds:[embed],allowedMentions:{parse:[]}});
  }catch{return interaction.editReply('Unable to retrieve the latest order status. Please try again.');}
 }
};
