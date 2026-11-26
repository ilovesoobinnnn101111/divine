import { SlashCommandBuilder, MessageFlags, EmbedBuilder, escapeMarkdown, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { memberHasFarmRole } from '../../services/farm/config.js';

const arrow='<:UtilityArrow:1575069345321582662>', star='<:awhitestar:1573946665520337017>';
const managerRoles = () => (process.env.HOST_MANAGER_ROLE_ID || '').split(',').map(x => x.trim()).filter(Boolean);

export default {
  data: new SlashCommandBuilder().setName('trainerratings')
    .setDescription('Look up trainer reviews and their rating IDs (Host Managers only)')
    .addUserOption(o => o.setName('trainer').setDescription('Host Trainer whose reviews you want to see').setRequired(true)),
  async execute(interaction, guildConfig, client) {
    if (!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId !== process.env.TEST_GUILD_ID))
      return interaction.reply({ content: 'This command is only available in the test server.', flags: MessageFlags.Ephemeral });
    if (!memberHasFarmRole(interaction.member, managerRoles()))
      return interaction.reply({ content: 'Host Manager role required.', flags: MessageFlags.Ephemeral });
    if (!client.db?.isAvailable?.())
      return interaction.reply({ content: 'PostgreSQL is unavailable. Cannot retrieve reviews.', flags: MessageFlags.Ephemeral });
    const trainer = interaction.options.getUser('trainer', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const all = await readRecords(client, interaction.guildId, 'trainerRatings');
    const reviews = all.filter(r => r?.trainerId === trainer.id && r?.rating_id)
      .sort((a,b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
    const valid=reviews.filter(r=>Number.isInteger(Number(r.rating))&&Number(r.rating)>=1&&Number(r.rating)<=5);
    const avg=valid.length?valid.reduce((sum,r)=>sum+Number(r.rating),0)/valid.length:0;
    const size=5,pages=1+Math.max(1,Math.ceil(reviews.length/size));
    let page=1;
    const render=()=>{
      const offset=(page-2)*size;
      const lines=page===1?['**Rating Statistics**\n> **Total Ratings:** '+reviews.length+'\n> **Average Rating:** '+(valid.length?avg.toFixed(1)+'/5.0':'N/A')+'\n\n'+arrow+' **Recent Ratings**\n(Button below to check)']:reviews.slice(offset,offset+size).map((r,j)=>{
        const rating=Number(r.rating),date=Number(r.timestamp);
        return arrow+' **'+(offset+j+1)+'.** '+(r.reviewerId?'<@'+r.reviewerId+'>':'Unknown member')+'\n'+(Number.isInteger(rating)&&rating>=1&&rating<=5?star.repeat(rating)+' **'+rating+'/5**':'Invalid rating')+'\n> '+escapeMarkdown(String(r.comment||'No review text').slice(0,350)).replace(/\n/g,'\n> ')+'\n**Rating ID:** `'+String(r.rating_id).slice(0,120)+'`\n'+(date>0?'<t:'+Math.floor(date/1000)+':D>':'Unknown date');
      });
      const embed=new EmbedBuilder().setColor(0xFFFFFF).setThumbnail(trainer.displayAvatarURL()).setDescription('## Ratings for '+escapeMarkdown(trainer.globalName||trainer.username)+'\n\n'+(page>1?arrow+' **Recent Ratings**\n':'')+(lines.join('\n\n')||'No ratings yet')).setFooter({text:'Rating count: '+reviews.length+' | Average: '+(valid.length?avg.toFixed(1)+'/5.0':'N/A')+' | Page '+page+'/'+pages}).setTimestamp();
      const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('trainer_rating_prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page===1),new ButtonBuilder().setCustomId('trainer_rating_next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page===pages));
      return {embeds:[embed],components:[row],allowedMentions:{parse:[]}};
    };
    const message=await interaction.editReply(render());
    const collector=message.createMessageComponentCollector({componentType:ComponentType.Button,time:600000,filter:i=>['trainer_rating_prev','trainer_rating_next'].includes(i.customId)});
    collector.on('collect',async i=>{try{if(i.user.id!==interaction.user.id)return await i.reply({content:'Only the command requester can navigate.',flags:MessageFlags.Ephemeral});await i.deferUpdate();page=Math.max(1,Math.min(pages,page+(i.customId==='trainer_rating_next'?1:-1)));await i.editReply(render());}catch(error){console.error('Trainer rating navigation failed:',error);}});
    collector.on('end',()=>interaction.editReply({components:[]}).catch(()=>{}));
  }
};
