import { SlashCommandBuilder, MessageFlags, EmbedBuilder, escapeMarkdown } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';

const check='<:1CL_checkwhite:1575465471015260190>', sparkle='<a:001_sparkles:1575070315724279918>', butterfly='<:gs_white_butterfly:1573946745577279608>', arrow='<:x_whitearrow:1575129831988002968>', cat='<:qw_pwhitekat:1575470985405010022>';
const format=m=>Math.floor(m/60)+'h '+Math.floor(m%60)+'m';
const WEEK = 7 * 24 * 60 * 60 * 1000;
export default {
  data: new SlashCommandBuilder().setName('trainerstats')
    .setDescription('View trainer ratings, hours and completed evaluations')
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
    const embed = new EmbedBuilder().setColor(0xFFFFFF)
      .setDescription('## '+sparkle+' Trainer Stats - '+escapeMarkdown(user.username))
      .setThumbnail(user.displayAvatarURL()).setTimestamp();
    if (!ratings.length && !sessions.length) {
      embed.addFields({name:arrow+' Activity',value:'No ratings or trainer sessions yet.'});
      return interaction.editReply({ embeds: [embed], allowedMentions:{parse:[]} });
    }
    if (ratings.length) {
      const avg = ratings.reduce((s,r) => s + Number(r.rating), 0) / ratings.length;
      const weekAvg = weekly.length ? weekly.reduce((s,r) => s + Number(r.rating), 0) / weekly.length : 0;
      const dist = [1,2,3,4,5].map(n => ratings.filter(r => Number(r.rating) === n).length);
      embed.addFields({name:sparkle+' Average Rating',value:avg.toFixed(2)+'/5.0',inline:true},{name:butterfly+' Past 7 Days',value:weekly.length+' ratings ('+weekAvg.toFixed(2)+'/5.0)',inline:true});
      embed.addFields(
        { name: sparkle+' Total Ratings', value: `${ratings.length} all-time\n${weekly.length} current week`, inline: true },
        { name: cat+' Rating Breakdown', value: [5,4,3,2,1].map(n => `${arrow} ${n}/5: ${dist[n-1]}`).join('\n'), inline: true }
      );
    }
    if (ratings.length) {
      const recent = [...ratings].sort((a,b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0)).slice(0,5);
      const lines = recent.map(r => {
        const when = Number(r.timestamp) > 0 ? `<t:${Math.floor(Number(r.timestamp) / 1000)}:f>` : 'Unknown date';
        const review = String(r.comment || 'No review text').replace(/@/g, '@\\u200b').slice(0,150);
        return `**${when}**\n**Rating ID:** \`${String(r.rating_id || 'Unknown').slice(0,80)}\`\n**Review:** ${review}`;
      });
      embed.addFields({ name: cat+' Recent Rating IDs & Reviews', value: lines.join('\n\n').slice(0,1024), inline: false });
    }
    if (sessions.length) {
      const reports = sessions.filter(r => r.type === 'watcher');
      const trainees = new Set(reports.map(r => r.trialHostId).filter(Boolean));
      embed.addFields({name:cat+' Training Evaluations',value:`${check} **Completed reports:** ${reports.length}\n${butterfly} **Unique trainees:** ${trainees.size}\n${arrow} **Hybrid:** ${reports.filter(r=>r.farmType==='Hybrid').length}\n${arrow} **222:** ${reports.filter(r=>['222','2-2-2'].includes(r.farmType)).length}`});
      const minutes = sessions.reduce((s,r) => s + (Number(r.minutes) || 0), 0);
      const recentMinutes = sessions.filter(r => Number(r.date) > Date.now() - WEEK).reduce((s,r) => s + (Number(r.minutes) || 0), 0);
      embed.addFields({ name: sparkle+' Trainer Hours', value: `${arrow} **Past 7 days:** ${format(recentMinutes)}\n${arrow} **All-time:** ${format(minutes)}\n${arrow} **Sessions:** ${sessions.length}` });
    }
    return interaction.editReply({ embeds: [embed], allowedMentions:{parse:[]} });
  }
};
