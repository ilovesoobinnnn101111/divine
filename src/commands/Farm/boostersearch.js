import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const statuses = ['Pending', 'In Progress', 'Completed', 'Cancelled', 'Failed'];
const safe = value => String(value ?? 'Unknown').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1');
const limit = (value, size) => safe(value).slice(0, size);
const emoji = { Pending: '🟡', 'In Progress': '🔵', Completed: '✅', Cancelled: '❌', Failed: '⚠️' };

export default {
  data: new SlashCommandBuilder().setName('boostersearch')
    .setDescription('Search booster orders (Booster Manager only)')
    .addStringOption(o => o.setName('order_id').setDescription('Search order IDs (partial match)').setRequired(false).setMaxLength(40))
    .addUserOption(o => o.setName('booster').setDescription('Filter by assigned booster').setRequired(false))
    .addStringOption(o => o.setName('status').setDescription('Filter by order status').setRequired(false).addChoices(...statuses.map(s => ({ name: s, value: s }))))
    .addStringOption(o => o.setName('category').setDescription('Filter by category (partial match)').setRequired(false).setMaxLength(100)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL is unavailable.', flags: MessageFlags.Ephemeral });
    const orderId = interaction.options.getString('order_id')?.trim().toLowerCase();
    const booster = interaction.options.getUser('booster');
    const status = interaction.options.getString('status');
    const category = interaction.options.getString('category')?.trim().toLowerCase();
    if (!orderId && !booster && !status && !category)
      return interaction.reply({ content: 'Provide at least one search filter: order_id, booster, status, or category.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const all = await readRecords(client, interaction.guildId, 'boosterOrders');
    const matching = all.filter(o =>
      (!orderId || String(o.order_id || '').toLowerCase().includes(orderId)) &&
      (!booster || o.booster_id === booster.id) &&
      (!status || o.status === status) &&
      (!category || String(o.category || '').toLowerCase().includes(category))
    ).sort((a, b) => (Number(b.updated_at) || Number(b.created_at) || 0) - (Number(a.updated_at) || Number(a.created_at) || 0));
    if (!matching.length) return interaction.editReply('🔎 No booster orders match those filters.');
    const lines = matching.slice(0, 10).map(o => {
      const currentStatus = o.status || 'Unknown';
      const id = limit(o.order_id, 42);
      const hero = limit(o.hero, 40);
      const level = limit(o.level, 40);
      const assigned = /^\d{17,20}$/.test(String(o.booster_id || '')) ? `<@${o.booster_id}>` : 'Unassigned';
      return `${emoji[currentStatus] || '⚪'} \`${id}\` — **${currentStatus}**\n${assigned} · ${hero} · ${level}`;
    });
    const filters = [
      orderId && `ID: \`${limit(orderId, 40)}\``,
      booster && `Booster: <@${booster.id}>`,
      status && `Status: ${status}`,
      category && `Category: ${limit(category, 80)}`
    ].filter(Boolean).join(' · ');
    const embed = new EmbedBuilder().setColor(0x3498DB).setTitle('🔎 Booster Order Search')
      .setDescription(`**Matches:** ${matching.length}\n**Filters:** ${filters}\n\n${lines.join('\n\n')}`.slice(0, 4096))
      .setFooter({ text: 'Showing up to 10 most recently updated matching orders' }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
