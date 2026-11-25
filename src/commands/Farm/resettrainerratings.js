import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { readRecords, appendRecord } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.HOST_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);
const confirmations = new Map();
const EXPIRES_MS = 60_000;

export default {
  data: new SlashCommandBuilder().setName('resettrainerratings')
    .setDescription('Archive weekly trainer ratings without deleting all-time reviews (Host Managers)')
    .addStringOption(o => o.setName('confirmation').setDescription('Run once without this; then enter RESET within 60 seconds').setRequired(false)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Host Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL is unavailable. No records changed.', flags: MessageFlags.Ephemeral });
    const key = `${interaction.guildId}:${interaction.user.id}`;
    const answer = interaction.options.getString('confirmation')?.trim();
    const now = Date.now();
    for (const [k, expires] of confirmations) if (expires <= now) confirmations.delete(k);
    if (answer !== 'RESET') {
      confirmations.delete(key);
      if (answer) return interaction.reply({ content: 'Confirmation must be exactly RESET. No records changed.', flags: MessageFlags.Ephemeral });
      const [ratings, resets] = await Promise.all([
        readRecords(client, interaction.guildId, 'trainerRatings'),
        readRecords(client, interaction.guildId, 'trainerRatingResets')
      ]);
      const lastReset = Math.max(0, ...resets.map(r => Number(r.timestamp) || 0));
      const cutoff = Math.max(lastReset, now - 7 * 24 * 60 * 60 * 1000);
      const current = ratings.filter(r => Number(r.timestamp) >= cutoff);
      confirmations.set(key, now + EXPIRES_MS);
      const embed = new EmbedBuilder().setColor(0xFFAA00).setTitle('⚠️ Reset Weekly Trainer Ratings?')
        .setDescription(`This will archive **${current.length}** current-week rating(s) and restart the weekly leaderboard.\n\n**All-time ratings and reviews will remain saved.**\n\nRun **/resettrainerratings confirmation:RESET** within 60 seconds to confirm. Otherwise, do nothing.`);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
    const expires = confirmations.get(key);
    confirmations.delete(key);
    if (!expires || expires <= now)
      return interaction.reply({ content: 'Confirmation expired or was never started. No records changed.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [ratings, resets] = await Promise.all([
      readRecords(client, interaction.guildId, 'trainerRatings'),
      readRecords(client, interaction.guildId, 'trainerRatingResets')
    ]);
    const lastReset = Math.max(0, ...resets.map(r => Number(r.timestamp) || 0));
    const cutoff = Math.max(lastReset, Date.now() - 7 * 24 * 60 * 60 * 1000);
    const current = ratings.filter(r => Number(r.timestamp) >= cutoff);
    const trainers = new Set(current.map(r => r.trainerId)).size;
    await appendRecord(client, interaction.guildId, 'trainerRatingResets', {
      timestamp: Date.now(), managerId: interaction.user.id, archivedCount: current.length, trainerCount: trainers
    });
    return interaction.editReply(`🔄 Weekly Trainer Ratings Reset. Archived **${current.length}** weekly rating(s) across **${trainers}** trainers. All-time ratings were preserved.`);
  }
};
