import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { renderBoosterPanel } from '../../services/farm/boosterPanel.js';
export default {
 data:new SlashCommandBuilder().setName('boosterpanel').setDescription('Open interactive controls for assigned booster orders'),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))
   return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  if(!client.db?.isAvailable?.())return interaction.reply({content:'PostgreSQL unavailable.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  try{return interaction.editReply(await renderBoosterPanel(client,interaction));}
  catch{return interaction.editReply('Unable to load orders. Please try again.');}
 }
};
