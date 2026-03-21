import { MercadoPagoConfig, Payment, PaymentRefund } from 'mercadopago';
import { logger } from './logger.js';
import { randomUUID } from 'crypto';

let mpClient = null;
let paymentAPI = null;

export function initMercadoPago(accessToken) {
  mpClient = new MercadoPagoConfig({ accessToken, options: { timeout: 10000 } });
  paymentAPI = new Payment(mpClient);
  logger.info('MP', 'Mercado Pago inicializado');
}

export async function createPixPayment({ orderId, amount, description, email, externalRef, expireMinutes = 30 }) {
  try {
    const expireDate = new Date(Date.now() + expireMinutes * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const isoExpire =
      `${expireDate.getUTCFullYear()}-${pad(expireDate.getUTCMonth() + 1)}-${pad(expireDate.getUTCDate())}` +
      `T${pad(expireDate.getUTCHours())}:${pad(expireDate.getUTCMinutes())}:${pad(expireDate.getUTCSeconds())}.000-03:00`;

    const safeEmail = (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      ? email
      : `comprador_${orderId.toLowerCase()}@loja.bot`;

    const body = {
      transaction_amount: Number(Number(amount).toFixed(2)),
      description: String(description || orderId).substring(0, 255),
      payment_method_id: 'pix',
      payer: { email: safeEmail },
      external_reference: String(externalRef || orderId),
      date_of_expiration: isoExpire,
    };

    const result = await paymentAPI.create({
      body,
      requestOptions: { idempotencyKey: randomUUID() },
    });

    if (!result || !result.id) {
      return { success: false, error: 'Resposta inválida do Mercado Pago.' };
    }

    const txData = result.point_of_interaction?.transaction_data;
    return {
      success: true,
      paymentId: String(result.id),
      status: result.status,
      qrCode: txData?.qr_code || null,
      qrCodeBase64: txData?.qr_code_base64 || null,
      ticketUrl: txData?.ticket_url || null,
      expiresAt: isoExpire,
    };
  } catch (error) {
    const msg = error?.cause?.[0]?.description || error?.message || 'Erro desconhecido';
    logger.error('MP', 'Erro ao criar pagamento PIX', { error: msg, cause: error?.cause });
    return { success: false, error: msg };
  }
}

export async function getPaymentStatus(paymentId) {
  if (!paymentId) return { success: false, error: 'ID de pagamento ausente' };
  try {
    const result = await paymentAPI.get({ id: paymentId });
    return {
      success: true,
      status: result.status,
      statusDetail: result.status_detail,
      amount: result.transaction_amount,
      paidAt: result.date_approved,
      externalRef: result.external_reference,
    };
  } catch (error) {
    const msg = error?.cause?.[0]?.description || error?.message || 'Erro desconhecido';
    logger.error('MP', `Erro ao consultar pagamento ${paymentId}`, { error: msg });
    return { success: false, error: msg };
  }
}

export async function cancelPayment(paymentId) {
  if (!paymentId) return { success: false, error: 'ID de pagamento ausente' };
  try {
    await paymentAPI.cancel({ id: paymentId });
    return { success: true };
  } catch (error) {
    const msg = error?.cause?.[0]?.description || error?.message || 'Erro desconhecido';
    logger.error('MP', `Erro ao cancelar pagamento ${paymentId}`, { error: msg });
    return { success: false, error: msg };
  }
}

export async function refundPayment(paymentId, amount = null) {
  if (!paymentId) return { success: false, error: 'ID de pagamento ausente' };
  try {
    const refundAPI = new PaymentRefund(mpClient);
    const body = amount ? { amount: Number(Number(amount).toFixed(2)) } : {};
    const result = await refundAPI.create({ payment_id: paymentId, body });
    return { success: true, refundId: result.id, status: result.status };
  } catch (error) {
    const msg = error?.cause?.[0]?.description || error?.message || 'Erro desconhecido';
    logger.error('MP', `Erro ao estornar pagamento ${paymentId}`, { error: msg });
    return { success: false, error: msg };
  }
}
