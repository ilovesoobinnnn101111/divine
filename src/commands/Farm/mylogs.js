import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { readRecords, relativeTime } from '../../services/farm/records.js';
export default {
 data:new SlashCommandBuilder().setName('mylogs').setDescription('View your recent host logs'),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()) return interaction.reply({content:'Server only.',flags:MessageFlags.Ephemeral});
  const logs=(await readRecords(client,interaction.guildId,'hostLogs')).filter(x=>x.hostId===interaction.user.id||x.cohostId===interaction.user.id).slice(-10).reverse();
  return interaction.reply({content:logs.length?logs.map(x=>`${relativeTime(x.timestamp)} — ${x.minutes} min, ${x.games} games, replay ${x.replayId}`).join('\n'):'No host logs found.',flags:MessageFlags.Ephemeral});
 }
};
