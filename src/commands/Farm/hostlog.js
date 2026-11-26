import { SlashCommandBuilder, MessageFlags, EmbedBuilder, escapeMarkdown } from 'discord.js';
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
  const extension=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'})[attachment.contentType.split(';')[0]];
  if(!extension)return interaction.reply({content:'Please upload a PNG, JPEG, WebP or GIF screenshot.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const record={id:`HL-${interaction.id}`,hostId:interaction.user.id,minutes:interaction.options.getInteger('minutes'),games:interaction.options.getInteger('games'),replayId:interaction.options.getString('replayid'),screenshotUrl:attachment.url,cohostId:interaction.options.getUser('cohost')?.id||null,timestamp:Date.now()};
  await appendRecord(client,interaction.guildId,'hostLogs',record);
  const channel=farmConfig.channels.hostLog?await client.channels.fetch(farmConfig.channels.hostLog).catch(()=>null):null;
  const sparkle='<a:001_sparkles:1575070315724279918>', butterfly='<:gs_white_butterfly:1573946745577279608>', arrow='<:x_whitearrow:1575129831988002968>', cat='<:qw_pwhitekat:1575470985405010022>', check='<:1CL_checkwhite:1575465471015260190>';
  const embed=new EmbedBuilder().setColor(0xFFFFFF).setThumbnail(interaction.user.displayAvatarURL()).setDescription('## '+sparkle+' Host Session Logged').addFields(
   {name:butterfly+' Host',value:'<@'+record.hostId+'>',inline:true},
   {name:cat+' Co-Host',value:record.cohostId?'<@'+record.cohostId+'>':'None',inline:true},
   {name:sparkle+' Duration',value:record.minutes+' minutes',inline:true},
   {name:arrow+' Games',value:String(record.games),inline:true},
   {name:arrow+' Replay ID',value:escapeMarkdown(record.replayId),inline:true},
   {name:check+' Proof Screenshot',value:'[Open original screenshot]('+record.screenshotUrl+')'}
  ).setImage('attachment://host-proof.'+extension).setFooter({text:'Host log • '+record.id}).setTimestamp(record.timestamp);
  let posted=false;
  if(channel?.send && channel.guildId===interaction.guildId){
   try{await channel.send({embeds:[embed],files:[{attachment:attachment.url,name:'host-proof.'+extension}],allowedMentions:{parse:[]}});posted=true;}catch(error){console.error('Host log proof posting failed:',error);}
  }

  return interaction.editReply({content:posted?`Host log saved (${record.id}).`:`Host log saved (${record.id}), but the proof could not be posted to the log channel. Please contact staff; do not submit again.`});
 }
};
