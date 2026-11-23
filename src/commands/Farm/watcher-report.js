import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
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
      .addChoices({name:'Hybrid',value:'Hybrid'},{name:'Rivals',value:'Rivals'},{name:'Other',value:'Other'}))
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
    const target = interaction.options.getUser('trial_host', true);
    const minutes = interaction.options.getInteger('minutes', true);
    const farmType = interaction.options.getString('farm_type', true);
    const notes = interaction.options.getString('notes', true).trim();
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.send) return interaction.reply({ content: 'Watcher report channel is missing or not writable. No report was saved.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const record = { report_id: `WR-${interaction.id}`, trainerId: interaction.user.id, trialHostId: target.id,
      trial_host: target.username, minutes, farmType, notes, screenshotUrl: screenshot.url, date: Date.now(), type: 'watcher' };
    const embed = new EmbedBuilder().setColor(0x9B59B6).setTitle('🎓 New Watcher Trial Report')
      .setDescription(`**Trial Host:** <@${target.id}>\n**Watcher:** <@${interaction.user.id}>\n**Farm Type:** ${farmType}\n**Training Time:** ${minutes} min\n**Notes:** ${notes}\n**Report ID:** \`${record.report_id}\``)
      .setImage(screenshot.url).setTimestamp();
    try {
      await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
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
