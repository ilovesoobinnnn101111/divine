import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { canHost } from '../../services/farm/sessionService.js';
import { appendRecord } from '../../services/farm/records.js';
import { farmConfig } from '../../services/farm/config.js';

export default {
 data: new SlashCommandBuilder().setName('hostlog').setDescription('Log a hosting session (hosts only)')
  .addIntegerOption(o=>o.setName('minutes').setDescription('Minutes hosted (15-60)').setRequired(true).setMinValue(15).setMaxValue(60))
  .addIntegerOption(o=>o.setName('games').setDescription('Games hosted').setRequired(true).setMinValue(1).setMaxValue(1000))
  .addStringOption(o=>o.setName('replayid').setDescription('Replay ID').setRequired(true).setMaxLength(50))
  .addAttachmentOption(o=>o.setName('screenshot').setDescription('Proof screenshot').setRequired(true))
  .addUserOption(o=>o.setName('cohost').setDescription('Optional co-host')),
 async execute(interaction,guildConfig,client) {
  if(!interaction.inGuild() || !canHost(interaction.member)) return interaction.reply({content:'Host role required.',flags:MessageFlags.Ephemeral});
  const attachment=interaction.options.getAttachment('screenshot');
  if(!attachment?.contentType?.startsWith('image/')) return interaction.reply({content:'Please upload an image screenshot.',flags:MessageFlags.Ephemeral});
  const record={id:`HL-${interaction.id}`,hostId:interaction.user.id,minutes:interaction.options.getInteger('minutes'),games:interaction.options.getInteger('games'),replayId:interaction.options.getString('replayid'),screenshotUrl:attachment.url,cohostId:interaction.options.getUser('cohost')?.id||null,timestamp:Date.now()};
  await appendRecord(client,interaction.guildId,'hostLogs',record);
  const channel=farmConfig.channels.hostLog?await client.channels.fetch(farmConfig.channels.hostLog).catch(()=>null):null;
  if(channel?.send && channel.guildId===interaction.guildId) await channel.send({embeds:[new EmbedBuilder().setTitle('Host session logged').setColor(0xD95387).setDescription(`Host: <@${record.hostId}>\nMinutes: ${record.minutes}\nGames: ${record.games}\nReplay: ${record.replayId}${record.cohostId?`\nCo-host: <@${record.cohostId}>`:''}\n[Proof screenshot](${record.screenshotUrl})`)]}).catch(()=>{});
  return interaction.reply({content:`Host log saved (${record.id}).`,flags:MessageFlags.Ephemeral});
 }
};
