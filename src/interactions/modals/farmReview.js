import { MessageFlags } from 'discord.js';
import { submitReview } from '../../services/farm/reviews.js';
export default [1,2,3,4,5].map(rating=>({name:'farm_reviewmodal_'+rating,async execute(interaction,client){
 if(!interaction.inGuild())return interaction.reply({content:'Server only.',flags:MessageFlags.Ephemeral});
 const id=interaction.message?.embeds[0]?.footer?.text?.match(/^Farm (\d+)$/)?.[1];
 if(!id)return interaction.reply({content:'Review session unavailable.',flags:MessageFlags.Ephemeral});
 const comment=interaction.fields.getTextInputValue('review').trim();
 if(!comment)return interaction.reply({content:'Please write a review.',flags:MessageFlags.Ephemeral});
 await interaction.deferReply({flags:MessageFlags.Ephemeral});
 const error=await submitReview(client,interaction.guildId,id,interaction.user.id,rating,comment,interaction.id);
 return interaction.editReply(error||'Your host review has been recorded.');
}}));
