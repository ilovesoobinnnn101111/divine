import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { farmConfig } from '../../services/farm/config.js';
import { canHost, getActiveFarm, saveActiveFarm, farmEmbed, farmButtons } from '../../services/farm/sessionService.js';

export default {
  data: new SlashCommandBuilder().setName('startfarm').setDescription('Start a farm session (hosts only)')
    .addStringOption(option => option.setName('type').setDescription('Farm type').setRequired(true)
      .addChoices({ name: '222 (30 minutes)', value: '222' }, { name: 'Hybrid (60 minutes)', value: 'HYBRID' }, { name: '336 (60 minutes)', value: '336' }))
    .addIntegerOption(option => option.setName('altaccounts').setDescription('Number of alt accounts (0-11)').setRequired(true).setMinValue(0).setMaxValue(11)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || !canHost(interaction.member)) return interaction.reply({ content: 'Only farm hosts can start sessions.', flags: MessageFlags.Ephemeral });
    if (farmConfig.guildId && interaction.guildId !== farmConfig.guildId) return interaction.reply({ content: 'Farm commands are not enabled in this server.', flags: MessageFlags.Ephemeral });
    if (await getActiveFarm(client, interaction.guildId, interaction.user.id)) return interaction.reply({ content: 'You already have an active farm. End it before starting another.', flags: MessageFlags.Ephemeral });
    const channel = interaction.channel?.send ? interaction.channel : await client.channels.fetch(interaction.channelId).catch(() => null);
    if (!channel?.send || (channel.guildId ?? channel.guild?.id) !== interaction.guildId) return interaction.reply({ content: 'Use this command in a sendable server channel.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const session = { hostId: interaction.user.id, type: interaction.options.getString('type'), altAccounts: interaction.options.getInteger('altaccounts'), players: [], startedAt: Date.now(), fullStartedAt: interaction.options.getInteger('altaccounts') === 11 ? Date.now() : null, channelId: channel.id };
    const message = await channel.send({ embeds: [farmEmbed(session)], components: farmButtons(session) });
    session.messageId = message.id;
    try { await saveActiveFarm(client, interaction.guildId, session); }
    catch (error) { await message.delete().catch(() => {}); throw error; }
    await interaction.editReply(`Farm session started in <#${channel.id}>.`);
  },
};
