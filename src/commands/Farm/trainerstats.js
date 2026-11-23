import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';

const WEEK = 7 * 24 * 60 * 60 * 1000;
export default {
  data: new SlashCommandBuilder().setName('trainerstats')
    .setDescription('View a Host Trainer’s rating statistics')
    .addUserOption(o => o.setName('trainer').setDescription('Trainer to look up (defaults to you)').setRequired(false)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID)) {
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply();
    if (!client.db?.isAvailable?.()) return interaction.editReply('PostgreSQL is unavailable. Please try again later.');
    const user = interaction.options.getUser('trainer') || interaction.user;
    const [allRatings, trainerLogs, resets] = await Promise.all([
      readRecords(client, interaction.guildId, 'trainerRatings'),
      readRecords(client, interaction.guildId, 'trainerLogs'),
      readRecords(client, interaction.guildId, 'trainerRatingResets')
    ]);
    const ratings = allRatings.filter(r => r?.trainerId === user.id && Number.isInteger(Number(r.rating)) && Number(r.rating) >= 1 && Number(r.rating) <= 5);
    const lastReset = Math.max(0, ...resets.map(r => Number(r.timestamp) || 0));
    const weekly = ratings.filter(r => Number(r.timestamp) > Math.max(Date.now() - WEEK, lastReset));
    const sessions = trainerLogs.filter(r => r?.trainerId === user.id);
    const embed = new EmbedBuilder().setColor(0x9B59B6)
      .setTitle(`🎓 Trainer Stats - ${user.username}`)
      .setThumbnail(user.displayAvatarURL()).setTimestamp();
    if (!ratings.length && !sessions.length) {
      embed.setDescription('No ratings or trainer sessions yet.');
      return interaction.editReply({ embeds: [embed] });
    }
    if (ratings.length) {
      const avg = ratings.reduce((s,r) => s + Number(r.rating), 0) / ratings.length;
      const weekAvg = weekly.length ? weekly.reduce((s,r) => s + Number(r.rating), 0) / weekly.length : 0;
      const dist = [1,2,3,4,5].map(n => ratings.filter(r => Number(r.rating) === n).length);
      embed.setDescription(`**All-Time:** ${avg.toFixed(2)}/5.0 ${'⭐'.repeat(Math.round(avg))}${'☆'.repeat(5-Math.round(avg))}\n**Current week:** ${weekly.length} ratings (${weekAvg.toFixed(2)}/5.0)`);
      embed.addFields(
        { name: '📊 Total Ratings', value: `${ratings.length} all-time\n${weekly.length} current week`, inline: true },
        { name: '⭐ Breakdown', value: [5,4,3,2,1].map(n => `${n}⭐: ${dist[n-1]}`).join('\n'), inline: true }
      );
    }
    if (sessions.length) {
      const minutes = sessions.reduce((s,r) => s + (Number(r.minutes) || 0), 0);
      const recentMinutes = sessions.filter(r => Number(r.date) > Date.now() - WEEK).reduce((s,r) => s + (Number(r.minutes) || 0), 0);
      embed.addFields({ name: '⏱️ Trainer Hours', value: `Past 7 days: ${recentMinutes} min (${(recentMinutes/60).toFixed(1)}h)\nAll-time: ${minutes} min (${(minutes/60).toFixed(1)}h)\nSessions: ${sessions.length}` });
    }
    return interaction.editReply({ embeds: [embed] });
  }
};
