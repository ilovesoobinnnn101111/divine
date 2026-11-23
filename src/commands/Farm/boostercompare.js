import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const safe = (value, max = 40) => String(value ?? 'Unknown').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1').slice(0, max);
const formatDuration = ms => ms < 86400000 ? `${(ms / 3600000).toFixed(1)} hours` : `${(ms / 86400000).toFixed(1)} days`;

function calculate(orders) {
  const count = status => orders.filter(order => order.status === status).length;
  const completed = count('Completed');
  const durations = orders.filter(order => order.status === 'Completed').map(order => {
    const created = Number(order.created_at);
    if (!Number.isFinite(created) || created <= 0) return null;
    const completion = (Array.isArray(order.status_history) ? order.status_history : [])
      .filter(event => event.status === 'Completed' && Number.isFinite(Number(event.timestamp)) && Number(event.timestamp) >= created)
      .map(event => Number(event.timestamp)).sort((a, b) => a - b)[0];
    return completion === undefined ? null : completion - created;
  }).filter(ms => ms !== null);
  const heroCounts = new Map();
  for (const order of orders) {
    const hero = String(order.hero || '').trim();
    if (hero) heroCounts.set(hero, (heroCounts.get(hero) || 0) + 1);
  }
  const heroes = [...heroCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([hero, amount]) => `${safe(hero, 32)} (${amount})`).join(', ') || 'None recorded';
  return {
    total: orders.length, completed, pending: count('Pending'),
    inProgress: count('In Progress'), cancelled: count('Cancelled'), failed: count('Failed'),
    rate: orders.length ? completed / orders.length * 100 : 0,
    averageMs: durations.length ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length : null,
    heroes, measured: durations.length
  };
}

export default {
  data: new SlashCommandBuilder().setName('boostercompare')
    .setDescription('Compare two boosters side by side (Booster Manager only)')
    .addUserOption(option => option.setName('booster_one').setDescription('First booster').setRequired(true))
    .addUserOption(option => option.setName('booster_two').setDescription('Second booster').setRequired(true)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable.', flags: MessageFlags.Ephemeral });
    const one = interaction.options.getUser('booster_one', true);
    const two = interaction.options.getUser('booster_two', true);
    if (one.id === two.id)
      return interaction.reply({ content: 'Choose two different boosters to compare.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const orders = await readRecords(client, interaction.guildId, 'boosterOrders');
    const a = calculate(orders.filter(order => order.booster_id === one.id));
    const b = calculate(orders.filter(order => order.booster_id === two.id));
    if (!a.total && !b.total)
      return interaction.editReply('Neither booster has any currently active-record assignments to compare.');
    const format = stat => [
      `**Assigned:** ${stat.total}`,
      `**Completed:** ${stat.completed}`,
      `**Pending:** ${stat.pending}`,
      `**In Progress:** ${stat.inProgress}`,
      `**Cancelled:** ${stat.cancelled}`,
      `**Failed:** ${stat.failed}`,
      `**Completion Rate:** ${stat.total ? stat.rate.toFixed(1) + '%' : 'N/A'}`,
      `**Avg. Completion:** ${stat.averageMs === null ? 'N/A' : formatDuration(stat.averageMs)}`,
      `**Top Heroes:** ${stat.heroes}`
    ].join('\n');
    const notes = [];
    if (a.total && b.total) {
      if (a.rate !== b.rate) notes.push(`**Higher completion rate:** <@${a.rate > b.rate ? one.id : two.id}>`);
      else notes.push('**Completion rate:** Tied');
      if (a.completed !== b.completed) notes.push(`**More completed orders:** <@${a.completed > b.completed ? one.id : two.id}>`);
      else notes.push('**Completed orders:** Tied');
      if (a.averageMs !== null && b.averageMs !== null) {
        if (a.averageMs !== b.averageMs) notes.push(`**Shorter average completion:** <@${a.averageMs < b.averageMs ? one.id : two.id}>`);
        else notes.push('**Average completion time:** Tied');
      }
    } else notes.push('A full comparison requires at least one recorded order for each booster.');
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('⚖️ Booster Performance Comparison')
      .setDescription(`**Comparing:** <@${one.id}> vs. <@${two.id}>\n*Based on currently active order records; archived orders are excluded.*`)
      .addFields(
        { name: 'Booster One', value: `<@${one.id}>\n${format(a)}`, inline: true },
        { name: 'Booster Two', value: `<@${two.id}>\n${format(b)}`, inline: true },
        { name: '📊 Comparison Highlights', value: notes.join('\n') || 'Not enough data.', inline: false }
      ).setFooter({ text: `Completion time samples: ${a.measured} vs. ${b.measured} completed order(s)` }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
