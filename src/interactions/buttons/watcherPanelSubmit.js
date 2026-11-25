import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import { sessions, authorized } from '../../commands/Farm/watcher-panel.js';
export default {
  name: 'watcher_panel_submit',
  async execute(interaction, client, args) {
    const ownerId = args[0];
    if (!interaction.inGuild() || interaction.user.id !== ownerId || !authorized(interaction.member))
      return interaction.reply({ content: 'You cannot submit this panel.', flags: MessageFlags.Ephemeral });
    const state = sessions.get(`${interaction.guildId}:${ownerId}`);
    if (!state || Date.now() - state.createdAt > 30 * 60 * 1000)
      return interaction.reply({ content: 'Panel expired. Run /watcher-panel again.', flags: MessageFlags.Ephemeral });
    const modal = new ModalBuilder().setCustomId(`watcher_panel_form:${ownerId}`).setTitle('Watcher Trial Report');
    const duration = new TextInputBuilder().setCustomId('duration').setLabel('Session duration (minutes, 1–240)').setStyle(TextInputStyle.Short).setPlaceholder('15').setRequired(true).setMaxLength(3);
    const phases = new TextInputBuilder().setCustomId('phases').setLabel('Phase evaluation (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(600);
    const overall = new TextInputBuilder().setCustomId('overall').setLabel('Overall feedback').setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(10).setMaxLength(1000);
    modal.addComponents(...[duration, phases, overall].map(x => new ActionRowBuilder().addComponents(x)));
    return interaction.showModal(modal);
  }
};
