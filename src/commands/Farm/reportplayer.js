import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { canReport, appendRecord } from '../../services/farm/records.js';
import { farmConfig } from '../../services/farm/config.js';
export default {
 data:new SlashCommandBuilder().setName('reportplayer').setDescription('Report player misconduct')
 .addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(500))
 .addStringOption(o=>o.setName('userid').setDescription('Discord user ID').setRequired(true).setMaxLength(20))
 .addStringOption(o=>o.setName('replayid').setDescription('Optional replay ID').setMaxLength(50))
 .addStringOption(o=>o.setName('matchid').setDescription('Optional match ID').setMaxLength(50)),
 async execute(interaction,guildConfig,client) {
  if(!interaction.inGuild()||!canReport(interaction.member)) return interaction.reply({content:'Report role required.',flags:MessageFlags.Ephemeral});
  const userId=interaction.options.getString('userid');
  if(!/^\d{17,20}$/.test(userId)||userId===interaction.user.id||userId===client.user.id) return interaction.reply({content:'Enter a valid Discord user ID other than your own or the bot’s.',flags:MessageFlags.Ephemeral});
  const record={id:`RP-${interaction.id}`,reporterId:interaction.user.id,reportedUserId:userId,reason:interaction.options.getString('reason'),replayId:interaction.options.getString('replayid')||null,matchId:interaction.options.getString('matchid')||null,timestamp:Date.now()};
  await appendRecord(client,interaction.guildId,'reports',record);
  const channel=farmConfig.channels.reportPlayer?await client.channels.fetch(farmConfig.channels.reportPlayer).catch(()=>null):null;
  if(channel?.send&&channel.guildId===interaction.guildId) await channel.send({embeds:[new EmbedBuilder().setTitle('Player report').setColor(0xED4245).addFields({name:'Reporter',value:`<@${record.reporterId}>`},{name:'Reported user',value:`<@${userId}>`},{name:'Reason',value:record.reason},{name:'Replay ID',value:record.replayId||'Not provided'},{name:'Match ID',value:record.matchId||'Not provided'})]}).catch(()=>{});
  return interaction.reply({content:`Report saved (${record.id}).`,flags:MessageFlags.Ephemeral});
 }
};
