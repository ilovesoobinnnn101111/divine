import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig } from '../../services/farm/config.js';
import { requestManager, postBoostTicketUpdate, safeRequest } from '../../services/farm/boostRequests.js';

const key = guild => `${farmConfig.databasePrefix}${guild}:boosterOrders`;
export default {
 data:new SlashCommandBuilder().setName('boosterprogress').setDescription('Update progress on your assigned boost order')
  .addStringOption(o=>o.setName('order_id').setDescription('Assigned order ID').setRequired(true).setMaxLength(40))
  .addStringOption(o=>o.setName('action').setDescription('Progress update').setRequired(true).addChoices(
    {name:'▶️ Start Order',value:'start'},
    {name:'✅ Mark Completed',value:'complete'},
    {name:'📝 Add Progress Note',value:'note'}))
  .addStringOption(o=>o.setName('note').setDescription('Progress note or completion details').setRequired(false).setMaxLength(500)),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))
   return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  if(!client.db?.isAvailable?.())return interaction.reply({content:'PostgreSQL unavailable. No changes made.',flags:MessageFlags.Ephemeral});
  const id=interaction.options.getString('order_id',true).trim();
  const action=interaction.options.getString('action',true);
  const note=interaction.options.getString('note')?.trim()||'';
  if(!/^ORD-\d{17,20}$/.test(id))return interaction.reply({content:'Invalid order ID.',flags:MessageFlags.Ephemeral});
  if(action==='note'&&note.length<3)return interaction.reply({content:'Progress notes must be at least 3 characters.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  let outcome='missing',order;
  try {
   await withRecordLock(client,interaction.guildId,'boosterOrders',async()=>{
    const rows=await readRecords(client,interaction.guildId,'boosterOrders');
    const index=rows.findIndex(o=>o.order_id===id);
    if(index<0)return;
    const previous=rows[index];
    if(previous.booster_id!==interaction.user.id&&!requestManager(interaction.member)){outcome='forbidden';return;}
    if(!['Pending','In Progress'].includes(previous.status)){outcome='closed';return;}
    if(action==='start'&&previous.status!=='Pending'){outcome='already';return;}
    if(action==='complete'&&previous.status!=='In Progress'){outcome='notstarted';return;}
    const now=Date.now(),status=action==='start'?'In Progress':action==='complete'?'Completed':previous.status;
    const history=[...(previous.status_history||[])];
    if(action!=='note')history.push({status,timestamp:now,by:interaction.user.id,notes:note||undefined});
    const progressNotes=[...(previous.progress_notes_history||[])];
    if(note)progressNotes.push({timestamp:now,by:interaction.user.id,note});
    order={...previous,status,status_history:history,progress_notes_history:progressNotes,updated_at:now};
    if(action==='complete')order.completed_at=now;
    rows[index]=order;await client.db.set(key(interaction.guildId),rows);
    outcome='saved';
   });
  }catch{return interaction.editReply('Database error. No update confirmed; check the order before retrying.');}
  const errors={missing:'Order not found.',forbidden:'Only the assigned booster or a Booster Manager can update this order.',closed:'This order is already closed and cannot be changed here.',already:'This order has already been started.',notstarted:'Start the order before marking it completed.'};
  if(outcome!=='saved')return interaction.editReply(errors[outcome]||'Could not update order.');
  const label=action==='start'?'🔵 In Progress':action==='complete'?'✅ Completed':'📝 Progress Note';
  const description=`Order ${id}: ${label}${note?'\\nNote: '+safeRequest(note,500):''}`;
  let posted=false;
  if(order.request_id){
   try {
    const request=(await readRecords(client,interaction.guildId,'boostRequests')).find(r=>r.request_id===order.request_id);
    if(request)posted=await postBoostTicketUpdate(client,request,{title:`📋 Boost Order Update · ${label}`,description,color:action==='complete'?0x2ECC71:0x3498DB});
   }catch{}
  }
  if(action==='complete'&&order.customer_id){
   try {
    const customer=await client.users.fetch(order.customer_id);
    await customer.send({content:`✅ Your boost order ${id} has been marked Completed.${note?' Note: '+safeRequest(note,300):''}`,allowedMentions:{parse:[]}});
   }catch{}
  }
  const embed=new EmbedBuilder().setColor(action==='complete'?0x2ECC71:0x3498DB).setTitle(label)
   .setDescription(`Order \`${id}\` updated successfully.\n**Current status:** ${order.status}\n**Customer ticket:** ${posted?'Notified':'Unavailable or not linked'}`).setTimestamp();
  return interaction.editReply({embeds:[embed],allowedMentions:{parse:[]}});
 }
};
