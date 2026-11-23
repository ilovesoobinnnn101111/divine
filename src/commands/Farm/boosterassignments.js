import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const mention = id => /^\d{17,20}$/.test(String(id || '')) ? `<@${id}>` : 'Unknown';
const threshold = () => {
  const n = Number(process.env.BOOSTER_MULTIPLE_OPEN_ALERT_COUNT);
  return Number.isFinite(n) && n >= 2 ? Math.ceil(n) : 3;
};

export default {
  data: new SlashCommandBuilder().setName('boosterassignments')
    .setDescription('View current booster workloads (Booster Manager only)'),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL unavailable.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const orders = await readRecords(client, interaction.guildId, 'boosterOrders');
    const unfinished = orders.filter(order => order.status === 'Pending' || order.status === 'In Progress');
    const workloads = new Map();
    for (const order of unfinished) {
      const id = order.booster_id;
      if (!id) continue;
      const stats = workloads.get(id) || { pending: 0, inProgress: 0, urgent: 0, high: 0, oldest: null };
      if (order.priority === 'Urgent') stats.urgent++;
      if (order.priority === 'High') stats.high++;
      if (order.status === 'Pending') stats.pending++;
      else stats.inProgress++;
      const created = Number(order.created_at);
      if (Number.isFinite(created) && created > 0 && created <= Date.now() && (stats.oldest === null || created < stats.oldest))
        stats.oldest = created;
      workloads.set(id, stats);
    }
    const sorted = [...workloads.entries()].sort((a, b) =>
      (b[1].pending + b[1].inProgress) - (a[1].pending + a[1].inProgress) ||
      (a[1].oldest ?? Infinity) - (b[1].oldest ?? Infinity) || a[0].localeCompare(b[0]));
    const limit = threshold();
    const overloaded = sorted.filter(([, stats]) => stats.pending + stats.inProgress >= limit).length;
    const lines = sorted.slice(0, 10).map(([id, stats], index) => {
      const total = stats.pending + stats.inProgress;
      const label = total >= limit ? '🔴 High workload' : '🟢 Normal';
      const oldest = stats.oldest === null ? 'Unknown' : `<t:${Math.floor(stats.oldest / 1000)}:R>`;
      return `**${index + 1}.** ${mention(id)} — **${total} unfinished** · ${label}\n🟡 Pending: ${stats.pending} · 🔵 In Progress: ${stats.inProgress} · 🔴 Urgent: ${stats.urgent} · 🟠 High: ${stats.high} · Oldest: ${oldest}`;
    });
    const urgentTotal = unfinished.filter(order => order.priority === 'Urgent').length;
    const unassigned = unfinished.filter(order => !order.booster_id).length;
    const embed = new EmbedBuilder().setColor(overloaded ? 0xE67E22 : 0x3498DB).setTitle('📋 Booster Assignment Workloads')
      .setDescription(`**Unfinished orders:** ${unfinished.length}\n**Urgent unfinished orders:** ${urgentTotal}\n**Boosters with unfinished orders:** ${sorted.length}\n**High-workload boosters (${limit}+ orders):** ${overloaded}\n**Orders without a booster ID:** ${unassigned}\n\n${lines.join('\n\n') || '✅ No boosters currently have unfinished assignments.'}`.slice(0, 4096))
      .setFooter({ text: 'Top 10 busiest boosters · Current active records only · Workload threshold configurable via Railway' }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
