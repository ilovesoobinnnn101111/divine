import { SlashCommandBuilder, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { readRecords, replaceRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.PROMOTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);

export default {
  data: new SlashCommandBuilder().setName('resetpromotions')
    .setDescription('Reset all promotion logs after confirmation (promoter managers only)'),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID)) {
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    }
    if (!memberHasFarmRole(interaction.member, managerRoles())) {
      return interaction.reply({ content: 'Promoter manager role required.', flags: MessageFlags.Ephemeral });
    }
    if (!client.db?.isAvailable?.()) {
      return interaction.reply({ content: 'PostgreSQL is unavailable. No records were changed.', flags: MessageFlags.Ephemeral });
    }
    const existing = await readRecords(client, interaction.guildId, 'promoterLogs');
    const confirmId = `resetpromo:confirm:${interaction.id}`;
    const cancelId = `resetpromo:cancel:${interaction.id}`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel('Confirm Reset').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );
    const warning = new EmbedBuilder().setColor(0xFF0000).setTitle('⚠️ Reset All Promotion Logs?')
      .setDescription(`This will permanently delete **${existing.length}** promotion log(s) from this server.\n\n**This cannot be undone.** Linked social media accounts will be preserved.\n\nOnly you can confirm. The buttons expire after 60 seconds.`);
    const reply = await interaction.reply({ embeds: [warning], components: [row], flags: MessageFlags.Ephemeral, withResponse: true });
    const message = reply.resource?.message;
    if (!message) {
      await interaction.editReply({ content: 'Unable to start confirmation. No records were changed.', embeds: [], components: [] });
      return;
    }
    try {
      const click = await message.awaitMessageComponent({
        filter: i => i.user.id === interaction.user.id && [confirmId, cancelId].includes(i.customId),
        time: 60_000
      });
      if (click.customId === cancelId) {
        return click.update({ content: 'Reset cancelled. No records were changed.', embeds: [], components: [] });
      }
      await click.deferUpdate();
      if (!memberHasFarmRole(click.member, managerRoles())) {
        return interaction.editReply({ content: 'Promoter manager role required. No records were changed.', embeds: [], components: [] });
      }
      if (!client.db?.isAvailable?.()) {
        return interaction.editReply({ content: 'PostgreSQL is unavailable. No records were changed.', embeds: [], components: [] });
      }
      await replaceRecords(client, interaction.guildId, 'promoterLogs', []);
      return interaction.editReply({ content: 'All promotion logs for this test server were reset. Linked social accounts were preserved.', embeds: [], components: [] });
    } catch (error) {
      if (error?.code === 'InteractionCollectorError' || /time/i.test(String(error?.message))) {
        return interaction.editReply({ content: 'Confirmation expired. No records were changed.', embeds: [], components: [] }).catch(() => {});
      }
      await interaction.editReply({ content: 'Reset failed. Please check the bot logs before trying again.', embeds: [], components: [] }).catch(() => {});
      throw error;
    }
  }
};
