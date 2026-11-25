import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { readRecords, relativeTime, isManager } from '../../services/farm/records.js';
export default {
 data:new SlashCommandBuilder().setName('searchlogs').setDescription('Search a host’s logs (managers only)').addUserOption(o=>o.setName('user').setDescription('Host to search').setRequired(true)),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()||!isManager(interaction.member)) return interaction.reply({content:'Manager role required.',flags:MessageFlags.Ephemeral});
  const user=interaction.options.getUser('user');
  const logs=(await readRecords(client,interaction.guildId,'hostLogs')).filter(x=>x.hostId===user.id||x.cohostId===user.id).slice(-10).reverse();
  return interaction.reply({content:logs.length?logs.map(x=>`${relativeTime(x.timestamp)} — ${x.minutes} min, ${x.games} games, replay ${x.replayId}`).join('\n'):'No logs found.',flags:MessageFlags.Ephemeral});
 }
};
