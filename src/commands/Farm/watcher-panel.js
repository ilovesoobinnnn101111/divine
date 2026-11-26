import { SlashCommandBuilder, MessageFlags, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const ids = name => (process.env[name] || '').split(',').map(x => x.trim()).filter(Boolean);
export const sessions = new Map();
export const authorized = member => ['HOST_MANAGER_ROLE_ID','HOST_TRAINER_ROLE_ID','WATCHER_ROLE_ID','OWNER_ROLE_ID'].some(k => memberHasFarmRole(member, ids(k)));
export function panel(state) {
  const embed = new EmbedBuilder().setColor(0xFFFFFF).setTitle('<a:001_sparkles:1575070315724279918> Watcher Trial Evaluation')
    .setDescription(`<:gs_white_butterfly:1573946745577279608> **Trial Host:** <@${state.trialHostId}>\n<:x_whitearrow:1575129831988002968> **Farm Type:** ${state.farmType}\n<:x_whitearrow:1575129831988002968> **Rules Said:** ${state.rulesSaid ? 'Yes' : 'No'}\n<:x_whitearrow:1575129831988002968> **Disconnect:** ${state.dcOccurred ? 'Yes' : 'No'}\n<:x_whitearrow:1575129831988002968> **Griefing/Trolling:** ${state.griefTroll ? 'Yes' : 'No'}\n\nSet the farm type and checklist below. Use **Open Form & Submit** when the checklist is ready. Your existing \`/watcher-report\` command also remains available.`)
    .setImage(state.screenshotUrl).setTimestamp();
  const select = new StringSelectMenuBuilder().setCustomId(`watcher_panel_type:${state.userId}`).setPlaceholder('Choose farm type')
    .addOptions(['Hybrid','222'].map(value => ({ label: value, value, default: state.farmType === value })));
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`watcher_panel_rules:${state.userId}`).setLabel(`Rules Said: ${state.rulesSaid ? 'Yes' : 'No'}`).setStyle(state.rulesSaid ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`watcher_panel_dc:${state.userId}`).setLabel(`DC: ${state.dcOccurred ? 'Yes' : 'No'}`).setStyle(state.dcOccurred ? ButtonStyle.Danger : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`watcher_panel_grief:${state.userId}`).setLabel(`Grief: ${state.griefTroll ? 'Yes' : 'No'}`).setStyle(state.griefTroll ? ButtonStyle.Danger : ButtonStyle.Secondary)
  );
  const submit = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`watcher_panel_submit:${state.userId}`).setLabel('Open Form & Submit').setStyle(ButtonStyle.Primary));
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select), buttons, submit], allowedMentions: { parse: [] } };
}
export default {
  data: new SlashCommandBuilder().setName('watcher-panel').setDescription('Open the interactive Watcher trial checklist')
    .addUserOption(o => o.setName('trial_host').setDescription('Member being evaluated').setRequired(true))
    .addAttachmentOption(o => o.setName('scoreboard').setDescription('Scoreboard screenshot').setRequired(true)),
  async execute(interaction) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!authorized(interaction.member)) return interaction.reply({ content: 'Host Manager, Host Trainer, Watcher, or Owner role required.', flags: MessageFlags.Ephemeral });
    const image = interaction.options.getAttachment('scoreboard', true);
    if (!image.contentType?.startsWith('image/')) return interaction.reply({ content: 'Upload an image screenshot.', flags: MessageFlags.Ephemeral });
    const state = { userId: interaction.user.id, guildId: interaction.guildId, trialHostId: interaction.options.getUser('trial_host', true).id,
      screenshotUrl: image.url, farmType: 'Hybrid', rulesSaid: true, dcOccurred: false, griefTroll: false, createdAt: Date.now() };
    sessions.set(`${interaction.guildId}:${interaction.user.id}`, state);
    return interaction.reply({ ...panel(state), flags: MessageFlags.Ephemeral });
  }
};
