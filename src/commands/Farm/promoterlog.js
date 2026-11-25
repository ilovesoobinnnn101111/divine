import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { appendRecord } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const roleIds = () => (process.env.PROMOTER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);
const validUrl = value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol); } catch { return false; }
};

export default {
  data: new SlashCommandBuilder().setName('promoterlog').setDescription('Log a social media promotion (promoters only)')
    .addStringOption(o => o.setName('videolink').setDescription('Link to the promoted video').setRequired(true).setMaxLength(200))
    .addStringOption(o => o.setName('platform').setDescription('Social media platform').setRequired(true).addChoices(
      { name: 'TikTok', value: 'TikTok' }, { name: 'YouTube', value: 'YouTube' },
      { name: 'Instagram', value: 'Instagram' }, { name: 'Twitter/X', value: 'Twitter' },
      { name: 'Twitch', value: 'Twitch' }, { name: 'Facebook', value: 'Facebook' },
      { name: 'Discord', value: 'Discord' }, { name: 'Other', value: 'Other' }))
    .addIntegerOption(o => o.setName('viewstoday').setDescription('Views today').setRequired(true).setMinValue(0).setMaxValue(99999999))
    .addIntegerOption(o => o.setName('totalviews').setDescription('Total views').setRequired(true).setMinValue(0).setMaxValue(999999999)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID)) {
      return interaction.reply({ content: 'This command is only available in the configured test server.', flags: MessageFlags.Ephemeral });
    }
    if (!memberHasFarmRole(interaction.member, roleIds())) {
      return interaction.reply({ content: 'Promoter role required.', flags: MessageFlags.Ephemeral });
    }
    const channelId = process.env.PROMOTER_LOG_CHANNEL_ID?.trim();
    if (!channelId) return interaction.reply({ content: 'PROMOTER_LOG_CHANNEL_ID is not configured.', flags: MessageFlags.Ephemeral });
    if (interaction.channelId !== channelId) return interaction.reply({ content: `Use this command in <#${channelId}>.`, flags: MessageFlags.Ephemeral });
    const videoLink = interaction.options.getString('videolink', true);
    if (!validUrl(videoLink)) return interaction.reply({ content: 'Provide a valid http(s) video link.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const record = {
      id: `PROMO-${interaction.id}`, promoterId: interaction.user.id, date: Date.now(),
      videoLink, platform: interaction.options.getString('platform', true),
      viewsToday: interaction.options.getInteger('viewstoday', true),
      totalViews: interaction.options.getInteger('totalviews', true)
    };
    await appendRecord(client, interaction.guildId, 'promoterLogs', record);
    const embed = new EmbedBuilder().setColor(0x9B59B6).setTitle('Promotion Log')
      .addFields(
        { name: 'Promoter', value: `<@${record.promoterId}>`, inline: true },
        { name: 'Platform', value: record.platform, inline: true },
        { name: 'Views today', value: record.viewsToday.toLocaleString(), inline: true },
        { name: 'Total views', value: record.totalViews.toLocaleString(), inline: true },
        { name: 'Video', value: `[View promotion](${record.videoLink})` }
      ).setTimestamp(record.date);
    try { await interaction.channel.send({ embeds: [embed], allowedMentions: { parse: [] } }); }
    catch { return interaction.editReply('Promotion saved in PostgreSQL, but the public log message could not be posted.'); }
    return interaction.editReply('Promotion logged successfully.');
  }
};
