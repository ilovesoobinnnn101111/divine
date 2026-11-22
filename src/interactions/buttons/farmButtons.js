import { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';
import { getActiveFarm, saveActiveFarm, refreshFarmMessage } from '../../services/farm/sessionService.js';

const handler = action => ({
  name: `farm:${action}`,
  async execute(interaction, client) {
    if (!interaction.inGuild()) return interaction.reply({ content: 'Server only.', flags: MessageFlags.Ephemeral });
    const session = await getActiveFarm(client, interaction.guildId);
    if (!session || session.messageId !== interaction.message.id) return interaction.reply({ content: 'This farm is no longer active.', flags: MessageFlags.Ephemeral });
    if (action === 'removealts') {
      if (session.hostId !== interaction.user.id) return interaction.reply({ content: 'Only the host can remove alt accounts.', flags: MessageFlags.Ephemeral });
      if (session.altAccounts < 1) return interaction.reply({ content: 'No alt accounts to remove.', flags: MessageFlags.Ephemeral });
      const modal = new ModalBuilder().setCustomId('farm:removealtsmodal').setTitle('Remove alt accounts');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Number of alt accounts to remove').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2)));
      return interaction.showModal(modal);
    }
    if (action === 'end') {
      if (session.hostId !== interaction.user.id && !memberHasFarmRole(interaction.member, farmConfig.roles.manager) && !interaction.member.permissions?.has('ManageGuild')) {
        return interaction.reply({ content: 'Only the host or a manager can end this farm.', flags: MessageFlags.Ephemeral });
      }
      await saveActiveFarm(client, interaction.guildId, null);
      await interaction.update({ content: 'Farm session ended.', embeds: [], components: [] });
      return;
    }
    if (farmConfig.roles.blacklist && interaction.member.roles?.cache?.has(farmConfig.roles.blacklist)) return interaction.reply({ content: 'You cannot join this farm.', flags: MessageFlags.Ephemeral });
    if (action === 'join' && !session.players.includes(interaction.user.id) && 1 + session.altAccounts + session.players.length >= 12) {
      return interaction.reply({ content: 'This farm is full (12/12 spots).', flags: MessageFlags.Ephemeral });
    }
    const players = new Set(session.players);
    if (action === 'join') players.add(interaction.user.id);
    else players.delete(interaction.user.id);
    session.players = [...players];
    await saveActiveFarm(client, interaction.guildId, session);
    await interaction.deferUpdate();
    await refreshFarmMessage(client, session);
  },
});

export default [handler('join'), handler('leave'), handler('end'), handler('removealts')];
