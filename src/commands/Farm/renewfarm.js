import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { canHost, getActiveFarm, saveActiveFarm, refreshFarmMessage } from '../../services/farm/sessionService.js';
import { farmConfig } from '../../services/farm/config.js';

export default {
  data: new SlashCommandBuilder().setName('renewfarm').setDescription('Renew your active farm for another hour'),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (farmConfig.guildId && interaction.guildId !== farmConfig.guildId)) return interaction.reply({ content: 'Farm commands are not enabled here.', flags: MessageFlags.Ephemeral });
    if (!canHost(interaction.member)) return interaction.reply({ content: 'Host role required.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const farm = await getActiveFarm(client, interaction.guildId);
    if (!farm || farm.hostId !== interaction.user.id) return interaction.editReply('You do not have an active farm to renew.');
    farm.startedAt = Date.now();
    farm.renewalCount = (farm.renewalCount || 0) + 1;
    await saveActiveFarm(client, interaction.guildId, farm);
    await refreshFarmMessage(client, farm);
    return interaction.editReply(`Farm renewed for another hour (renewal #${farm.renewalCount}).`);
  },
};
