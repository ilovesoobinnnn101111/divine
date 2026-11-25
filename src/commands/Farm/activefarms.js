import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getActiveFarm } from '../../services/farm/sessionService.js';
import { farmConfig } from '../../services/farm/config.js';

export default {
  data: new SlashCommandBuilder().setName('activefarms').setDescription('View the current active farm'),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (farmConfig.guildId && interaction.guildId !== farmConfig.guildId)) return interaction.reply({ content: 'Farm commands are not enabled here.', flags: MessageFlags.Ephemeral });
    const farm = await getActiveFarm(client, interaction.guildId);
    if (!farm) return interaction.reply({ content: 'There is no active farm.', flags: MessageFlags.Ephemeral });
    const end = Math.floor((farm.startedAt + 60 * 60 * 1000) / 1000);
    return interaction.reply({ content: `**${farm.type} farm** hosted by <@${farm.hostId}>\nPlayers: ${farm.players.length}\nEnds: <t:${end}:R>\n<#${farm.channelId}>`, allowedMentions: { parse: [] }, flags: MessageFlags.Ephemeral });
  },
};
