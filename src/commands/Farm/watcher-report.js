import { SlashCommandBuilder, MessageFlags, EmbedBuilder, escapeMarkdown } from 'discord.js';
import { appendRecord } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const ids = name => (process.env[name] || '').split(',').map(x => x.trim()).filter(Boolean);
export default {
  data: new SlashCommandBuilder().setName('watcher-report')
    .setDescription('Submit a trial-host Watcher Report and record trainer minutes')
    .addUserOption(o => o.setName('trial_host').setDescription('Member being evaluated').setRequired(true))
    .addAttachmentOption(o => o.setName('scoreboard').setDescription('Scoreboard screenshot').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Actual training session duration in minutes').setRequired(true).setMinValue(1).setMaxValue(240))
    .addStringOption(o => o.setName('farm_type').setDescription('Type of farm').setRequired(true)
      .addChoices({name:'Hybrid',value:'Hybrid'},{name:'222',value:'222'}))
    .addStringOption(o => o.setName('notes').setDescription('Evaluation notes').setRequired(true).setMinLength(10).setMaxLength(1000)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    const authorized = ['HOST_MANAGER_ROLE_ID','HOST_TRAINER_ROLE_ID','WATCHER_ROLE_ID','OWNER_ROLE_ID']
      .some(k => memberHasFarmRole(interaction.member, ids(k)));
    if (!authorized)
      return interaction.reply({ content: 'Host Manager, Host Trainer, Watcher, or Owner role required.', flags: MessageFlags.Ephemeral });
    const channelId = process.env.WATCHER_REPORT_CHANNEL_ID?.trim();
    if (!channelId) return interaction.reply({ content: 'WATCHER_REPORT_CHANNEL_ID is not configured. No report was saved.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.()) return interaction.reply({ content: 'PostgreSQL is unavailable. No report was saved.', flags: MessageFlags.Ephemeral });
    const screenshot = interaction.options.getAttachment('scoreboard', true);
    if (!screenshot.contentType?.startsWith('image/'))
      return interaction.reply({ content: 'The scoreboard must be an image.', flags: MessageFlags.Ephemeral });
    const extension=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'})[screenshot.contentType.split(';')[0]];
    if(!extension)return interaction.reply({content:'Please upload a PNG, JPEG, WebP or GIF screenshot.',flags:MessageFlags.Ephemeral});
    const target = interaction.options.getUser('trial_host', true);
    const minutes = interaction.options.getInteger('minutes', true);
    const farmType = interaction.options.getString('farm_type', true);
    if(!['Hybrid','222'].includes(farmType))return interaction.reply({content:'Choose Hybrid or 222.',flags:MessageFlags.Ephemeral});
    const notes = interaction.options.getString('notes', true).trim();
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.send) return interaction.reply({ content: 'Watcher report channel is missing or not writable. No report was saved.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const record = { report_id: `WR-${interaction.id}`, trainerId: interaction.user.id, trialHostId: target.id,
      trial_host: target.username, minutes, farmType, notes, screenshotUrl: screenshot.url, date: Date.now(), type: 'watcher' };
    const sparkle='<a:001_sparkles:1575070315724279918>', butterfly='<:gs_white_butterfly:1573946745577279608>', arrow='<:x_whitearrow:1575129831988002968>', cat='<:qw_pwhitekat:1575470985405010022>', check='<:1CL_checkwhite:1575465471015260190>';
    const embed=new EmbedBuilder().setColor(0xFFFFFF).setThumbnail(interaction.user.displayAvatarURL()).setDescription('## '+sparkle+' New Watcher Trial Report').addFields(
      {name:butterfly+' Trial Host',value:'<@'+target.id+'>',inline:true},
      {name:cat+' Watcher',value:'<@'+interaction.user.id+'>',inline:true},
      {name:sparkle+' Training Time',value:minutes+' minutes',inline:true},
      {name:arrow+' Farm Type',value:farmType},
      {name:arrow+' Notes',value:escapeMarkdown(notes).slice(0,1024)||'None'},
      {name:check+' Scoreboard',value:'[Open original screenshot]('+screenshot.url+')'}
    ).setImage('attachment://watcher-proof.'+extension).setFooter({text:'Report ID: '+record.report_id}).setTimestamp(record.date);
    try {
      await channel.send({ embeds: [embed], files:[{attachment:screenshot.url,name:'watcher-proof.'+extension}], allowedMentions: { parse: [] } });
    } catch {
      return interaction.editReply('Could not post the Watcher Report. No trainer hours were recorded.');
    }
    try {
      await appendRecord(client, interaction.guildId, 'trainerLogs', record);
    } catch {
      return interaction.editReply('The report was posted, but saving trainer hours failed. Please notify an administrator to avoid duplicate reporting.');
    }
    return interaction.editReply(`Watcher Report submitted. **${minutes} minutes** recorded for your trainer hours. Report ID: \`${record.report_id}\`.`);
  }
};
