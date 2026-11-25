import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { updateBoosterProgress } from '../../services/farm/boosterProgress.js';
export default {
 data:new SlashCommandBuilder().setName('boosterprogress').setDescription('Update progress on your assigned boost order')
  .addStringOption(o=>o.setName('order_id').setAutocomplete(true).setDescription('Assigned order ID').setRequired(true).setMaxLength(40))
  .addStringOption(o=>o.setName('action').setDescription('Progress update').setRequired(true).addChoices(
    {name:'▶️ Start Order',value:'start'},{name:'✅ Mark Completed',value:'complete'},{name:'📝 Add Progress Note',value:'note'}))
  .addStringOption(o=>o.setName('note').setDescription('Progress note or completion details').setRequired(false).setMaxLength(500)),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))
   return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  try{
   const result=await updateBoosterProgress(client,interaction,interaction.options.getString('order_id',true).trim(),interaction.options.getString('action',true),interaction.options.getString('note')?.trim()||'');
   return interaction.editReply(result.error?result.error:`${result.label} — Order \`${result.order.order_id}\` updated. Customer ticket: ${result.posted?'notified':'not linked or unavailable'}.`);
  }catch{return interaction.editReply('Database error. Please verify the order before retrying.');}
 }
};
