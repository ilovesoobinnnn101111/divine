import { SlashCommandBuilder, MessageFlags } from 'discord.js';
export default {
 data:new SlashCommandBuilder().setName('farmhelp').setDescription('Show farm system commands'),
 async execute(interaction){
  return interaction.reply({content:'**Farm commands**\n/startfarm — start a farm\n/cancelfarm — cancel a farm\n/endfarmearly — end with a reason\n/hostlog — submit hosting proof\n/mylogs — view your logs\n/hostcheck — 7-day manager summary\n/searchlogs — manager log search\n/hostleaderboard — host rankings\n/vouchstats — host ratings\n/reportplayer — report misconduct',flags:MessageFlags.Ephemeral});
 }
};
