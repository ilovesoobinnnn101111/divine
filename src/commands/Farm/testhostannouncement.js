import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('testhostannouncement')
    .setDescription('Test Host of the Week announcement setup (host managers only)'),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }
    if (!memberHasFarmRole(interaction.member, farmConfig.roles.manager)) {
      return interaction.reply({ content: 'Only host managers can test Host of the Week announcements.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channelId = process.env.HOST_OF_THE_WEEK_CHANNEL_ID?.trim();
    const roleId = process.env.HOST_OF_THE_WEEK_ROLE_ID?.trim();
    if (!/^\d{17,20}$/.test(channelId || '') || !/^\d{17,20}$/.test(roleId || '')) {
      return interaction.editReply('Configure HOST_OF_THE_WEEK_CHANNEL_ID and HOST_OF_THE_WEEK_ROLE_ID in Railway.');
    }
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.send) return interaction.editReply('Announcement channel is missing or is not a text channel in this server.');
    const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!role) return interaction.editReply('Host of the Week role is missing from this server.');
    const me = await interaction.guild.members.fetchMe();
    const permissions = channel.permissionsFor(me);
    if (!permissions?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
      return interaction.editReply('Divine needs View Channel, Send Messages and Embed Links in the announcement channel.');
    }
    if (!me.permissions.has('ManageRoles') || role.position >= me.roles.highest.position) {
      return interaction.editReply('Divine needs Manage Roles and its highest role must be above Host of the Week.');
    }
    const embed = new EmbedBuilder()
      .setTitle('Host of the Week — Test Announcement')
      .setColor(0xFFD700)
      .setDescription('This is a test of the Host of the Week announcement system. No winner has been selected and no roles or quota records were changed.')
      .setTimestamp();
    try {
      await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (error) {
      return interaction.editReply('Unable to post the test announcement. Check the channel permissions and Railway logs.');
    }
    return interaction.editReply(`Test announcement posted successfully in <#${channel.id}>. No roles were assigned.`);
  },
};
