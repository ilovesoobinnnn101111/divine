import weekly from './boosterweekly.js';
import monthly from './boostermonthly.js';
import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const safe = value => String(value ?? 'Unspecified').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1').slice(0, 65);
const formatBreakdown = (entries, limit = 10) => entries.slice(0, limit).map(([name, count]) => `• ${safe(name)}: **${count}**`).join('\n') || 'None';

export default {
  data: new SlashCommandBuilder().setName('boosterreport')
    .setDescription('Booster team reports (Booster Manager only)')
    .addSubcommand(s=>s.setName('overall').setDescription('Overall booster report'))
    .addSubcommand(s=>s.setName('weekly').setDescription('Weekly booster report'))
    .addSubcommand(s=>s.setName('monthly').setDescription('Monthly booster report')),
  async execute(interaction, guildConfig, client) {
    const period=interaction.options.getSubcommand(false);
    if(period==='weekly')return weekly.execute(interaction,guildConfig,client);
    if(period==='monthly')return monthly.execute(interaction,guildConfig,client);
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL is unavailable.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const orders = await readRecords(client, interaction.guildId, 'boosterOrders');
    if (!orders.length) return interaction.editReply('📊 No booster orders have been recorded yet.');
    const count = status => orders.filter(order => order.status === status).length;
    const completed = count('Completed'), pending = count('Pending'), progress = count('In Progress');
    const cancelled = count('Cancelled'), failed = count('Failed');
    const categories = new Map(), boosters = new Map();
    for (const order of orders) {
      const category = order.category || 'Unspecified';
      categories.set(category, (categories.get(category) || 0) + 1);
      if (!order.booster_id) continue;
      const stats = boosters.get(order.booster_id) || { assigned: 0, completed: 0 };
      stats.assigned++;
      if (order.status === 'Completed') stats.completed++;
      boosters.set(order.booster_id, stats);
    }
    const categoryRows = [...categories.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    const top = [...boosters.entries()].sort((a, b) => b[1].completed - a[1].completed || b[1].assigned - a[1].assigned || a[0].localeCompare(b[0])).slice(0, 5);
    const topText = top.map(([id, s], i) => `${i + 1}. <@${id}> — **${s.completed} completed** / ${s.assigned} assigned (${(s.completed / s.assigned * 100).toFixed(1)}%)`).join('\n') || 'No assigned boosters.';
    const embed = new EmbedBuilder().setColor(0x8E44AD).setTitle('📊 Booster System Report')
      .setDescription(`**Total Orders:** ${orders.length}\n**Completion Rate:** ${(completed / orders.length * 100).toFixed(1)}%\n**Unique Assigned Boosters:** ${boosters.size}`)
      .addFields(
        { name: '✅ Completed', value: String(completed), inline: true },
        { name: '🟡 Pending', value: String(pending), inline: true },
        { name: '🔵 In Progress', value: String(progress), inline: true },
        { name: '❌ Cancelled', value: String(cancelled), inline: true },
        { name: '⚠️ Failed', value: String(failed), inline: true },
        { name: '📁 Orders by Category', value: formatBreakdown(categoryRows).slice(0, 1024), inline: false },
        { name: '🏆 Top Boosters', value: topText.slice(0, 1024), inline: false }
      ).setFooter({ text: 'All-time order statistics · Top 5 boosters · Top 10 categories' }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
