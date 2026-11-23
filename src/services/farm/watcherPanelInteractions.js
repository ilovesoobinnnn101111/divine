import { MessageFlags } from 'discord.js';
import { sessions, panel, authorized } from '../../commands/Farm/watcher-panel.js';

export async function handle(interaction, action, ownerId) {
  if (!interaction.inGuild() || interaction.user.id !== ownerId)
    return interaction.reply({ content: 'Only the person who opened this panel can change it.', flags: MessageFlags.Ephemeral });
  if (!authorized(interaction.member))
    return interaction.reply({ content: 'You no longer have permission to edit this panel.', flags: MessageFlags.Ephemeral });
  const state = sessions.get(`${interaction.guildId}:${ownerId}`);
  if (!state || Date.now() - state.createdAt > 30 * 60 * 1000)
    return interaction.reply({ content: 'This panel expired. Run /watcher-panel again.', flags: MessageFlags.Ephemeral });
  if (action === 'type') state.farmType = interaction.values[0];
  else if (action === 'rules') state.rulesSaid = !state.rulesSaid;
  else if (action === 'dc') state.dcOccurred = !state.dcOccurred;
  else if (action === 'grief') state.griefTroll = !state.griefTroll;
  return interaction.update(panel(state));
}
