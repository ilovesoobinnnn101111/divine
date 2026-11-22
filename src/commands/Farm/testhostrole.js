import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('testhostrole')
    .setDescription('Test Host of the Week role assignment and removal')
    .addUserOption(option => option.setName('member').setDescription('Member who agrees to the temporary test').setRequired(true)),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: 'Server only command.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, farmConfig.roles.manager)) {
      return interaction.reply({ content: 'Only host managers can test role assignment.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const roleId = process.env.HOST_OF_THE_WEEK_ROLE_ID?.trim();
    if (!/^\d{17,20}$/.test(roleId || '')) return interaction.editReply('HOST_OF_THE_WEEK_ROLE_ID is not configured.');
    const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!role) return interaction.editReply('Host of the Week role was not found.');
    const me = await interaction.guild.members.fetchMe();
    if (!me.permissions.has('ManageRoles') || role.position >= me.roles.highest.position) {
      return interaction.editReply('Divine needs Manage Roles and a higher role than Host of the Week.');
    }
    const user = interaction.options.getUser('member', true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.editReply('That member could not be found in the test server.');
    if (member.roles.cache.has(role.id)) return interaction.editReply('This member already has Host of the Week. No changes were made.');
    try {
      await member.roles.add(role, 'Temporary Host of the Week assignment test');
    } catch {
      return interaction.editReply('Role assignment failed. Check Divine role permissions and Railway logs.');
    }
    try {
      await member.roles.remove(role, 'Revert temporary Host of the Week assignment test');
    } catch {
      return interaction.editReply(`Role was assigned to <@${user.id}> but automatic removal failed. Please manually remove the Host of the Week role now.`);
    }
    return interaction.editReply(`Success: assigned and then removed Host of the Week from <@${user.id}>. No hosting records or winner announcements changed.`);
  },
};
