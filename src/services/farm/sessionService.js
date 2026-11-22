import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { farmConfig, memberHasFarmRole } from './config.js';

const key = guildId => `${farmConfig.databasePrefix}${guildId}:active`;

export function canHost(member) {
  return memberHasFarmRole(member, [...farmConfig.roles.host, ...farmConfig.roles.manager]);
}

export async function getActiveFarm(client, guildId) {
  return client.db.get(key(guildId), null);
}

export async function saveActiveFarm(client, guildId, session) {
  if (!client.db?.isAvailable?.()) {
    throw new Error('PostgreSQL is unavailable. Farm changes are disabled to prevent data loss.');
  }
  if (session) await client.db.set(key(guildId), session);
  else await client.db.delete(key(guildId));
}

export function farmButtons(session) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('farm:join').setLabel('Join').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('farm:leave').setLabel('Leave').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('farm:removealts').setLabel('Remove alts').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('farm:end').setLabel('End farm').setStyle(ButtonStyle.Danger),
  )];
}

export function farmEmbed(session) {
  return new EmbedBuilder()
    .setTitle(`${session.type === 'VIP' ? 'VIP' : 'Regular'} Farm Session`)
    .setColor(0xD95387)
    .setDescription(`Hosted by <@${session.hostId}>\n\n**Players (${session.players.length}):**\n${session.players.length ? session.players.map(id => `<@${id}>`).join(', ') : 'No players yet'}`)
    .addFields(
      { name: 'Spots filled', value: `${Math.min(12, 1 + session.altAccounts + session.players.length)}/12`, inline: true },
      { name: 'Alt accounts', value: String(session.altAccounts), inline: true },
      { name: 'Started', value: `<t:${Math.floor(session.startedAt / 1000)}:R>`, inline: true },
    );
}

export async function refreshFarmMessage(client, session) {
  const channel = await client.channels.fetch(session.channelId).catch(() => null);
  const message = await channel?.messages.fetch(session.messageId).catch(() => null);
  if (message) await message.edit({ embeds: [farmEmbed(session)], components: farmButtons(session) });
}
