import { EmbedBuilder } from 'discord.js';
import { formatCurrency } from './logger.js';
import { brDate, discordTs } from './time.js';

export function shopEmbed(config, title, description) {
  return new EmbedBuilder()
    .setColor(config.shopColor || 0x2ECC71)
    .setTitle(`${config.shopEmoji || '🛒'} ${title}`)
    .setDescription(description || null)
    .setTimestamp();
}

export function productEmbed(config, product, stockCount, rating) {
  const embed = new EmbedBuilder()
    .setColor(config.shopColor || 0x2ECC71)
    .setTitle(`${product.emoji || '📦'} ${product.name}`)
    .setDescription(product.description || 'Sem descrição.')
    .addFields(
      { name: '💰 Preço', value: formatCurrency(product.price, config.currencySymbol), inline: true },
      {
        name: '📦 Estoque',
        value: ['manual', 'role'].includes(product.deliveryType)
          ? '✅ Disponível'
          : stockCount > 0 ? `${stockCount} disponíveis` : '❌ Sem estoque',
        inline: true,
      },
      { name: '🏷️ Categoria', value: product.category || 'Geral', inline: true },
    );

  if (rating) {
    const stars = '⭐'.repeat(Math.round(rating.avg)) + '☆'.repeat(5 - Math.round(rating.avg));
    embed.addFields({ name: '⭐ Avaliação', value: `${stars} **${rating.avg}/5** (${rating.count} avaliações)`, inline: true });
  }

  const types = {
    key:      '🔑 Chave/Código por DM',
    download: '📥 Link de Download por DM',
    role:     '🎭 Cargo no Servidor',
    manual:   '👤 Entrega Manual pelo Staff',
  };
  if (product.deliveryType) {
    embed.addFields({ name: '🚚 Tipo de Entrega', value: types[product.deliveryType] || product.deliveryType, inline: true });
  }

  if (product.imageUrl) embed.setImage(product.imageUrl);
  if (product.thumbnailUrl) embed.setThumbnail(product.thumbnailUrl);

  return embed;
}

export function orderEmbed(config, order) {
  const statusMap = {
    pending:   '⏳ Aguardando Pagamento',
    paid:      '✅ Pago',
    delivered: '📦 Entregue',
    expired:   '❌ Expirado',
    refunded:  '↩️ Reembolsado',
    cancelled: '🚫 Cancelado',
  };
  const colorMap = {
    pending: 0xF1C40F, paid: 0x2ECC71, delivered: 0x2ECC71,
    expired: 0xE74C3C, refunded: 0x95A5A6, cancelled: 0xE74C3C,
  };

  const embed = new EmbedBuilder()
    .setColor(colorMap[order.status] || 0x95A5A6)
    .setTitle(`📋 Pedido ${order.id}`)
    .addFields(
      { name: '📊 Status', value: statusMap[order.status] || order.status, inline: true },
      { name: '💰 Total', value: formatCurrency(order.total, config.currencySymbol), inline: true },
      { name: '📅 Criado', value: discordTs(order.createdAt, 'R'), inline: true },
    );

  const itemList = order.items.map(i =>
    `• **${i.name}** ×${i.qty} — ${formatCurrency(i.price * i.qty, config.currencySymbol)}`
  ).join('\n');
  embed.addFields({ name: '🛒 Itens', value: itemList });

  if (order.couponCode) embed.addFields({ name: '🏷️ Cupom', value: `\`${order.couponCode}\` — Desconto: ${formatCurrency(order.discount || 0, config.currencySymbol)}`, inline: true });
  if (order.affiliateCode) embed.addFields({ name: '🤝 Afiliado', value: `\`${order.affiliateCode}\``, inline: true });
  if (order.email) embed.addFields({ name: '📧 E-mail', value: order.email, inline: true });
  if (order.paidAt) embed.addFields({ name: '✅ Pago em', value: discordTs(order.paidAt, 'f'), inline: true });
  if (order.deliveredAt) embed.addFields({ name: '📦 Entregue em', value: discordTs(order.deliveredAt, 'f'), inline: true });

  embed.setTimestamp();
  return embed;
}

export function pixEmbed(config, order, pixData) {
  const expireTs = Math.floor(new Date(pixData.expiresAt).getTime() / 1000);

  const descLines = [
    `**Pedido:** \`${order.id}\``,
    `**Valor:** ${formatCurrency(order.total, config.currencySymbol)}`,
    `**Expira:** <t:${expireTs}:R> — <t:${expireTs}:t>`,
    '',
    '**Como pagar:**',
    '**1.** Escaneie o QR Code com o app do seu banco',
    '**2.** Copie o código PIX abaixo (Copia e Cola)',
  ];

  if (pixData.ticketUrl) {
    descLines.push(`**3.** [Abrir link de pagamento](${pixData.ticketUrl})`);
  }

  const embed = new EmbedBuilder()
    .setColor(0x00B0F0)
    .setTitle('💠 Pagamento via PIX')
    .setDescription(descLines.join('\n'));

  if (pixData.qrCodeBase64) {
    embed.setImage('attachment://qrcode.png');
  }

  if (pixData.qrCode) {
    embed.addFields({
      name: '📋 PIX Copia e Cola',
      value: `\`\`\`\n${pixData.qrCode}\n\`\`\``,
    });
  }

  embed
    .setFooter({ text: `Entrega automática após confirmação • Gerado em ${brDate()}` })
    .setTimestamp();

  return embed;
}

export function refundRequestEmbed(config, request, order, requester) {
  return new EmbedBuilder()
    .setColor(0xF39C12)
    .setTitle('↩️ Solicitação de Reembolso')
    .setDescription(`<@${requester.id}> solicitou o reembolso do pedido **${order.id}**.`)
    .addFields(
      { name: '📋 Pedido', value: `\`${order.id}\``, inline: true },
      { name: '💰 Valor', value: formatCurrency(order.total, config.currencySymbol), inline: true },
      { name: '📅 Data da compra', value: discordTs(order.createdAt, 'f'), inline: true },
      { name: '🛒 Itens', value: order.items.map(i => `• ${i.name} ×${i.qty}`).join('\n') },
      { name: '📝 Motivo', value: request.reason || 'Não informado' },
      { name: '🆔 ID da Solicitação', value: `\`${request.id}\``, inline: true },
      { name: '🕐 Solicitado em', value: discordTs(request.createdAt, 'f'), inline: true },
    )
    .setFooter({ text: 'Use os botões abaixo para aprovar ou rejeitar.' })
    .setTimestamp();
}

export function cartEmbed(config, cart, products) {
  if (!cart || !cart.items || !cart.items.length) {
    return new EmbedBuilder()
      .setColor(config.shopColor)
      .setTitle('🛒 Carrinho Vazio')
      .setDescription('Você não tem itens no carrinho.\nUse `/loja comprar <id>` para adicionar produtos.');
  }

  const lines = cart.items.map(item => {
    const p = products.find(x => x.id === item.productId);
    return p
      ? `• **${p.name}** ×${item.qty} — ${formatCurrency(p.price * item.qty, config.currencySymbol)}`
      : `• \`${item.productId}\` ×${item.qty} — produto não encontrado`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(config.shopColor)
    .setTitle('🛒 Seu Carrinho')
    .addFields({ name: `🛍️ Itens (${cart.items.reduce((s, i) => s + i.qty, 0)})`, value: lines });

  if (cart.couponCode) {
    embed.addFields({ name: '🏷️ Cupom Aplicado', value: `\`${cart.couponCode}\` — Desconto: ${formatCurrency(cart.discount || 0, config.currencySymbol)}`, inline: true });
  }
  if (cart.affiliateCode) {
    embed.addFields({ name: '🤝 Afiliado', value: `\`${cart.affiliateCode}\``, inline: true });
  }

  embed.addFields({ name: '💰 Total a Pagar', value: `**${formatCurrency(cart.total || 0, config.currencySymbol)}**` });
  embed.setTimestamp();
  return embed;
}

export function errorEmbed(message) {
  return new EmbedBuilder().setColor(0xE74C3C).setDescription(`❌ ${message}`);
}

export function successEmbed(message) {
  return new EmbedBuilder().setColor(0x2ECC71).setDescription(`✅ ${message}`);
}
