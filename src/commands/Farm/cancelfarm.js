import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { canHost, getActiveFarm, completeFarm } from '../../services/farm/sessionService.js';

export default {
  data: new SlashCommandBuilder().setName('cancelfarm').setDescription('Cancel your active farm session (hosts only)'),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || !canHost(interaction.member)) return interaction.reply({ content: 'Only farm hosts can cancel sessions.', flags: MessageFlags.Ephemeral });
    const session = await getActiveFarm(client, interaction.guildId, interaction.user.id);
    if (!session) return interaction.reply({ content: 'No active farm session.', flags: MessageFlags.Ephemeral });
    const isManager = interaction.member.permissions?.has('ManageGuild');
    if (session.hostId !== interaction.user.id && !isManager) return interaction.reply({ content: 'Only the host or a server manager can cancel this farm.', flags: MessageFlags.Ephemeral });
    await completeFarm(client, interaction.guildId, session, 'CANCELLED');
    const channel = await client.channels.fetch(session.channelId).catch(() => null);
    const message = await channel?.messages.fetch(session.messageId).catch(() => null);
    if (message) await message.edit({ content: 'Farm session cancelled.', embeds: [], components: [] }).catch(() => {});
    return interaction.reply({ content: 'Farm cancelled.', flags: MessageFlags.Ephemeral });
  },
};
