import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { isManager, readRecords, replaceRecords } from '../../services/farm/records.js';
export default {
 data:new SlashCommandBuilder().setName('resetlogs').setDescription('Reset host logs (managers only)').addStringOption(o=>o.setName('confirm').setDescription('Type RESET to confirm').setRequired(true)),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()||!isManager(interaction.member)) return interaction.reply({content:'Manager role required.',flags:MessageFlags.Ephemeral});
  if(interaction.options.getString('confirm')!=='RESET') return interaction.reply({content:'No logs changed. Type RESET exactly to confirm.',flags:MessageFlags.Ephemeral});
  const logs=await readRecords(client,interaction.guildId,'hostLogs');
  await replaceRecords(client,interaction.guildId,'hostLogs',[]);
  return interaction.reply({content:`Deleted ${logs.length} host logs.`,flags:MessageFlags.Ephemeral});
 }
};
