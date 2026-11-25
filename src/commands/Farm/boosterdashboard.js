import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { requestManager } from '../../services/farm/boostRequests.js';
import { renderBoosterDashboard } from '../../services/farm/boosterDashboard.js';
export default {
 data:new SlashCommandBuilder().setName('boosterdashboard').setDescription('Manager-only live booster order dashboard'),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))
   return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  if(!requestManager(interaction.member))
   return interaction.reply({content:'Booster Manager role required.',flags:MessageFlags.Ephemeral});
  if(!client.db?.isAvailable?.())return interaction.reply({content:'PostgreSQL unavailable.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  try{return interaction.editReply(await renderBoosterDashboard(client,interaction.guildId));}
  catch{return interaction.editReply('Could not load dashboard. Please try again.');}
 }
};
