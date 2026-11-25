import { SlashCommandBuilder,MessageFlags } from 'discord.js';
import { requestManager } from '../../services/farm/boostRequests.js';
import { renderBoosterRoster } from '../../services/farm/boosterRoster.js';
export default {
 data:new SlashCommandBuilder().setName('boosterroster').setDescription('Manager-only booster availability and workload roster'),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  if(!requestManager(interaction.member))return interaction.reply({content:'Booster Manager role required.',flags:MessageFlags.Ephemeral});
  if(!client.db?.isAvailable?.())return interaction.reply({content:'PostgreSQL unavailable.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  try{return interaction.editReply(await renderBoosterRoster(client,interaction.guildId));}
  catch{return interaction.editReply('Unable to load booster roster.');}
 }
};
