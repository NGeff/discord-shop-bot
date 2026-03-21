import express from 'express';
import { logger } from '../utils/logger.js';
import { getPaymentStatus, validateWebhookSignature } from '../utils/mercadopago.js';
import { deliverOrder, handleAffiliateCommission } from '../utils/delivery.js';

export function startWebhookServer(client, db) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), orders: db.getAllOrders().length });
  });

  app.post('/webhook/mp', async (req, res) => {
    if (!validateWebhookSignature(req)) {
      logger.warn('WEBHOOK', 'Assinatura inválida — requisição rejeitada');
      return res.sendStatus(401);
    }

    res.sendStatus(200);

    try {
      const { type, data, action } = req.body;
      if (type !== 'payment' && action !== 'payment.updated') return;
      const paymentId = data?.id;
      if (!paymentId) return;

      logger.info('WEBHOOK', `Notificação recebida para pagamento ${paymentId}`);

      const result = await getPaymentStatus(paymentId);
      if (!result.success || result.status !== 'approved') return;

      const orderId = result.externalRef;
      if (!orderId) return;

      const order = db.getOrder(orderId);
      if (!order) { logger.warn('WEBHOOK', `Pedido não encontrado: ${orderId}`); return; }
      if (order.status !== 'pending') return;

      order.status = 'paid';
      order.paidAt = new Date().toISOString();
      order.paymentStatus = result.status;
      db.saveOrder(order);

      db.addHistory(order.userId, {
        orderId: order.id,
        total: order.total,
        date: new Date().toISOString(),
        items: order.items.map(i => ({ productId: i.productId, name: i.name, qty: i.qty })),
      });

      await handleAffiliateCommission(order, db);
      await deliverOrder(client, order, db);

      logger.info('WEBHOOK', `Pedido ${orderId} processado via webhook`);
    } catch (error) {
      logger.error('WEBHOOK', 'Erro ao processar notificação', { error: error.message });
    }
  });

  const PORT = process.env.WEBHOOK_PORT || 3000;
  app.listen(PORT, () => {
    logger.info('WEBHOOK', `Servidor rodando na porta ${PORT}`);
  });

  return app;
}
