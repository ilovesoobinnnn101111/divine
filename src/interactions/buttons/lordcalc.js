import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { submitBoostRequest } from '../../services/farm/boostRequests.js';

const heroes = [
  'Adam Warlock','Angela','Black Cat','Black Panther','Black Widow','Blade','Captain America','Cloak & Dagger',
  'Cyclops','Daredevil','Deadpool','Devil Dinosaur','Doctor Strange','Elsa Bloodstone','Emma Frost','Gambit',
  'Gorr the God Butcher','Groot','Hawkeye','Hela','Hulk','Human Torch','Invisible Woman','Iron Fist',
  'Iron Man','Jeff the Land Shark','Jubilee','Loki','Luna Snow','Magik','Magneto','Mantis','Mister Fantastic',
  'Moon Knight','Namor','Nightcrawler','Peni Parker','Phoenix','Psylocke','Rocket Raccoon','Rogue',
  'Scarlet Witch','Spider-Man','Squirrel Girl','Star-Lord','Storm','The Hood','The Punisher','The Thing',
  'Thor','Ultron','Venom','White Fox','Winter Soldier','Wolverine'
];
const tiers = [
  ['Agent',0],['Knight',5],['Captain',15],['Centurion',30],['Lord',50],['Count',80],
  ['Colonel',110],['Warrior',140],['Elite',170],['Guardian',200],['Champion (Level 50)',230],
  ...Array.from({ length: 4 }, (_, i) => [`Level ${55 + i * 5}`, 290 + i * 60])
];
const money = value => `$${value.toFixed(2)}`;
const options = arr => arr.map((name, i) => ({ label: name.slice(0, 100), value: String(i) }));
const groups = [heroes.slice(0, 20), heroes.slice(20, 40), heroes.slice(40)];
const groupStart = [0,20,40];
const groupLabels = ['Heroes 1–20 (A–H)','Heroes 21–40 (H–R)','Heroes 41–55 (R–W)'];

function view(state, nonce) {
  const { group, hero, start, end, items } = state;
  const subtotal = items.reduce((sum, item) => sum + item.cost, 0);
  const current = hero !== null && end > start ? tiers[end][1] - tiers[start][1] : null;
  const lines = items.map((x,i) => `**${i+1}.** ${x.hero}: ${tiers[x.start][0]} → ${tiers[x.end][0]} — **${money(x.cost)}**`);
  const description = [
    'Choose a hero, current proficiency and desired proficiency. Click **Add Character** to include it in your estimate.',
    '',
    `**Selected hero:** ${hero === null ? 'None' : heroes[hero]}`,
    `**Current:** ${tiers[start][0]}`,
    `**Desired:** ${tiers[end][0]}`,
    `**This character:** ${current === null ? 'Choose a higher desired level' : money(current)}`,
    '',
    '**Characters added:**',
    ...(lines.length ? lines : ['None yet']),
    '',
    `**Total so far: ${money(subtotal)}**`
  ].join('\n');
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🌟 Lord Boost Calculator')
    .setDescription(description.slice(0, 4000))
    .setFooter({ text: 'Price estimate only · Champion = level 50 · +$60 per five levels afterward' });
  const select = (id, placeholder, opts, selected) => new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`lordcalc_${id}:${nonce}`).setPlaceholder(placeholder)
      .addOptions(opts.map(x => ({ ...x, default: x.value === String(selected) })))
  );
  const groupOptions = groupLabels.map((label, i) => ({ label, value: String(i) }));
  const heroOptions = groups[group].map((name, i) => ({ label: name, value: String(groupStart[group] + i) }));
  const levelOptions = tiers.map(([name, price], i) => ({ label: `${name} — $${price}`, value: String(i) }));
  const rows = [
    select('group','Select character group',groupOptions,group),
    select('hero','Select Marvel Rivals character',heroOptions,hero),
    select('start','Current proficiency level',levelOptions,start),
    select('end','Desired proficiency level',levelOptions,end),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`lordcalc_add:${nonce}`).setStyle(ButtonStyle.Success).setLabel('Add Character'),
      new ButtonBuilder().setCustomId(`lordcalc_total:${nonce}`).setStyle(ButtonStyle.Primary).setLabel('Calculate Total'),
      new ButtonBuilder().setCustomId(`lordcalc_reset:${nonce}`).setStyle(ButtonStyle.Secondary).setLabel('Reset')
    )
  ];
  return { embeds: [embed], components: rows, allowedMentions: { parse: [] } };
}

export default {
  name: 'lordcalc',
  async execute(interaction) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'Test server only.', flags: MessageFlags.Ephemeral });
    if (interaction.customId !== 'lordcalc:open')
      return interaction.reply({ content: 'Please use the calculator button again.', flags: MessageFlags.Ephemeral });
    const nonce = interaction.id;
    const state = { group: 0, hero: null, start: 0, end: 4, items: [] };
    await interaction.reply({ ...view(state, nonce), flags: MessageFlags.Ephemeral });
    const reply = await interaction.fetchReply();
    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && i.customId.endsWith(`:${nonce}`),
      time: 14 * 60 * 1000,
      idle: 5 * 60 * 1000
    });
    collector.on('collect', async i => {
      try {
        const action = i.customId.split(':')[0];
        if (action === 'lordcalc_group') {
          state.group = Number(i.values[0]);
          state.hero = null;
        } else if (action === 'lordcalc_hero') {
          state.hero = Number(i.values[0]);
        } else if (action === 'lordcalc_start') {
          state.start = Number(i.values[0]);
        } else if (action === 'lordcalc_end') {
          state.end = Number(i.values[0]);
        } else if (action === 'lordcalc_reset') {
          state.items = []; state.hero = null; state.start = 0; state.end = 4; state.group = 0;
        } else if (action === 'lordcalc_add') {
          if (state.hero === null || state.end <= state.start)
            return i.reply({ content: 'Choose a character and a desired level above its current level.', flags: MessageFlags.Ephemeral });
          if (state.items.length >= 15)
            return i.reply({ content: 'Maximum 15 characters per estimate. Calculate your total or reset.', flags: MessageFlags.Ephemeral });
          state.items.push({ hero: heroes[state.hero], start: state.start, end: state.end, cost: tiers[state.end][1] - tiers[state.start][1] });
          state.hero = null;
        } else if (action === 'lordcalc_request') {
          if (!state.finalItems?.length) return i.reply({ content: 'Calculate your total first.', flags: MessageFlags.Ephemeral });
          await i.deferUpdate();
          const items = state.finalItems.map(x=>({hero:x.hero,start:tiers[x.start][0],end:tiers[x.end][0],cost:x.cost}));
          const total = items.reduce((sum,x)=>sum+x.cost,0);
          const summary = items.map(x=>`${x.hero}: ${x.start} → ${x.end} (${x.cost})`).join('; ');
          try {
            const response = await submitBoostRequest(i, i.client, {type:'Lord Boost',summary,total,details:{items}});
            if (response.error) return i.editReply({content:response.error,embeds:[],components:[]});
            collector.stop('finished');
            return i.editReply({content:`✅ Request \`${response.request.request_id}\` submitted for manager review. Estimate: ${total.toFixed(2)}. ${response.warning||''}`,embeds:[],components:[]});
          } catch { return i.editReply({content:'Could not submit the request. Please try again.',embeds:[],components:[]}); }
        } else if (action === 'lordcalc_total') {
          const pending = state.hero !== null && state.end > state.start
            ? [{ hero: heroes[state.hero], start: state.start, end: state.end, cost: tiers[state.end][1] - tiers[state.start][1] }] : [];
          const all = [...state.items, ...pending];
          if (!all.length) return i.reply({ content: 'Add or select at least one character with a higher desired level first.', flags: MessageFlags.Ephemeral });
          const total = all.reduce((sum, x) => sum + x.cost, 0);
          const summary = all.map((x, j) => `**${j+1}. ${x.hero}** · ${tiers[x.start][0]} → ${tiers[x.end][0]} · **${money(x.cost)}**`).join('\n');
          const embed = new EmbedBuilder().setColor(0x2ECC71).setTitle('🌟 Lord Boost Price Estimate')
            .setDescription(`${summary}\n\n**TOTAL: ${money(total)}**\n\n*Estimate only; no payment or order has been created.*`.slice(0, 4096));
          state.finalItems = all;
          await i.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`lordcalc_request:${nonce}`).setStyle(ButtonStyle.Success).setLabel('Request This Boost')
          )], allowedMentions: { parse: [] } });
          return;
          return;
        }
        await i.update(view(state, nonce));
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
