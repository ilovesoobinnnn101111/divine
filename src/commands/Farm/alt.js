import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import check from './altcheck.js';
import logs from './altlogs.js';
import stats from './altstats.js';
import settings from './altsettings.js';
import whitelist from './altwhitelist.js';
const data=new SlashCommandBuilder().setName('alt').setDescription('Account screening tools').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
.addSubcommand(s=>s.setName('check').setDescription('Screen a member').addUserOption(o=>o.setName('member').setDescription('Member').setRequired(true)))
.addSubcommand(s=>s.setName('logs').setDescription('View screening history').addUserOption(o=>o.setName('member').setDescription('Filter member')).addIntegerOption(o=>o.setName('page').setDescription('Page').setMinValue(1)))
.addSubcommand(s=>s.setName('stats').setDescription('View screening statistics'))
.addSubcommandGroup(g=>g.setName('settings').setDescription('Screening settings').addSubcommand(s=>s.setName('view').setDescription('View settings')).addSubcommand(s=>s.setName('reset').setDescription('Reset settings')).addSubcommand(s=>s.setName('update').setDescription('Update settings').addBooleanOption(o=>o.setName('enabled').setDescription('Enable alerts')).addIntegerOption(o=>o.setName('moderate').setDescription('Moderate threshold').setMinValue(30).setMaxValue(84)).addIntegerOption(o=>o.setName('high').setDescription('High threshold').setMinValue(31).setMaxValue(85))))
.addSubcommandGroup(g=>g.setName('whitelist').setDescription('Trusted accounts').addSubcommand(s=>s.setName('add').setDescription('Add exemption').addUserOption(o=>o.setName('member').setDescription('Member').setRequired(true))).addSubcommand(s=>s.setName('remove').setDescription('Remove exemption').addUserOption(o=>o.setName('member').setDescription('Member').setRequired(true))).addSubcommand(s=>s.setName('list').setDescription('List exemptions').addIntegerOption(o=>o.setName('page').setDescription('Page').setMinValue(1))));
export default {data,registrationScope:'guild',async execute(i,g,c){
 const group=i.options.getSubcommandGroup(false),sub=i.options.getSubcommand();
 const handler=group==='settings'?settings:group==='whitelist'?whitelist:({check,logs,stats})[sub];
 return handler.execute(i,g,c);
}};
