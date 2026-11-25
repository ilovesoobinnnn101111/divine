import {heroes,tiers,boostPrice} from '../../services/farm/lordPricing.js';
import {earningsText,money} from '../../services/farm/boosterEarnings.js';
import {isEligibleBooster,eligibleBooster} from '../../services/farm/boosterSecurity.js';
import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { workloadSnapshot } from '../../services/farm/boosterWorkload.js';
import { availabilityRows, availabilityOf, availabilityIcon } from '../../services/farm/boosterAvailability.js';
import { notifyBooster, notificationText } from '../../services/farm/boosterNotifications.js';
import { appendRecord } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const managerRoles = () => (process.env.BOOSTER_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);

export default {
  data: new SlashCommandBuilder().setName('orderassignment').setDescription('Assign an order to a booster (Booster Manager only)')
    .addUserOption(o => o.setName('booster').setDescription('Booster to assign').setRequired(true))
    .addStringOption(o => o.setName('hero').setDescription('Hero').setAutocomplete(true).setRequired(true).setMaxLength(100))
    .addStringOption(o => o.setName('level').setDescription('Target level (hero boost) or rank range').setAutocomplete(true).setRequired(true).setMaxLength(50))
    .addStringOption(o => o.setName('category').setDescription('Order category').setRequired(false).addChoices(
      {name:'Rank Boost',value:'Rank Boost'}, {name:'Hero Boost',value:'Hero Boost'},
      {name:'Duo Queue',value:'Duo Queue'}, {name:'Coaching',value:'Coaching'}))
    .addIntegerOption(o=>o.setName('current_level').setDescription('Current hero level (default 0)').setMinValue(0).setMaxValue(65))
    .addNumberOption(o=>o.setName('quoted_price').setDescription('Agreed USD estimate for rank/coaching or custom order').setMinValue(0).setMaxValue(1000000))
    .addStringOption(o => o.setName('customer').setDescription('Customer').setRequired(false).setMaxLength(100))
    .addStringOption(o => o.setName('notes').setDescription('Additional instructions').setRequired(false).setMaxLength(500)),
  async autocomplete(interaction){
    if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID)||!memberHasFarmRole(interaction.member,managerRoles()))return interaction.respond([]);
    const f=interaction.options.getFocused(true),q=f.value.toLowerCase();
    if(f.name==='hero')return interaction.respond(heroes.filter(h=>h.toLowerCase().includes(q)).slice(0,25).map(h=>({name:h,value:h})));
    const hero=interaction.options.getString('hero'),start=interaction.options.getInteger('current_level')??0;
    if(start%5||start<0||start>65)return interaction.respond([]);
    if(!heroes.includes(hero))return interaction.respond([]);
    return interaction.respond(tiers.map(([name],i)=>({name:'L'+i*5+' '+name+' — '+money(Math.round(boostPrice(hero,start/5,i)*100)),value:String(i*5),i})).filter(x=>x.i*5>start&&x.name.toLowerCase().includes(q)).map(({name,value})=>({name,value})));
  },
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Booster Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL is unavailable. No order was assigned.', flags: MessageFlags.Ephemeral });
    const booster = interaction.options.getUser('booster', true);
    const hero = interaction.options.getString('hero', true);
    let level = interaction.options.getString('level', true);
    const category = interaction.options.getString('category') || 'Rank Boost';
    let estimated_price=interaction.options.getNumber('quoted_price');
    if(category==='Hero Boost'){
      const start=interaction.options.getInteger('current_level')??0,end=Number(level);
      if(!heroes.includes(hero)||!/^\d+$/.test(level)||start%5||end%5||end<=start||end>70)return interaction.reply({content:'Choose a valid hero and target level (5–70), above current level in increments of 5.',flags:MessageFlags.Ephemeral});
      estimated_price=boostPrice(hero,start/5,end/5);level='L'+start+' → L'+end;
    }
    const customer = interaction.options.getString('customer') || null;
    const notes = interaction.options.getString('notes') || '';
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    if(!await eligibleBooster(interaction.guild,booster.id,category))return interaction.editReply('Select a booster with the role required for this category.');
    const availability=availabilityOf(await availabilityRows(client,interaction.guildId),booster.id);
    const workload=await workloadSnapshot(client,interaction.guildId,null,interaction.guild,category);
    const selected=workload.people.find(x=>x.id===booster.id);
    const now = Date.now();
    const orderId = `ORD-${interaction.id}`;
    const record = {
      order_id: orderId, booster_id: booster.id, booster_tag: booster.tag,
      assigned_by: interaction.user.id, assigned_by_tag: interaction.user.tag,
      hero, level, category, customer, notes, estimated_price, status: 'Pending', assignment_response:'Awaiting Confirmation', assignment_response_history:[],
      status_history: [{ status: 'Pending', timestamp: now, by: interaction.user.id }],
      created_at: now, updated_at: now
    };
    await appendRecord(client, interaction.guildId, 'boosterOrders', record);
    const embed = new EmbedBuilder().setColor(0x3498DB).setTitle('📋 Order Assigned')
      .setDescription(`Order **${orderId}** → <@${booster.id}>`)
      .addFields(
        { name: '🆔 Order ID', value: `\`${orderId}\``, inline: true },
        { name: '👤 Booster', value: `<@${booster.id}>`, inline: true },
        { name: '📁 Type', value: category, inline: true },
        { name: '🦸 Hero', value: hero, inline: true },
        { name: '📊 Level', value: level, inline: true },
        { name: '📌 Status', value: '🟡 Pending', inline: true }
      ).setFooter({ text: `Assigned by ${interaction.user.username}` }).setTimestamp();
    embed.addFields({name:'Booster earnings',value:earningsText(record)});
    if(estimated_price!==null)embed.addFields({name:'Estimated customer price',value:money(Math.round(estimated_price*100))});
    if (customer) embed.addFields({ name: '👥 Customer', value: customer, inline: false });
    if (notes) embed.addFields({ name: '📝 Notes', value: notes, inline: false });
    if(selected?.limit!==null&&selected?.limit!==undefined&&selected.count>=selected.limit)embed.addFields({name:'⚠️ Workload Limit',value:`Booster already has ${selected.count}/${selected.limit} active orders. Manager override applied.`});
    if(workload.recommended&&workload.recommended.id!==booster.id)embed.addFields({name:'💡 Recommended Booster',value:`<@${workload.recommended.id}> · ${workload.recommended.count} active orders`});
    if(availability==='Busy'||availability==='Offline')embed.addFields({name:'⚠️ Availability Warning',value:`${availabilityIcon(availability)} Booster is ${availability}. Assignment was still saved.`});
    await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    await notifyBooster(client,interaction.guildId,{orderId,recipientId:booster.id,type:'assignment',message:notificationText('📋 New Divine order assigned',record,`Category: ${category}. Respond in the server using /boosterrespond with order ID ${orderId}.`)});
  }
};
