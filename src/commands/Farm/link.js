import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';

const promoterRoles = () => (process.env.PROMOTER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const validUrl = value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol); }
  catch { return false; }
};

export default {
  data: new SlashCommandBuilder().setName('link').setDescription('Link a social media account to your promoter profile')
    .addStringOption(option => option.setName('platform').setDescription('Social media platform').setRequired(true).addChoices(
      { name: 'TikTok', value: 'TikTok' }, { name: 'YouTube', value: 'YouTube' },
      { name: 'Instagram', value: 'Instagram' }, { name: 'Twitter/X', value: 'Twitter' },
      { name: 'Twitch', value: 'Twitch' }, { name: 'Facebook', value: 'Facebook' },
      { name: 'Snapchat', value: 'Snapchat' }, { name: 'Discord', value: 'Discord' },
      { name: 'Other', value: 'Other' }))
    .addStringOption(option => option.setName('url').setDescription('Your public profile URL').setRequired(true).setMaxLength(300)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID)) {
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    }
    if (!memberHasFarmRole(interaction.member, promoterRoles())) {
      return interaction.reply({ content: 'Promoter role required.', flags: MessageFlags.Ephemeral });
    }
    const platform = interaction.options.getString('platform', true);
    const url = interaction.options.getString('url', true);
    if (!validUrl(url)) return interaction.reply({ content: 'Enter a valid http(s) profile URL.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.()) return interaction.editReply('PostgreSQL is unavailable. Please try again later.');
    const guildId = interaction.guildId;
    const key = `${farmConfig.databasePrefix}${guildId}:promoterLinks`;
    let ownLinks;
    await withRecordLock(client, guildId, 'promoterLinks', async () => {
      const all = await readRecords(client, guildId, 'promoterLinks');
      const filtered = all.filter(link => !(link?.promoterId === interaction.user.id && String(link.platform).toLowerCase() === platform.toLowerCase()));
      filtered.push({ promoterId: interaction.user.id, platform, url, updatedAt: Date.now() });
      await client.db.set(key, filtered);
      ownLinks = filtered.filter(link => link?.promoterId === interaction.user.id);
    });
    const embed = new EmbedBuilder().setColor(0x00AA55).setTitle('✅ Social Account Linked')
      .setDescription(`**${platform}** linked successfully.`)
      .addFields({ name: 'Your accounts', value: ownLinks.slice(0, 12).map(link => `**${link.platform}** — [Profile](${link.url})`).join('\n').slice(0, 1024) })
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }
};
