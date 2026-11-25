import {memberHasFarmRole} from './config.js';
const hero=()=>process.env.HERO_BOOSTER_ROLE_ID||'1571956072892342287';
const rank=()=>process.env.RANK_BOOSTER_ROLE_ID||'1571956072892342288';
export const boosterRoleIds=category=>['Hero Boost','Lord Boost'].includes(category)?[hero()]:['Rank Boost','Duo Queue'].includes(category)?[rank()]:[hero(),rank()];
export function isEligibleBooster(member,category){return Boolean(member&&!member.user?.bot&&memberHasFarmRole(member,boosterRoleIds(category)));}
export async function eligibleBooster(guild,id,category){const member=await guild.members.fetch({user:id,force:true}).catch(()=>null);return isEligibleBooster(member,category);}
