import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { setBoosterAvailability,availabilityOf,availabilityRows,availabilityIcon } from '../../services/farm/boosterAvailability.js';
import { readRecords } from '../../services/farm/records.js';
export default {
 data:new SlashCommandBuilder().setName('boosteravailability').setDescription('Set or check your booster availability')
 .addStringOption(o=>o.setName('status').setDescription('Choose your availability or omit to view').setRequired(false).addChoices(
  {name:'🟢 Available',value:'Available'},{name:'🟡 Busy',value:'Busy'},{name:'🔴 Offline',value:'Offline'})),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))
   return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  if(!client.db?.isAvailable?.())return interaction.reply({content:'PostgreSQL unavailable.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  try{
   const status=interaction.options.getString('status');
   const row=status?await setBoosterAvailability(client,interaction.guildId,interaction.user.id,status):
    (await availabilityRows(client,interaction.guildId)).find(r=>r.booster_id===interaction.user.id);
   const active=(await readRecords(client,interaction.guildId,'boosterOrders')).filter(o=>o.booster_id===interaction.user.id&&['Pending','In Progress'].includes(o.status)).length;
   const current=row?.status||'Not Set';
   const embed=new EmbedBuilder().setTitle('🎮 Booster Availability').setColor(current==='Available'?0x2ECC71:current==='Busy'?0xF1C40F:0x95A5A6)
    .setDescription(`**Status:** ${availabilityIcon(current)} ${current}\n**Active orders:** ${active}\n**Changes recorded:** ${row?.history?.length||0}`)
    .setFooter({text:'Availability is advisory; it does not change existing orders'}).setTimestamp();
   return interaction.editReply({embeds:[embed]});
  }catch{return interaction.editReply('Unable to update availability. Please try again.');}
 }
};
