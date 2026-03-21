import { EmbedBuilder } from 'discord.js';
import { logger, formatCurrency } from './logger.js';

export async function deliverOrder(client, order, db) {
  const cfg = db.getConfig();
  const delivered = [];
  const failed = [];

  for (const item of order.items) {
    const product = db.getProduct(item.productId);
    if (!product) { failed.push({ name: item.name, reason: 'Produto não encontrado' }); continue; }

    for (let i = 0; i < item.qty; i++) {
      try {
        await deliverItem(client, order, product, db, cfg);
        delivered.push(item.name);
      } catch (err) {
        logger.error('DELIVERY', `Falha na entrega de ${product.name}`, { error: err.message });
        failed.push({ name: item.name, reason: err.message });
      }
    }
  }

  order.status = failed.length === 0 ? 'delivered' : 'paid';
  order.deliveredAt = new Date().toISOString();
  order.deliveryLog = { delivered, failed };
  db.saveOrder(order);

  await notifyStaff(client, order, delivered, failed, cfg, db);

  if (failed.length > 0 && cfg.logChannelId) {
    const logCh = await client.channels.fetch(cfg.logChannelId).catch(() => null);
    if (logCh) {
      await logCh.send({
        embeds: [new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('⚠️ Falha Parcial na Entrega')
          .setDescription(`Pedido **${order.id}** — ${failed.length} item(s) não entregue(s).`)
          .addFields({ name: 'Falhas', value: failed.map(f => `• ${f.name}: ${f.reason}`).join('\n') })
          .setTimestamp()
        ]
      });
    }
  }
}

async function deliverItem(client, order, product, db, cfg) {
  const guild = await client.guilds.fetch(cfg.guildId).catch(() => null);
  const member = guild ? await guild.members.fetch(order.userId).catch(() => null) : null;
  const user = await client.users.fetch(order.userId).catch(() => null);

  switch (product.deliveryType) {
    case 'key': {
      const key = db.popStockItem(product.id);
      if (!key) throw new Error('Sem estoque disponível');
      if (user) {
        await user.send({
          embeds: [new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle(`🔑 Entrega — ${product.name}`)
            .setDescription(`Obrigado pela compra!\n\n**Pedido:** \`${order.id}\``)
            .addFields({ name: '🔑 Sua Chave/Código', value: `\`\`\`${key}\`\`\`` })
            .setTimestamp()
          ]
        }).catch(() => { throw new Error('Não foi possível enviar DM ao usuário'); });
      }
      break;
    }

    case 'download': {
      const link = db.popStockItem(product.id);
      if (!link) throw new Error('Sem links disponíveis');
      if (user) {
        await user.send({
          embeds: [new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle(`📥 Entrega — ${product.name}`)
            .setDescription(`Obrigado pela compra!\n\n**Pedido:** \`${order.id}\``)
            .addFields({ name: '🔗 Link de Download', value: link })
            .setTimestamp()
          ]
        }).catch(() => { throw new Error('Não foi possível enviar DM ao usuário'); });
      }
      break;
    }

    case 'role': {
      if (!product.deliveryRoleId) throw new Error('Cargo de entrega não configurado');
      if (!member) throw new Error('Membro não encontrado no servidor');
      await member.roles.add(product.deliveryRoleId).catch(e => { throw new Error(`Erro ao dar cargo: ${e.message}`); });
      if (user) {
        await user.send({
          embeds: [new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle(`🎭 Entrega — ${product.name}`)
            .setDescription(`Obrigado pela compra! O cargo <@&${product.deliveryRoleId}> foi adicionado à sua conta.\n\n**Pedido:** \`${order.id}\``)
            .setTimestamp()
          ]
        }).catch(() => {});
      }
      break;
    }

    case 'manual': {
      if (user) {
        await user.send({
          embeds: [new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle(`📦 Entrega — ${product.name}`)
            .setDescription(`Obrigado pela compra! Nossa equipe entrará em contato em breve para concluir sua entrega.\n\n**Pedido:** \`${order.id}\``)
            .setTimestamp()
          ]
        }).catch(() => {});
      }
      if (cfg.logChannelId) {
        const logCh = await client.channels.fetch(cfg.logChannelId).catch(() => null);
        if (logCh) {
          await logCh.send({
            content: cfg.staffRoles.map(r => `<@&${r}>`).join(' ') || '',
            embeds: [new EmbedBuilder()
              .setColor(0xF1C40F)
              .setTitle('📦 Entrega Manual Necessária')
              .addFields(
                { name: 'Produto', value: product.name, inline: true },
                { name: 'Usuário', value: `<@${order.userId}>`, inline: true },
                { name: 'Pedido', value: order.id, inline: true },
              )
              .setTimestamp()
            ]
          });
        }
      }
      break;
    }

    default:
      throw new Error(`Tipo de entrega desconhecido: ${product.deliveryType}`);
  }
}

async function notifyStaff(client, order, delivered, failed, cfg, db) {
  if (!cfg.salesChannelId && !cfg.logChannelId) return;
  const channelId = cfg.salesChannelId || cfg.logChannelId;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(failed.length === 0 ? 0x2ECC71 : 0xF1C40F)
    .setTitle(`${failed.length === 0 ? '✅' : '⚠️'} Venda Concluída`)
    .addFields(
      { name: '📋 Pedido', value: order.id, inline: true },
      { name: '👤 Comprador', value: `<@${order.userId}>`, inline: true },
      { name: '💰 Total', value: formatCurrency(order.total, cfg.currencySymbol), inline: true },
      { name: '📦 Entregues', value: delivered.length ? delivered.join(', ') : 'Nenhum', inline: true },
    );

  if (failed.length) {
    embed.addFields({ name: '❌ Falhas', value: failed.map(f => `${f.name}: ${f.reason}`).join('\n'), inline: true });
  }

  embed.setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
}

export async function handleAffiliateCommission(order, db) {
  if (!order.affiliateCode) return;
  const cfg = db.getConfig();
  const aff = db.getAllAffiliates().find(a => a.code === order.affiliateCode.toUpperCase());
  if (!aff || aff.userId === order.userId) return;

  const commission = Number((order.total * (cfg.affiliateCommissionPercent / 100)).toFixed(2));
  aff.pendingBalance = Number(((aff.pendingBalance || 0) + commission).toFixed(2));
  aff.totalEarned = Number(((aff.totalEarned || 0) + commission).toFixed(2));
  aff.sales = (aff.sales || 0) + 1;
  db.saveAffiliate(aff);

  logger.info('AFFILIATE', `Comissão de ${commission} para afiliado ${aff.userId}`, { orderId: order.id });
}
