import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);
const statuses = ['Pending', 'In Progress', 'Completed', 'Cancelled', 'Failed'];
const categories = ['Rank Boost', 'Hero Boost', 'Duo Queue', 'Coaching'];

export default {
  data: new SlashCommandBuilder().setName('orderstats')
    .setDescription('View booster order statistics (Booster Manager only)')
    .addUserOption(o => o.setName('booster').setDescription('Filter by an assigned booster').setRequired(false)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL is unavailable.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const booster = interaction.options.getUser('booster');
    const all = await readRecords(client, interaction.guildId, 'boosterOrders');
    const orders = booster ? all.filter(o => o.booster_id === booster.id) : all;
    const count = (field, value) => orders.filter(o => o[field] === value).length;
    const statusLines = statuses.map(s => `**${s}:** ${count('status', s)}`).join('\n');
    const categoryLines = categories.map(c => `**${c}:** ${count('category', c)}`).join('\n');
    const byBooster = new Map();
    for (const o of orders) {
      if (!o.booster_id) continue;
      const item = byBooster.get(o.booster_id) || { total: 0, completed: 0 };
      item.total += 1;
      if (o.status === 'Completed') item.completed += 1;
      byBooster.set(o.booster_id, item);
    }
    const top = [...byBooster.entries()].sort((a,b) => b[1].total - a[1].total).slice(0, 10)
      .map(([id, item], i) => `**${i+1}.** <@${id}> — ${item.total} orders (${item.completed} completed)`).join('\n');
    const embed = new EmbedBuilder().setColor(0x3498DB)
      .setTitle(booster ? '📊 Booster Order Statistics' : '📊 All Booster Order Statistics')
      .setDescription(booster ? `Statistics for <@${booster.id}>` : 'Summary of saved booster order assignments')
      .addFields(
        { name: '📋 Total Orders', value: String(orders.length), inline: true },
        { name: '✅ Completion Rate', value: orders.length ? `${Math.round(count('status', 'Completed') / orders.length * 100)}%` : '0%', inline: true },
        { name: '📌 Status Breakdown', value: statusLines, inline: false },
        { name: '📁 Category Breakdown', value: categoryLines, inline: false },
        { name: '👥 Booster Activity', value: top || 'No assigned orders yet.', inline: false }
      ).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
