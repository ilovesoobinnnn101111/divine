import { SlashCommandBuilder } from 'discord.js';
import rank from './rankboostcalculator.js';
import lord from './lordboostcalculator.js';
const assets=s=>s.addAttachmentOption(o=>o.setName('header').setDescription('Shop header image').setRequired(true)).addAttachmentOption(o=>o.setName('logo').setDescription('Shop logo').setRequired(true)).addAttachmentOption(o=>o.setName('banner').setDescription('Animated footer banner').setRequired(true));
export default {
 registrationScope:'guild',
 data:new SlashCommandBuilder().setName('boostcalculator').setDescription('Post a Divine boosting shop').addSubcommand(s=>assets(s.setName('rank').setDescription('Post Rank Boost shop'))).addSubcommand(s=>assets(s.setName('lord').setDescription('Post Lord Boost shop'))),
 async execute(i,g,c){return (i.options.getSubcommand()==='rank'?rank:lord).execute(i,g,c);}
};
