import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { readRecords, replaceRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.PROMOTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);
const confirmations = new Map();
const EXPIRES_MS = 60_000;

export default {
  data: new SlashCommandBuilder().setName('resetpromotions')
    .setDescription('Reset promotion logs with a second confirmation command (managers only)')
    .addStringOption(option => option.setName('confirmation')
      .setDescription('First run without this option; then enter RESET within 60 seconds')
      .setRequired(false)),
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
    const key = `${interaction.guildId}:${interaction.user.id}`;
    const answer = interaction.options.getString('confirmation')?.trim();
    const now = Date.now();
    for (const [k, expiry] of confirmations) if (expiry <= now) confirmations.delete(k);
    if (answer !== 'RESET') {
      confirmations.delete(key);
      if (answer) return interaction.reply({ content: 'Confirmation must be exactly RESET. No records were changed.', flags: MessageFlags.Ephemeral });
      const logs = await readRecords(client, interaction.guildId, 'promoterLogs');
      confirmations.set(key, now + EXPIRES_MS);
      const warning = new EmbedBuilder().setColor(0xFF0000)
        .setTitle('⚠️ Reset All Promotion Logs?')
        .setDescription(`This will permanently delete **${logs.length}** promotion log(s) from this test server.\n\n**This cannot be undone.** Social links are preserved.\n\nTo confirm, run **/resetpromotions confirmation:RESET** within 60 seconds. To cancel, do nothing.`);
      return interaction.reply({ embeds: [warning], flags: MessageFlags.Ephemeral });
    }
    const expiry = confirmations.get(key);
    confirmations.delete(key);
    if (!expiry || expiry <= now) {
      return interaction.reply({ content: 'No active reset confirmation, or it expired. Run /resetpromotions without options first. No records were changed.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.()) return interaction.editReply('PostgreSQL is unavailable. No records were changed.');
    await replaceRecords(client, interaction.guildId, 'promoterLogs', []);
    return interaction.editReply('All promotion logs were reset. Linked social accounts were preserved.');
  }
};
