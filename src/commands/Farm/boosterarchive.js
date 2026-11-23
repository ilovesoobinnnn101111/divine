import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const clean = (value, max = 80) => String(value ?? 'Unknown').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/([*_~`|])/g, '\\$1').slice(0, max);
const stamp = value => {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? `<t:${Math.floor(ms / 1000)}:f>` : 'Unknown';
};
const mention = id => /^\d{17,20}$/.test(String(id || '')) ? `<@${id}>` : 'Unknown';

export default {
  data: new SlashCommandBuilder().setName('boosterarchive')
    .setDescription('Review archived booster orders (Booster Manager only)')
    .addStringOption(option => option.setName('order_id').setDescription('Find an archived order by full or partial ID').setRequired(false).setMaxLength(40)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL is unavailable.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const query = interaction.options.getString('order_id')?.trim().toLowerCase() || '';
    const archived = await readRecords(client, interaction.guildId, 'boosterOrdersArchive');
    const results = archived.filter(order => !query || String(order.order_id || '').toLowerCase().includes(query))
      .sort((a, b) => (Number(b.archived_at) || 0) - (Number(a.archived_at) || 0));
    if (!results.length) return interaction.editReply(query ? '🔎 No archived orders match that order ID.' : '📦 No orders have been archived yet.');
    const lines = results.slice(0, 8).map(order =>
      `📦 \`${clean(order.order_id, 40)}\`\n**Booster:** ${mention(order.booster_id)} · **Status:** ${clean(order.status, 35)}\n**Archived:** ${stamp(order.archived_at)} · **By:** ${mention(order.archived_by)}`
    );
    const embed = new EmbedBuilder().setColor(0x95A5A6).setTitle('📦 Archived Booster Orders')
      .setDescription(`**Archived records:** ${archived.length}\n**Matching records:** ${results.length}${query ? `\n**Order ID filter:** \`${clean(query, 40)}\`` : ''}\n\n${lines.join('\n\n')}`.slice(0, 4096))
      .setFooter({ text: 'Read-only audit view · Up to 8 most recently archived orders' }).setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
