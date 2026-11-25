import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.HOST_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);

export default {
  data: new SlashCommandBuilder().setName('trainerratings')
    .setDescription('Look up trainer reviews and their rating IDs (Host Managers only)')
    .addUserOption(o => o.setName('trainer').setDescription('Host Trainer whose reviews you want to see').setRequired(true)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Host Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL is unavailable. Cannot retrieve reviews.', flags: MessageFlags.Ephemeral });
    const trainer = interaction.options.getUser('trainer', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const all = await readRecords(client, interaction.guildId, 'trainerRatings');
    const reviews = all.filter(r => r?.trainerId === trainer.id && r?.rating_id)
      .sort((a,b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
    const embed = new EmbedBuilder().setColor(0x9B59B6)
      .setTitle(`🎓 Trainer Reviews — ${trainer.username}`)
      .setDescription(reviews.length
        ? `**Total reviews:** ${reviews.length}\nShowing the ${Math.min(5, reviews.length)} most recent reviews. Copy a Rating ID into \`/removetrainerrating\`.`
        : 'No saved reviews found for this trainer.')
      .setTimestamp();
    for (const r of reviews.slice(0,5)) {
      const stars = Number(r.rating);
      const date = Number(r.timestamp);
      const when = Number.isFinite(date) && date > 0 ? `<t:${Math.floor(date / 1000)}:f>` : 'Unknown date';
      const comment = String(r.comment || 'No review text').replace(/@/g, '@\u200b').slice(0,500);
      embed.addFields({
        name: `${Number.isInteger(stars) && stars >= 1 && stars <= 5 ? '⭐'.repeat(stars) : 'Rating'} — ${when}`,
        value: `**Rating ID:** \`${String(r.rating_id).slice(0,120)}\`\n**Review:** ${comment}`,
        inline: false
      });
    }
    if (reviews.length > 5) embed.setFooter({ text: `${reviews.length - 5} older review(s) not shown` });
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
