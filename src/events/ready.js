import { EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getPaymentStatus, cancelPayment } from '../utils/mercadopago.js';
import { deliverOrder, handleAffiliateCommission } from '../utils/delivery.js';
import { brDate } from '../utils/time.js';

export default {
  name: 'ready',
  once: true,
  execute(client) {
    const db = client.db;
    const cfg = db.getConfig();

    logger.info('READY', `✅ Bot online como ${client.user.tag}`);
    logger.info('READY', `📊 ${client.guilds.cache.size} servidor(es)`);

    client.user.setPresence({
      activities: [{ name: `${cfg.shopName} | /loja`, type: 3 }],
      status: 'online',
    });

    startExpiryChecker(client, db);
    startPaymentPoller(client, db);
    startLowStockChecker(client, db);
  }
};

function startExpiryChecker(client, db) {
  setInterval(async () => {
    const now = Date.now();
    for (const order of db.getAllOrders()) {
      if (order.status !== 'pending') continue;
      if (!order.expiresAt) continue;
      if (new Date(order.expiresAt).getTime() > now) continue;

      order.status = 'expired';
      order.expiredAt = new Date().toISOString();
      db.saveOrder(order);
      logger.info('EXPIRY', `Pedido ${order.id} expirado`);

      if (order.paymentId) {
        try {
          await cancelPayment(order.paymentId);
        } catch {}
      }

      try {
        const user = await client.users.fetch(order.userId).catch(() => null);
        if (user) {
          await user.send({
            embeds: [new EmbedBuilder()
              .setColor(0xE74C3C)
              .setTitle('❌ Pedido Expirado')
              .setDescription(
                `Seu pedido **${order.id}** expirou sem pagamento confirmado.\n` +
                `O pagamento PIX foi cancelado automaticamente.\n\n` +
                `Se desejar, acesse a loja novamente para refazer o pedido.`
              )
              .addFields({ name: '💰 Valor', value: `R$ ${order.total.toFixed(2)}`, inline: true })
              .setFooter({ text: `Expirado em ${brDate()}` })
              .setTimestamp()]
          }).catch(() => {});
        }
      } catch {}
    }
  }, 30000);
}

function startPaymentPoller(client, db) {
  const polling = new Map();

  setInterval(async () => {
    const pending = db.getAllOrders().filter(o => o.status === 'pending' && o.paymentId);

    for (const orderId of [...polling.keys()]) {
      if (!pending.find(o => o.id === orderId)) polling.delete(orderId);
    }

    for (const order of pending) {
      if (polling.has(order.id)) continue;

      const interval = setInterval(async () => {
        try {
          const fresh = db.getOrder(order.id);
          if (!fresh || fresh.status !== 'pending') {
            clearInterval(interval);
            polling.delete(order.id);
            return;
          }

          const result = await getPaymentStatus(fresh.paymentId);
          if (!result.success) return;

          if (result.status === 'approved') {
            clearInterval(interval);
            polling.delete(fresh.id);

            fresh.status = 'paid';
            fresh.paidAt = new Date().toISOString();
            db.saveOrder(fresh);
            db.addHistory(fresh.userId, {
              orderId: fresh.id,
              total: fresh.total,
              date: new Date().toISOString(),
              items: fresh.items.map(i => ({ productId: i.productId, name: i.name, qty: i.qty })),
            });
            await handleAffiliateCommission(fresh, db);
            await deliverOrder(client, fresh, db);

            try {
              const user = await client.users.fetch(fresh.userId).catch(() => null);
              if (user) {
                await user.send({
                  embeds: [new EmbedBuilder()
                    .setColor(0x2ECC71)
                    .setTitle('✅ Pagamento Confirmado!')
                    .setDescription(
                      `Seu pedido **${fresh.id}** foi pago com sucesso! 🎉\n` +
                      `Os itens foram enviados para o seu DM.`
                    )
                    .addFields(
                      { name: '💰 Valor', value: `R$ ${fresh.total.toFixed(2)}`, inline: true },
                      { name: '🕐 Confirmado em', value: brDate(), inline: true },
                    )
                    .setTimestamp()]
                }).catch(() => {});
              }
            } catch {}

            logger.info('POLLER', `Pagamento confirmado: ${fresh.id}`);
          }
        } catch (err) {
          logger.error('POLLER', `Erro ao verificar ${order.id}`, { error: err.message });
        }
      }, 10000);

      polling.set(order.id, interval);
    }
  }, 10000);
}

function startLowStockChecker(client, db) {
  setInterval(async () => {
    const cfg = db.getConfig();
    if (!cfg.lowStockAlerts || !cfg.logChannelId) return;

    const threshold = cfg.lowStockThreshold || 5;
    const products = db.getAllProducts().filter(p => p.active !== false && !['manual', 'role'].includes(p.deliveryType));
    const low = products.filter(p => db.stockCount(p.id) > 0 && db.stockCount(p.id) <= threshold);
    const empty = products.filter(p => db.stockCount(p.id) === 0);

    if (!low.length && !empty.length) return;

    try {
      const channel = await client.channels.fetch(cfg.logChannelId).catch(() => null);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor(0xF39C12)
        .setTitle('⚠️ Alerta de Estoque')
        .setFooter({ text: `Verificado em ${brDate()}` })
        .setTimestamp();

      if (empty.length) {
        embed.addFields({ name: '❌ Sem Estoque', value: empty.map(p => `• **${p.name}** (\`${p.id}\`)`).join('\n') });
      }
      if (low.length) {
        embed.addFields({ name: `⚠️ Estoque Baixo (≤ ${threshold} un)`, value: low.map(p => `• **${p.name}** — ${db.stockCount(p.id)} un restantes`).join('\n') });
      }

      await channel.send({ embeds: [embed] });
    } catch (err) {
      logger.error('STOCK_ALERT', 'Erro ao enviar alerta de estoque', { error: err.message });
    }
  }, 3600000);
}
