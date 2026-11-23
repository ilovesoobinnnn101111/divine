import { EmbedBuilder, MessageFlags } from 'discord.js';
import { sessions, authorized } from '../../commands/Farm/watcher-panel.js';
import { appendRecord } from '../../services/farm/records.js';
export default {
  name: 'watcher_panel_form',
  async execute(interaction, client, args) {
    const ownerId = args[0];
    if (!interaction.inGuild() || interaction.user.id !== ownerId || !authorized(interaction.member))
      return interaction.reply({ content: 'You cannot submit this report.', flags: MessageFlags.Ephemeral });
    const key = `${interaction.guildId}:${ownerId}`;
    const state = sessions.get(key);
    if (!state || Date.now() - state.createdAt > 30 * 60 * 1000)
      return interaction.reply({ content: 'Panel expired. Run /watcher-panel again.', flags: MessageFlags.Ephemeral });
    const raw = interaction.fields.getTextInputValue('duration').trim();
    const minutes = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isInteger(minutes) || minutes < 1 || minutes > 240)
      return interaction.reply({ content: 'Enter a whole number of minutes between 1 and 240. No report was submitted.', flags: MessageFlags.Ephemeral });
    const phases = interaction.fields.getTextInputValue('phases')?.trim() || '';
    const overall = interaction.fields.getTextInputValue('overall')?.trim() || '';
    if (overall.length < 10) return interaction.reply({ content: 'Overall feedback must be at least 10 characters.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.()) return interaction.reply({ content: 'PostgreSQL unavailable. No report submitted.', flags: MessageFlags.Ephemeral });
    const channelId = process.env.WATCHER_REPORT_CHANNEL_ID?.trim();
    const channel = channelId ? await interaction.guild.channels.fetch(channelId).catch(() => null) : null;
    if (!channel?.send) return interaction.reply({ content: 'Watcher Report channel is unavailable. No report submitted.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const record = { report_id: `WR-${interaction.id}`, trainerId: interaction.user.id, trialHostId: state.trialHostId,
      trial_host: state.trialHostId, minutes, farmType: state.farmType, rulesSaid: state.rulesSaid, dcOccurred: state.dcOccurred,
      griefTroll: state.griefTroll, phases, notes: overall, screenshotUrl: state.screenshotUrl, date: Date.now(), type: 'watcher' };
    const embed = new EmbedBuilder().setColor(0x9B59B6).setTitle('🎓 New Watcher Trial Report')
      .setDescription(`**Trial Host:** <@${state.trialHostId}>\n**Watcher:** <@${ownerId}>\n**Farm Type:** ${state.farmType}\n**Duration:** ${minutes} min\n**Rules Said:** ${state.rulesSaid ? 'Yes' : 'No'}\n**DC:** ${state.dcOccurred ? 'Yes' : 'No'}\n**Grief:** ${state.griefTroll ? 'Yes' : 'No'}\n**Phases:** ${phases || 'Not specified'}\n**Overall Feedback:** ${overall}\n**Report ID:** \`${record.report_id}\``)
      .setImage(state.screenshotUrl).setTimestamp();
    try { await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }); }
    catch { return interaction.editReply('Could not post report. No trainer hours recorded.'); }
    try { await appendRecord(client, interaction.guildId, 'trainerLogs', record); }
    catch { sessions.delete(key); return interaction.editReply('Report posted, but saving trainer hours failed. Notify an administrator before retrying.'); }
    sessions.delete(key);
    return interaction.editReply(`✅ Report submitted to <#${channel.id}>. **${minutes} minutes** added to your trainer hours. Report ID: \`${record.report_id}\`.`);
  }
};
