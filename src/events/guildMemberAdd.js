import { Events, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getColor, botConfig } from '../config/bot.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getWelcomeConfig } from '../utils/database.js';
import { formatWelcomeMessage } from '../utils/welcome.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { getServerCounters, updateCounter } from '../services/serverstatsService.js';
import { setBirthday as dbSetBirthday } from '../utils/database.js';
import { appendRecord } from '../services/farm/records.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberAdd,
  once: false,
  
  async execute(member) {
    try {
        const { guild, user } = member;
        void sendJoinPings(member);
        void screenJoin(member).catch(error=>logger.warn('Join screening failed:',error));
        
        const config = await getGuildConfig(member.client, guild.id);
        
        const welcomeConfig = await getWelcomeConfig(member.client, guild.id);
        
        const welcomeChannelId = welcomeConfig?.channelId;

        if (welcomeConfig?.enabled && welcomeChannelId) {
            const channel = guild.channels.cache.get(welcomeChannelId);
            const me = guild.members.me;
            const permissions = channel?.isTextBased?.() && me ? channel.permissionsFor(me) : null;
            // Skip only the welcome message if permissions are missing; the rest of the
            // join pipeline (auto-role, verification, logging, counters) must still run.
            if (permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
                const formatData = { user, guild, member };
                const welcomeMessage = formatWelcomeMessage(
                    welcomeConfig.welcomeMessage || welcomeConfig.welcomeEmbed?.description || botConfig.welcome?.defaultWelcomeMessage || 'Welcome {user} to {server}!',
                    formatData
                );

                const messageContent = welcomeConfig.welcomePing ? user.toString() : null;

                const embedTitle = formatWelcomeMessage(
                    welcomeConfig.welcomeEmbed?.title || '🎉 Welcome!',
                    formatData
                );
                const embedFooter = welcomeConfig.welcomeEmbed?.footer
                    ? formatWelcomeMessage(welcomeConfig.welcomeEmbed.footer, formatData)
                    : `Welcome to ${guild.name}!`;

                const canEmbed = permissions.has(PermissionFlagsBits.EmbedLinks);

                if (!canEmbed) {
                    await channel.send({
                        content: messageContent || welcomeMessage
                    });
                } else {
                    const embed = new EmbedBuilder()
                        .setColor(welcomeConfig.welcomeEmbed?.color || getColor('success'))
                        .setTitle(embedTitle)
                        .setDescription(welcomeMessage)
                        .setThumbnail(user.displayAvatarURL())
                        .addFields(
                            { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                            { name: 'Member Count', value: guild.memberCount.toString(), inline: true }
                        )
                        .setTimestamp()
                        .setFooter({ text: embedFooter });
                    
                    if (welcomeConfig.welcomeImage) {
                        embed.setImage(welcomeConfig.welcomeImage);
                    } else if (welcomeConfig.welcomeEmbed?.image?.url) {
                        embed.setImage(welcomeConfig.welcomeEmbed.image.url);
                    }
                    
                    await channel.send({ 
                        content: messageContent,
                        embeds: [embed] 
                    });
                }
            }
        }
        
        if (welcomeConfig?.roleIds && welcomeConfig.roleIds.length > 0) {
            const delay = welcomeConfig.autoRoleDelay || 0;
            const singleRoleId = welcomeConfig.roleIds[0];
            
            if (delay > 0) {
                const timeout = setTimeout(async () => {
                    const role = guild.roles.cache.get(singleRoleId);
                    if (role) {
                        await assignRoleSafely(member, role);
                    }
                }, delay * 1000);
                if (typeof timeout.unref === 'function') {
                    timeout.unref();
                }
            } else {
                const role = guild.roles.cache.get(singleRoleId);
                if (role) {
                    await assignRoleSafely(member, role);
                }
            }
        }
        
        if (config?.verification?.enabled || config?.verification?.autoVerify?.enabled) {
            await handleVerification(member, guild, config.verification, member.client);
        }

        try {
            await logEvent({
                client: member.client,
                guildId: guild.id,
                eventType: EVENT_TYPES.MEMBER_JOIN,
                data: {
                    title: 'User joined',
                    lines: [
                        `**User:** ${user.toString()} (${user.displayName !== user.username ? `@${user.displayName}` : user.tag})`,
                        `**ID:** \`${user.id}\``,
                        `**Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
                        `**Members:** ${guild.memberCount}`,
                    ],
                    quoted: false,
                    thumbnail: user.displayAvatarURL({ dynamic: true }),
                    userId: user.id,
                }
            });
        } catch (error) {
            logger.debug('Error logging member join:', error);
        }

        try {
            const counters = await getServerCounters(member.client, guild.id);
            for (const counter of counters) {
                if (counter && counter.type && counter.channelId && counter.enabled !== false) {
                    await updateCounter(member.client, guild, counter);
                }
            }
        } catch (error) {
            logger.debug('Error updating counters on member join:', error);
        }

        try {
            const backupKey = `guild:${guild.id}:birthdays:left`;
            const backup = (await member.client.db.get(backupKey)) || {};
            if (backup[user.id]) {
                const { month, day } = backup[user.id];
                await dbSetBirthday(member.client, guild.id, user.id, month, day);
                delete backup[user.id];
                await member.client.db.set(backupKey, backup);
                logger.debug(`Birthday restored for user ${user.id} in guild ${guild.id}`);
            }
        } catch (error) {
            logger.debug('Error restoring birthday on member join:', error);
        }
        
    } catch (error) {
        logger.error('Error in guildMemberAdd event:', error);
    }
  }
};

async function handleVerification(member, guild, verificationConfig, client) {
    const { autoVerifyOnJoin } = await import('../services/verificationService.js');
    
    try {
        const result = await autoVerifyOnJoin(client, guild, member, verificationConfig);
        
        if (result.autoVerified) {
            logger.info('User auto-verified on join', {
                guildId: guild.id,
                userId: member.id,
                userTag: member.user.tag,
                roleName: result.roleName,
                criteria: result.criteria
            });
        } else {
            logger.debug('User not auto-verified on join', {
                guildId: guild.id,
                userId: member.id,
                reason: result.reason
            });
        }

    } catch (error) {
        logger.error('Error in auto-verification for member', {
            guildId: guild.id,
            userId: member.id,
            userTag: member.user.tag,
            error: error.message
        });
    }
}

async function assignRoleSafely(member, role) {
    try {
        await member.roles.add(role);
    } catch (error) {
        logger.warn(`Failed to assign role ${role.id} to member ${member.id}:`, error);
    }
}

async function sendJoinPings(member) {
    if (member.user.bot || member.guild.id !== (process.env.TEST_GUILD_ID || process.env.GUILD_ID)) return;
    const channels = ['1571956074008027144', '1571956074008027145', '1573658700957093898'];
    await Promise.allSettled(channels.map(async id => {
        try {
            const channel = await member.guild.channels.fetch(id);
            if (!channel?.isSendable() || !channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)) return;
            const ping = await channel.send({ content: '<@' + member.id + '>', allowedMentions: { parse: [], users: [member.id] } });
            setTimeout(() => {
                ping.delete().catch(error => logger.warn('Could not delete join ping in ' + id, error));
            }, 30000);
        } catch (error) {
            logger.warn('Could not send join ping in ' + id, error);
        }
    }));
}

const recentJoins = new Map();
async function screenJoin(member) {
    if (member.user.bot || member.guild.id !== (process.env.TEST_GUILD_ID || process.env.GUILD_ID)) return;
    const now=Date.now(), age=(now-member.user.createdTimestamp)/86400000;
    const joins=(recentJoins.get(member.guild.id)||[]).filter(t=>now-t<60000);
    joins.push(now);
    recentJoins.set(member.guild.id,joins.slice(-100));
    let score=0;
    const reasons=[];
    if(age<1){score+=50;reasons.push('Account created less than 24 hours ago');}
    else if(age<7){score+=30;reasons.push('Account younger than 7 days');}
    else if(age<30){score+=15;reasons.push('Account younger than 30 days');}
    if(!member.user.avatar){score+=10;reasons.push('Default profile picture');}
    if(joins.length>=5){score+=25;reasons.push('At least 5 joins within 60 seconds');}
    if(score<30)return;
    const level=score>=60?'High':'Moderate';
    const arrow='<:x_whitearrow:1575129831988002968>', sparkle='<a:001_sparkles:1575070315724279918>', cat='<:qw_pwhitekat:1575470985405010022>';
    const channel=await member.guild.channels.fetch('1571956074008027137').catch(()=>null);
    if(!channel?.isSendable())throw new Error('Screening alert channel unavailable');
    const embed=new EmbedBuilder().setColor(0xFFFFFF).setThumbnail(member.user.displayAvatarURL()).setDescription('## '+sparkle+' Account Screening Alert').addFields(
      {name:arrow+' Member',value:'<@'+member.id+'> (`'+member.id+'`)'},
      {name:arrow+' Account Created',value:'<t:'+Math.floor(member.user.createdTimestamp/1000)+':R>',inline:true},
      {name:arrow+' Screening Score',value:level+' — '+score+' points',inline:true},
      {name:cat+' Indicators',value:reasons.map(r=>arrow+' '+r).join('\n')}
    ).setFooter({text:'Indicators only • Not proof of alternate account ownership'}).setTimestamp(now);
    const message=await channel.send({embeds:[embed],allowedMentions:{parse:[]}});
    await appendRecord(member.client,member.guild.id,'altScreeningLogs',{memberId:member.id,timestamp:now,score,level,reasons,messageId:message.id});
}
