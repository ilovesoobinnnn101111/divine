import { AttachmentBuilder, ChannelType, EmbedBuilder } from 'discord.js';

const TRANSCRIPT_CHANNEL_ID = '1571956074184179785';
const MAX_MESSAGES = 10000;
const clean = value => String(value ?? '').replace(/\r/g, '').replace(/\u0000/g, '');
const stamp = value => value ? new Date(value).toISOString() : 'Unknown';

export async function archiveTicketTranscript(channel, ticketData, closer, reason) {
  const destination = await channel.guild.channels.fetch(TRANSCRIPT_CHANNEL_ID).catch(() => null);
  if (!destination || destination.type !== ChannelType.GuildText || typeof destination.send !== 'function')
    throw new Error('Ticket transcript destination is unavailable. Ticket was not closed.');

  const collected = [];
  let before;
  while (collected.length < MAX_MESSAGES) {
    const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!page.size) break;
    collected.push(...page.values());
    before = page.last().id;
    if (page.size < 100) break;
  }
  collected.sort((a,b) => Number(BigInt(a.id) - BigInt(b.id)));
  const lines = [
    'DIVINE TICKET TRANSCRIPT',
    `Ticket: #${channel.name} (${channel.id})`,
    `Server: ${channel.guild.name} (${channel.guild.id})`,
    `Customer ID: ${ticketData.userId}`,
    `Opened: ${ticketData.createdAt || 'Unknown'}`,
    `Closed by: ${closer.tag || closer.id} (${closer.id})`,
    `Closed at: ${new Date().toISOString()}`,
    `Reason: ${clean(reason)}`,
    `Messages exported: ${collected.length}`,
    collected.length >= MAX_MESSAGES ? 'WARNING: Transcript reached the 10,000 message safety limit; older messages may be omitted.' : '',
    '----------------------------------------'
  ];
  for (const msg of collected) {
    lines.push(`[${stamp(msg.createdAt)}] ${clean(msg.author?.tag || 'Unknown')} (${msg.author?.id || 'unknown'}):`);
    if (msg.content) lines.push(clean(msg.content));
    for (const attachment of msg.attachments.values()) lines.push(`[Attachment: ${clean(attachment.name)}] ${attachment.url}`);
    for (const embed of msg.embeds) lines.push(`[Embed] ${JSON.stringify(embed.toJSON())}`);
    if (!msg.content && !msg.attachments.size && !msg.embeds.length) lines.push('[Non-text message]');
    lines.push('');
  }
  const bytes = Buffer.from(lines.join('\n'), 'utf8');
  // Discord file limits vary by guild. Keep the transcript below the baseline upload limit.
  if (bytes.length > 7_500_000) throw new Error('Transcript is too large to upload safely; ticket was not closed.');
  const filename = `ticket-${channel.id}-transcript.txt`;
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📁 Ticket Transcript Saved')
    .addFields(
      {name:'Ticket',value:`#${channel.name} (\`${channel.id}\`)`},
      {name:'Customer',value:`<@${ticketData.userId}>`,inline:true},
      {name:'Closed by',value:`<@${closer.id}>`,inline:true},
      {name:'Messages',value:String(collected.length),inline:true},
      {name:'Reason',value:clean(reason).slice(0,1000)||'None'}
    ).setTimestamp();
  const sent = await destination.send({
    embeds:[embed],
    files:[new AttachmentBuilder(bytes,{name:filename})],
    allowedMentions:{parse:[]}
  });
  return {messageId:sent.id,channelId:destination.id,count:collected.length};
}
