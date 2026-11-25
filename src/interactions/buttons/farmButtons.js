import { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';
import { getActiveFarm, saveActiveFarm, refreshFarmMessage, earlyReasons, announceFarmStart } from '../../services/farm/sessionService.js';

const handler = action => ({
  name: `farm_${action}`,
  async execute(interaction, client) {
    if (!interaction.inGuild()) return interaction.reply({ content: 'Server only.', flags: MessageFlags.Ephemeral });
    const session = await getActiveFarm(client, interaction.guildId, interaction.message.id);
    if (!session || session.messageId !== interaction.message.id) return interaction.reply({ content: 'This farm is no longer active.', flags: MessageFlags.Ephemeral });
    if (action === 'removealts') {
      if (session.hostId !== interaction.user.id) return interaction.reply({ content: 'Only the host can remove alt accounts.', flags: MessageFlags.Ephemeral });
      if (session.altAccounts < 1) return interaction.reply({ content: 'No alt accounts to remove.', flags: MessageFlags.Ephemeral });
      const modal = new ModalBuilder().setCustomId('farm_removealtsmodal').setTitle('Remove alt accounts');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Number of alt accounts to remove').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2)));
      return interaction.showModal(modal);
    }
    if (action === 'end') {
      if (session.hostId !== interaction.user.id) {
        return interaction.reply({ content: 'Only the host who started this farm can end it early.', flags: MessageFlags.Ephemeral });
      }
      const menu=new StringSelectMenuBuilder().setCustomId('farm_earlyreason').setPlaceholder('Why did the farm end early?').addOptions(Object.entries(earlyReasons).map(([value,label])=>({value:session.messageId+':'+value,label})));
      return interaction.reply({content:'Select the reason for ending your farm early.',components:[new ActionRowBuilder().addComponents(menu)],flags:MessageFlags.Ephemeral});
    }
    if (farmConfig.roles.blacklist && interaction.member.roles?.cache?.has(farmConfig.roles.blacklist)) return interaction.reply({ content: 'You cannot join this farm.', flags: MessageFlags.Ephemeral });
    if (action === 'join' && interaction.user.id !== session.hostId && !session.players.includes(interaction.user.id) && 1 + session.altAccounts + session.players.length >= 12) {
      return interaction.reply({ content: 'This farm is full (12/12 spots).', flags: MessageFlags.Ephemeral });
    }
    const players = new Set(session.players);
    if (action === 'join' && interaction.user.id !== session.hostId) players.add(interaction.user.id);
    else players.delete(interaction.user.id);
    session.players = [...players];
    if (!session.fullStartedAt && 1 + session.altAccounts + session.players.length >= 12) session.fullStartedAt = Date.now();
    await saveActiveFarm(client, interaction.guildId, session);
    await interaction.deferUpdate();
    if(session.fullStartedAt)await announceFarmStart(client,interaction.guildId,session.messageId);
    await refreshFarmMessage(client, session);
  },
});

export default [handler('join'), handler('leave'), handler('end'), handler('removealts')];
