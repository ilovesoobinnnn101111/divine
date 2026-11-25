import { MessageFlags, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { reviewEligibility } from '../../services/farm/reviews.js';
export default [1,2,3,4,5].map(rating=>({name:'farm_review_'+rating,async execute(interaction,client){
 if(!interaction.inGuild())return interaction.reply({content:'Server only.',flags:MessageFlags.Ephemeral});
 const id=interaction.message.embeds[0]?.footer?.text?.match(/^Farm (\d+)$/)?.[1];
 const result=await reviewEligibility(client,interaction.guildId,id,interaction.user.id);
 if(typeof result==='string')return interaction.reply({content:result,flags:MessageFlags.Ephemeral});
 const modal=new ModalBuilder().setCustomId('farm_reviewmodal_'+rating).setTitle('Review your farm host');
 modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('review').setLabel('Write a short review').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)));
 return interaction.showModal(modal);
}}));
