import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';

export default {
  data: new SlashCommandBuilder().setName('trainerleaderboard').setDescription('View the weekly Host Trainer ratings leaderboard'),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply();
    if (!client.db?.isAvailable?.()) return interaction.editReply('PostgreSQL is unavailable. Please try again later.');
    const all = await readRecords(client, interaction.guildId, 'trainerRatings');
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const byTrainer = new Map();
    for (const r of all) {
      const rating = Number(r?.rating);
      if (!r?.trainerId || !Number.isInteger(rating) || rating < 1 || rating > 5 || Number(r.timestamp) < cutoff) continue;
      const s = byTrainer.get(r.trainerId) || { trainerId: r.trainerId, count: 0, sum: 0 };
      s.count++; s.sum += rating; byTrainer.set(r.trainerId, s);
    }
    const stats = [...byTrainer.values()].map(s => ({ ...s, avg: s.sum / s.count }));
    const embed = new EmbedBuilder().setColor(0xFFD700).setTitle('🎓 Weekly Trainer Leaderboard')
      .setDescription(`**Period:** Past 7 days\n**Active Trainers:** ${stats.length}`).setTimestamp();
    if (!stats.length) embed.setDescription('No ratings in the past 7 days yet.');
    const medal = i => ['🥇','🥈','🥉'][i] || `${i + 1}.`;
    const rated = stats.filter(s => s.count >= 2).sort((a,b) => b.avg-a.avg || b.count-a.count).slice(0,5);
    const most = [...stats].sort((a,b) => b.count-a.count || b.avg-a.avg).slice(0,5);
    if (rated.length) embed.addFields({ name: '⭐ Top Rated Trainers (min 2 ratings)', value: rated.map((s,i) => `${medal(i)} <@${s.trainerId}>\n⭐ **${s.avg.toFixed(2)}/5.0** • ${s.count} ratings`).join('\n') });
    if (most.length) embed.addFields({ name: '📊 Most Rated Trainers', value: most.map((s,i) => `${medal(i)} <@${s.trainerId}> — **${s.count}** ratings (${s.avg.toFixed(2)}/5.0)`).join('\n') });
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
