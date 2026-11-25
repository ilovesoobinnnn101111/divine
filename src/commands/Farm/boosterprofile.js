import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const safe = (value, max = 50) => String(value ?? 'Unknown').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1').slice(0, max);
const duration = ms => ms < 86400000 ? `${(ms / 3600000).toFixed(1)} hours` : `${(ms / 86400000).toFixed(1)} days`;
const stamp = ms => Number.isFinite(Number(ms)) && Number(ms) > 0 ? `<t:${Math.floor(Number(ms) / 1000)}:R>` : 'Unknown';

export default {
  data: new SlashCommandBuilder().setName('boosterprofile')
    .setDescription('View a complete booster performance profile (Booster Manager only)')
    .addUserOption(option => option.setName('booster').setDescription('Booster to review').setRequired(true)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const booster = interaction.options.getUser('booster', true);
    const orders = (await readRecords(client, interaction.guildId, 'boosterOrders'))
      .filter(order => order.booster_id === booster.id);
    if (!orders.length) return interaction.editReply({ content: `📊 <@${booster.id}> has no active-record assignments yet.`, allowedMentions: { parse: [] } });
    const count = status => orders.filter(order => order.status === status).length;
    const completed = count('Completed');
    const durations = orders.filter(order => order.status === 'Completed').map(order => {
      const created = Number(order.created_at);
      if (!Number.isFinite(created) || created <= 0) return null;
      const completedAt = (Array.isArray(order.status_history) ? order.status_history : [])
        .filter(event => event.status === 'Completed' && Number.isFinite(Number(event.timestamp)) && Number(event.timestamp) >= created)
        .map(event => Number(event.timestamp)).sort((a, b) => a - b)[0];
      return completedAt === undefined ? null : completedAt - created;
    }).filter(ms => ms !== null);
    const avg = durations.length ? duration(durations.reduce((sum, ms) => sum + ms, 0) / durations.length) : 'Not available';
    const heroCounts = new Map();
    for (const order of orders) {
      const hero = String(order.hero || '').trim();
      if (hero) heroCounts.set(hero, (heroCounts.get(hero) || 0) + 1);
    }
    const heroes = [...heroCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([hero, n]) => `${safe(hero, 55)} (${n})`).join('\n') || 'No heroes recorded';
    const recent = [...orders].sort((a, b) => Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0))
      .slice(0, 5).map(order => `\`${safe(order.order_id, 40)}\` · ${safe(order.hero, 35)} · ${safe(order.status, 25)} · ${stamp(order.updated_at || order.created_at)}`).join('\n');
    const latest = Math.max(0, ...orders.flatMap(order => [
      Number(order.created_at) || 0,
      Number(order.updated_at) || 0,
      ...(Array.isArray(order.status_history) ? order.status_history.map(item => Number(item.timestamp) || 0) : []),
      ...(Array.isArray(order.restoration_history) ? order.restoration_history.map(item => Number(item.restored_at) || 0) : [])
    ]));
    const embed = new EmbedBuilder().setColor(0x9B59B6).setTitle('👤 Booster Profile')
      .setDescription(`**Booster:** <@${booster.id}>\n**Last recorded activity:** ${stamp(latest)}\n*Statistics use currently stored active orders; archived orders are excluded.*`)
      .addFields(
        { name: '📋 Total Assigned', value: String(orders.length), inline: true },
        { name: '✅ Completed', value: String(completed), inline: true },
        { name: '📈 Completion Rate', value: `${(completed / orders.length * 100).toFixed(1)}%`, inline: true },
        { name: '🟡 Pending', value: String(count('Pending')), inline: true },
        { name: '🔵 In Progress', value: String(count('In Progress')), inline: true },
        { name: '❌ Cancelled', value: String(count('Cancelled')), inline: true },
        { name: '⚠️ Failed', value: String(count('Failed')), inline: true },
        { name: '⏱️ Average Completion Time', value: avg, inline: true },
        { name: '🏅 Most Assigned Heroes', value: heroes.slice(0, 1024) },
        { name: '🕒 Recent Orders', value: recent.slice(0, 1024) || 'None' }
      ).setFooter({ text: `Average uses ${durations.length} completed order(s) with recorded timestamps · Up to 5 recent orders` }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
