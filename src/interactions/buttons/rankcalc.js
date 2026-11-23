import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { submitBoostRequest } from '../../services/farm/boostRequests.js';

const ranks = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Grandmaster', 'Celestial', 'Eternity', 'One Above All'];
const prices = { Solo: [20, 20, 20, 30, 40, 80], Duo: [30, 30, 30, 40, 60, 100] };
const money = amount => '$' + amount.toFixed(2);
const select = (key, nonce, placeholder, choices, selected) => new ActionRowBuilder().addComponents(
  new StringSelectMenuBuilder().setCustomId(`rankcalc_${key}:${nonce}`).setPlaceholder(placeholder)
    .addOptions(choices.map(([label,value]) => ({ label, value, default: value === selected })))
);
function estimate(start, end, mode) {
  if (end <= start) return { error: 'Desired rank must be higher than current rank.' };
  if (end >= 7) return { negotiable: true };
  const steps = [];
  for (let i = start; i < end; i++) steps.push({ label: `${ranks[i]} → ${ranks[i+1]}`, price: prices[mode][i] });
  return { steps, total: steps.reduce((sum, step) => sum + step.price, 0) };
}
function display(state, nonce, final = false) {
  const result = estimate(state.start, state.end, state.mode);
  const detail = result.error ? result.error : result.negotiable
    ? '💬 **Negotiable price — contact a Booster Manager for a custom quote.**'
    : `${result.steps.map(s => `• ${s.label}: **${money(s.price)}**`).join('\n')}\n\n**Estimated total: ${money(result.total)}**`;
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🎪 Rank Boost Calculator')
    .setDescription(`**Boosting type:** ${state.mode}\n**Current rank:** ${ranks[state.start]}\n**Desired rank:** ${ranks[state.end]}\n\n**Price breakdown**\n${detail}\n\n**Solo:** Booster plays on your account (requires account credentials).\n**Duo:** You queue together (no account credentials needed).\n\n**Platforms:** Steam · Epic Games · PlayStation · Xbox\n*Custom plans available. Prices are estimates for full rank-tier transitions; individual division progress requires a custom quote.*`);
  if (final) return { embeds: [embed], components: [], allowedMentions: { parse: [] } };
  return {
    embeds: [embed], allowedMentions: { parse: [] },
    components: [
      select('mode', nonce, 'Choose Solo or Duo', [['Solo Boosting','Solo'],['Duo Boosting','Duo']], state.mode),
      select('start', nonce, 'Choose your current rank', ranks.map((x,i)=>[x,String(i)]), String(state.start)),
      select('end', nonce, 'Choose your desired rank', ranks.map((x,i)=>[x,String(i)]), String(state.end)),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rankcalc_done:${nonce}`).setLabel('Calculate Estimate').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`rankcalc_reset:${nonce}`).setLabel('Reset').setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

export default {
  name: 'rankcalc',
  async execute(interaction) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (interaction.customId !== 'rankcalc:open')
      return interaction.reply({ content: 'Click the public Rank Boost Calculator button again.', flags: MessageFlags.Ephemeral });
    const nonce = interaction.id;
    const state = { mode: 'Solo', start: 0, end: 3 };
    await interaction.reply({ ...display(state, nonce), flags: MessageFlags.Ephemeral });
    const reply = await interaction.fetchReply();
    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && i.customId.endsWith(`:${nonce}`),
      time: 14 * 60 * 1000, idle: 5 * 60 * 1000
    });
    collector.on('collect', async i => {
      try {
        const action = i.customId.split(':')[0];
        if (action === 'rankcalc_mode') state.mode = i.values[0];
        else if (action === 'rankcalc_start') state.start = Number(i.values[0]);
        else if (action === 'rankcalc_end') state.end = Number(i.values[0]);
        else if (action === 'rankcalc_reset') Object.assign(state, { mode: 'Solo', start: 0, end: 3 });
        else if (action === 'rankcalc_request') {
          return i.update({components:[new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rankcalc_openticket:${nonce}`).setStyle(ButtonStyle.Success).setLabel('Open Boost Ticket'),
            new ButtonBuilder().setCustomId(`rankcalc_back:${nonce}`).setStyle(ButtonStyle.Secondary).setLabel('Back')
          )]});
        }
        else if (action === 'rankcalc_back') {
          return i.update({components:[new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rankcalc_request:${nonce}`).setStyle(ButtonStyle.Success).setLabel('Request This Boost')
          )]});
        }
        else if (action === 'rankcalc_openticket') {
          const result = estimate(state.start, state.end, state.mode);
          if (result.error) return i.reply({content:result.error,flags:MessageFlags.Ephemeral});
          await i.deferUpdate();
          const summary = `${state.mode}: ${ranks[state.start]} → ${ranks[state.end]}`;
          try {
            const response = await submitBoostRequest(i,i.client,{
              type:'Rank Boost',summary,total:result.negotiable?null:result.total,
              details:{mode:state.mode,start:ranks[state.start],end:ranks[state.end],negotiable:Boolean(result.negotiable)}
            });
            if(response.error)return i.editReply({content:response.error,embeds:[],components:[]});
            collector.stop('finished');
            return i.editReply({content:`✅ Request \`${response.request.request_id}\` submitted in <#${response.ticketChannelId}> for manager review. ${response.warning||''}`,embeds:[],components:[]});
          } catch {return i.editReply({content:'Could not submit request. Please try again.',embeds:[],components:[]});}
        }
        else if (action === 'rankcalc_done') {
          const result = estimate(state.start, state.end, state.mode);
          if (result.error) return i.reply({ content: result.error, flags: MessageFlags.Ephemeral });
          await i.update({ ...display(state, nonce, true), components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rankcalc_request:${nonce}`).setStyle(ButtonStyle.Success).setLabel('Request This Boost')
          )] });
          return;
        }
        await i.update(display(state, nonce));
      } catch {
        if (!i.replied && !i.deferred) await i.reply({ content: 'Could not update the calculator. Please reopen it.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    });
    collector.on('end', async (_, reason) => {
      if (reason === 'finished') return;
      await interaction.editReply({ content: 'Calculator session expired. Click the public button to start again.', embeds: [], components: [] }).catch(() => {});
    });
  }
};
