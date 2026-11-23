import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { appendRecord } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const roles = key => (process.env[key] || '').split(',').map(x => x.trim()).filter(Boolean);
const spam = /^(.)\1{4,}$|^(test|asdf|qwer|1234|aaaa|xxxx|none|n\/a|no comment|\.+)$/i;

export default {
  data: new SlashCommandBuilder().setName('ratetrainer').setDescription('Rate a Host Trainer (Baby Hosts only)')
    .addUserOption(o => o.setName('trainer').setDescription('Host Trainer to rate').setRequired(true))
    .addIntegerOption(o => o.setName('rating').setDescription('Stars from 1 to 5').setRequired(true).setMinValue(1).setMaxValue(5))
    .addStringOption(o => o.setName('review').setDescription('Your experience with this trainer (10–500 characters)').setRequired(true).setMinLength(10).setMaxLength(500)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID)) {
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    }
    if (!memberHasFarmRole(interaction.member, roles('BABY_HOST_ROLE_ID'))) {
      return interaction.reply({ content: 'Baby Host role required to rate trainers.', flags: MessageFlags.Ephemeral });
    }
    const trainer = interaction.options.getUser('trainer', true);
    if (trainer.id === interaction.user.id) return interaction.reply({ content: 'You cannot rate yourself.', flags: MessageFlags.Ephemeral });
    const trainerMember = await interaction.guild.members.fetch(trainer.id).catch(() => null);
    if (!trainerMember || !memberHasFarmRole(trainerMember, roles('HOST_TRAINER_ROLE_ID'))) {
      return interaction.reply({ content: 'That user is not a Host Trainer.', flags: MessageFlags.Ephemeral });
    }
    const rating = interaction.options.getInteger('rating', true);
    const comment = interaction.options.getString('review', true).trim();
    if (comment.length < 10 || spam.test(comment)) {
      return interaction.reply({ content: 'Please write a meaningful review of at least 10 characters.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.()) return interaction.editReply('PostgreSQL is unavailable. Your rating was not saved.');
    const record = { rating_id: `TRAINER-${interaction.id}`, trainerId: trainer.id, reviewerId: interaction.user.id, rating, comment, timestamp: Date.now() };
    await appendRecord(client, interaction.guildId, 'trainerRatings', record);
    const embed = new EmbedBuilder().setColor(0x9B59B6).setTitle('🎓 Trainer Rating Saved')
      .setDescription(`**Trainer:** <@${trainer.id}>\n**Rating:** ${'⭐'.repeat(rating)} (${rating}/5)\n**Review:** ${comment}\n\n**📋 Rating ID (copy this to remove the review):**\n\`${record.rating_id}\``)
      .setFooter({ text: 'Keep the Rating ID for moderation' }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
