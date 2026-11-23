import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export default {
  data: new SlashCommandBuilder().setName('trainerhours')
    .setDescription('View Host Trainer session hours and recent training sessions')
    .addUserOption(o => o.setName('trainer').setDescription('Host Trainer to look up (defaults to you)').setRequired(false)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply();
    if (!client.db?.isAvailable?.()) return interaction.editReply('PostgreSQL is unavailable. Please try again later.');
    const user = interaction.options.getUser('trainer') || interaction.user;
    const records = await readRecords(client, interaction.guildId, 'trainerLogs');
    const logs = records.filter(r => r?.trainerId === user.id && Number.isFinite(Number(r.minutes)) && Number(r.minutes) > 0)
      .sort((a,b) => (Number(b.date) || 0) - (Number(a.date) || 0));
    const embed = new EmbedBuilder().setColor(0x9B59B6)
      .setTitle(`⏱️ Trainer Hours - ${user.username}`).setThumbnail(user.displayAvatarURL()).setTimestamp();
    if (!logs.length) {
      embed.setDescription('No trainer sessions logged yet.\n\nTrainer hours will appear here when training sessions are recorded through the Watcher Report system.');
      return interaction.editReply({ embeds: [embed] });
    }
    const cutoff = Date.now() - WEEK_MS;
    const weekly = logs.filter(r => Number(r.date) >= cutoff);
    const sum = arr => arr.reduce((total,r) => total + Number(r.minutes), 0);
    const weeklyMins = sum(weekly), totalMins = sum(logs);
    embed.addFields(
      { name: '📅 Past 7 Days', value: `**${weeklyMins}** min (${(weeklyMins / 60).toFixed(1)}h)\n**${weekly.length}** sessions`, inline: true },
      { name: '📈 All-Time', value: `**${totalMins}** min (${(totalMins / 60).toFixed(1)}h)\n**${logs.length}** sessions`, inline: true }
    );
    const recent = logs.slice(0,5).map((r,i) => {
      const date = Number(r.date);
      const when = Number.isFinite(date) && date > 0 ? `<t:${Math.floor(date / 1000)}:R>` : 'Unknown date';
      const farm = String(r.farmType || 'Unknown').replace(/@/g, '@\\u200b').slice(0,60);
      const trainee = r.trial_host ? `\n   🎓 Trained: ${String(r.trial_host).replace(/@/g, '@\\u200b').slice(0,80)}` : '';
      return `${i+1}. **${Number(r.minutes)} min** • ${farm} • ${when}${trainee}`;
    });
    embed.addFields({ name: '📋 Recent Sessions', value: recent.join('\n').slice(0,1024) });
    embed.setFooter({ text: 'Trainer hours are recorded from Watcher Reports' });
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
