import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

export default {
  data: new SlashCommandBuilder().setName('lordboostcalculator')
    .setDescription('Post the Lord Boost price calculator embed (Booster Manager only)'),
  async execute(interaction) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    const roles = (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!memberHasFarmRole(interaction.member, roles))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('Lord Boost Calculator')
      .setDescription('☄ Click below to see how much your order costs.');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lordcalc:open').setStyle(ButtonStyle.Primary).setLabel('🌟 Estimate Your Order Cost')
    );
    await interaction.reply({ content: 'Calculator posted below.', flags: MessageFlags.Ephemeral });
    try { await interaction.channel.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } }); }
    catch { await interaction.followUp({ content: 'Could not post in this channel. Check Send Messages and Embed Links permissions.', flags: MessageFlags.Ephemeral }); }
  }
};
