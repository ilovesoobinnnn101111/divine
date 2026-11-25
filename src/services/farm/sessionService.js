import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { farmConfig, memberHasFarmRole } from './config.js';
import { appendRecord } from './records.js';

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
    new ButtonBuilder().setCustomId('farm_join').setLabel('Join').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('farm_leave').setLabel('Leave').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('farm_removealts').setLabel('Remove alts').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('farm_end').setLabel('End farm').setStyle(ButtonStyle.Danger),
  )];
}

export const farmDuration = type => type === '222' ? 30 : 60;
export const farmSlots = session => Math.min(12, 1 + session.altAccounts + session.players.length);
export function farmEmbed(session) {
  const duration = farmDuration(session.type);
  const start = session.fullStartedAt;
  const elapsed = start ? Math.max(0, Date.now() - start) : 0;
  const progress = Math.min(100, elapsed / (duration * 60000) * 100);
  const filled = Math.floor(progress / 10);
  const status = session.completed ? 'Completed' : start ? 'In Progress' : 'Waiting for Players';
  return new EmbedBuilder().setColor(0xF5A9D0)
    .setTitle((session.type === 'REGULAR' ? 'Regular' : session.type === 'HYBRID' ? 'Hybrid' : session.type) + ' Farm Session')
    .setDescription('**Progress**\n**'+progress.toFixed(1)+'%**\n`'+'█'.repeat(filled)+'░'.repeat(10-filled)+'`\n\n**⏱ Time Remaining**\n'+(session.completed ? 'Complete' : start ? '<t:'+Math.floor((start+duration*60000)/1000)+':R>' : duration+' minutes (starts when full)')+'\n\n**♛ Host**\n<@'+session.hostId+'>\n\n**Status**\n'+status+'\n\n**Players**\n'+farmSlots(session)+'/12\n'+(session.players.length ? session.players.map(id=>'<@'+id+'>').join(', ') : 'No players yet')+'\n\n**Alt Accounts**\nHost has '+session.altAccounts+' alt account(s) in the farm.')
    .setFooter({text: 'Farm session • '+duration+' minutes'}).setTimestamp();
}

export async function refreshFarmMessage(client, session) {
  const channel = await client.channels.fetch(session.channelId).catch(() => null);
  const message = await channel?.messages.fetch(session.messageId).catch(() => null);
  if (message) await message.edit({ embeds: [farmEmbed(session)], components: session.completed ? [] : farmButtons(session) });
}

/** Save a completed session before removing the active session. */
export async function completeFarm(client, guildId, session, reason = 'COMPLETED') {
  await appendRecord(client, guildId, 'completedSessions', {
    id: session.messageId,
    hostId: session.hostId,
    playerIds: [...new Set(session.players || [])].filter(id => id !== session.hostId),
    startedAt: session.startedAt,
    endedAt: Date.now(),
    reason,
  });
  await saveActiveFarm(client, guildId, null);
}
