import {memberHasFarmRole} from './config.js';
export const boosterRoleIds=()=>String(process.env.BOOSTER_ROLE_ID||'1571956072892342287').split(',').map(x=>x.trim()).filter(x=>/^\d{17,20}$/.test(x));
export function isEligibleBooster(member){return Boolean(member&&!member.user?.bot&&memberHasFarmRole(member,boosterRoleIds()));}
export async function eligibleBooster(guild,id){const member=await guild.members.fetch({user:id,force:true}).catch(()=>null);return isEligibleBooster(member);}
