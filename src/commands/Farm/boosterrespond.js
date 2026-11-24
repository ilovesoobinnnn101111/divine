import {isEligibleBooster,eligibleBooster} from '../../services/farm/boosterSecurity.js';
import {SlashCommandBuilder,MessageFlags,EmbedBuilder} from 'discord.js';
import {readRecords,withRecordLock} from '../../services/farm/records.js';
import {farmConfig} from '../../services/farm/config.js';
export default {
 data:new SlashCommandBuilder().setName('boosterrespond').setDescription('Accept or decline your assigned booster order')
 .addStringOption(o=>o.setName('order_id').setDescription('Assigned order ID').setRequired(true).setMaxLength(40))
 .addStringOption(o=>o.setName('response').setDescription('Your response').setRequired(true).addChoices({name:'Accept',value:'Accepted'},{name:'Decline',value:'Declined'}))
 .addStringOption(o=>o.setName('reason').setDescription('Required when declining').setMaxLength(500)),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  if(!client.db?.isAvailable?.())return interaction.reply({content:'PostgreSQL unavailable.',flags:MessageFlags.Ephemeral});
  const id=interaction.options.getString('order_id',true).trim(),response=interaction.options.getString('response',true),reason=interaction.options.getString('reason')?.trim()||'';
  if(response==='Declined'&&reason.length<3)return interaction.reply({content:'Provide a decline reason of at least 3 characters.',flags:MessageFlags.Ephemeral});
  if(!isEligibleBooster(interaction.member))return interaction.reply({content:'Booster role required.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  let saved=false;
  try{
   await withRecordLock(client,interaction.guildId,'boosterOrders',async()=>{
    const rows=await readRecords(client,interaction.guildId,'boosterOrders'),i=rows.findIndex(o=>o.order_id===id&&o.booster_id===interaction.user.id);
    if(i<0)return;
    const o=rows[i];
    if(!['Pending','In Progress'].includes(o.status)||o.assignment_response!=='Awaiting Confirmation')return;
    const now=Date.now();
    rows[i]={...o,assignment_response:response,assignment_responded_at:now,assignment_response_history:[...(o.assignment_response_history||[]),{response,booster_id:interaction.user.id,timestamp:now,reason:response==='Declined'?reason:''}]};
    await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:boosterOrders`,rows);saved=true;
   });
  }catch{return interaction.editReply('Could not save response. Please retry.');}
  if(!saved)return interaction.editReply('No matching active assignment awaiting your confirmation.');
  let notified=false;
  if(response==='Declined'){
   try{
    const channel=await client.channels.fetch(process.env.BOOSTER_ALERT_CHANNEL_ID||'1571956074683048033');
    if(channel?.guildId===interaction.guildId&&channel.isTextBased()){
     const roles=(process.env.BOOSTER_MANAGER_ROLE_ID||'').split(',').map(x=>x.trim()).filter(x=>/^\d{17,20}$/.test(x));
     await channel.send({content:roles.map(x=>`<@&${x}>`).join(' ')||'Booster management alert',embeds:[new EmbedBuilder().setColor(0xE74C3C).setTitle('Booster Declined Assignment').setDescription(`Order: ${id}\nBooster: <@${interaction.user.id}>\nReason: ${reason}\nManager reassignment required.`)],allowedMentions:{parse:[],roles}});notified=true;
    }
   }catch(error){console.error('Decline alert failed',error);}
  }
  return interaction.editReply(`Assignment response saved: **${response}**. Order progress status unchanged.${response==='Declined'?(notified?' Managers notified.':' Manager alert failed; contact a manager directly.'):''}`);
 }
};