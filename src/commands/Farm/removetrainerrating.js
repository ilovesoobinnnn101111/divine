import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig, memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.HOST_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);

export default {
  data: new SlashCommandBuilder().setName('removetrainerrating')
    .setDescription('Remove one trainer review by rating ID (Host Managers only)')
    .addUserOption(o => o.setName('trainer').setDescription('Trainer whose review should be removed').setRequired(true))
    .addStringOption(o => o.setName('rating_id').setDescription('Exact rating ID from the review').setRequired(true)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Host Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL is unavailable. No reviews were changed.', flags: MessageFlags.Ephemeral });
    const trainer = interaction.options.getUser('trainer', true);
    const ratingId = interaction.options.getString('rating_id', true).trim();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const removed = await withRecordLock(client, interaction.guildId, 'trainerRatings', async () => {
      const records = await readRecords(client, interaction.guildId, 'trainerRatings');
      const idx = records.findIndex(r => r?.trainerId === trainer.id && r?.rating_id === ratingId);
      if (idx < 0) return null;
      const [found] = records.splice(idx, 1);
      const key = `${farmConfig.databasePrefix}${interaction.guildId}:trainerRatings`;
      await client.db.set(key, records);
      return found;
    });
    if (!removed) return interaction.editReply(`No rating with ID \`${ratingId}\` was found for <@${trainer.id}>. No records changed.`);
    const embed = new EmbedBuilder().setColor(0xE74C3C).setTitle('🗑️ Trainer Rating Removed')
      .setDescription(`Rating \`${ratingId}\` was removed from <@${trainer.id}>'s history.`)
      .addFields({ name: 'Trainer', value: `<@${trainer.id}>`, inline: true },
        { name: 'Rating', value: `${'⭐'.repeat(Number(removed.rating))} (${removed.rating}/5)`, inline: true })
      .setFooter({ text: `Removed by ${interaction.user.username}` }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
