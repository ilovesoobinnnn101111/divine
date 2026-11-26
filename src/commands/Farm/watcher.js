import { SlashCommandBuilder } from 'discord.js';
import setup from './watcher-setup.js';
import panel from './watcher-panel.js';
import report from './watcher-report.js';
const proof=s=>s.addUserOption(o=>o.setName('trial_host').setDescription('Member being evaluated').setRequired(true)).addAttachmentOption(o=>o.setName('scoreboard').setDescription('Scoreboard screenshot').setRequired(true));
export default {
 registrationScope:'guild',
 data:new SlashCommandBuilder().setName('watcher').setDescription('Watcher trainer evaluation tools')
 .addSubcommand(s=>s.setName('setup').setDescription('Post or update trainer report panel (Manage Server)'))
 .addSubcommand(s=>proof(s.setName('panel').setDescription('Open interactive trial checklist')))
 .addSubcommand(s=>proof(s.setName('report').setDescription('Submit trial host report')).addIntegerOption(o=>o.setName('minutes').setDescription('Training duration in minutes').setRequired(true).setMinValue(1).setMaxValue(240)).addStringOption(o=>o.setName('farm_type').setDescription('Farm type').setRequired(true).addChoices({name:'Hybrid',value:'Hybrid'},{name:'222',value:'222'})).addStringOption(o=>o.setName('notes').setDescription('Evaluation notes').setRequired(true).setMinLength(10).setMaxLength(1000))),
 async execute(i,g,c){return ({setup,panel,report})[i.options.getSubcommand()].execute(i,g,c);}
};
