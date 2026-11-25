import {SlashCommandBuilder,EmbedBuilder,MessageFlags} from 'discord.js';
import {requestManager} from '../../services/farm/boostRequests.js';
import {setWorkloadLimit,workloadSnapshot} from '../../services/farm/boosterWorkload.js';
export default {
 data:new SlashCommandBuilder().setName('boosterworkload').setDescription('Manage booster workload limits and recommendations')
 .addSubcommand(s=>s.setName('recommend').setDescription('Find the least-busy available booster').addStringOption(o=>o.setName('category').setDescription('Order category').addChoices({name:'Hero Boost',value:'Hero Boost'},{name:'Rank Boost',value:'Rank Boost'},{name:'Duo Queue',value:'Duo Queue'})))
 .addSubcommand(s=>s.setName('limit').setDescription('Set a booster maximum active order count')
 .addUserOption(o=>o.setName('booster').setDescription('Booster').setRequired(true))
 .addIntegerOption(o=>o.setName('maximum').setDescription('Maximum active orders (0–100)').setMinValue(0).setMaxValue(100).setRequired(true))),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  if(!requestManager(interaction.member))return interaction.reply({content:'Booster Manager role required.',flags:MessageFlags.Ephemeral});
  if(!client.db?.isAvailable?.())return interaction.reply({content:'PostgreSQL unavailable.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  try{
   const action=interaction.options.getSubcommand();
   if(action==='limit'){
    const booster=interaction.options.getUser('booster',true),limit=interaction.options.getInteger('maximum',true);
    if(booster.bot)return interaction.editReply('Select a human booster.');
    await setWorkloadLimit(client,interaction.guildId,booster.id,limit,interaction.user.id);
    return interaction.editReply({content:`Saved maximum **${limit}** active orders for <@${booster.id}>.`,allowedMentions:{parse:[]}});
   }
   const {people,recommended}=await workloadSnapshot(client,interaction.guildId,null,interaction.guild,interaction.options.getString('category'));
   const available=people.filter(x=>x.status==='Available').sort((a,b)=>a.count-b.count).slice(0,10);
   const embed=new EmbedBuilder().setColor(0x5865F2).setTitle('⚖️ Booster Workload Recommendation')
    .setDescription(`**Recommended:** ${recommended?`<@${recommended.id}> — ${recommended.count} active${recommended.limit!==null?` / ${recommended.limit} max`:''}`:'No available booster below their workload limit.'}\n\n**Available boosters:**\n${available.map(x=>`<@${x.id}> — ${x.count} active / ${x.limit??'No limit'} max${x.limit!==null&&x.count>=x.limit?' ⚠️ At limit':''}`).join('\n')||'None recorded'}`)
    .setFooter({text:'Recommendations only · Managers approve all assignments'});
   return interaction.editReply({embeds:[embed],allowedMentions:{parse:[]}});
  }catch{return interaction.editReply('Unable to update or load workload settings.');}
 }
};