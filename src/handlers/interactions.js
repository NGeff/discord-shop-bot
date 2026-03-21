import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { logger, formatCurrency } from '../utils/logger.js';
import { errorEmbed, successEmbed, cartEmbed, productEmbed } from '../utils/embeds.js';
import { getPaymentStatus, refundPayment } from '../utils/mercadopago.js';
import { deliverOrder, handleAffiliateCommission } from '../utils/delivery.js';
import { processCheckout } from '../commands/shop.js';
import { createCart, recalcCart, addToCart, removeFromCart } from '../utils/cart.js';
import { brDate, discordTs } from '../utils/time.js';

export async function handleButton(client, interaction) {
  const db = client.db;
  const cfg = db.getConfig();
  const [action, ...params] = interaction.customId.split(':');

  try {
    if (action === 'check_payment') {
      const orderId = params[0];
      const order = db.getOrder(orderId);
      if (!order) return interaction.reply({ embeds: [errorEmbed('Pedido não encontrado.')], ephemeral: true });
      if (order.userId !== interaction.user.id) return interaction.reply({ embeds: [errorEmbed('Este não é o seu pedido.')], ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      const result = await getPaymentStatus(order.paymentId);
      if (!result.success) return interaction.editReply({ embeds: [errorEmbed(`Erro ao consultar: ${result.error}`)] });

      if (result.status === 'approved') {
        if (order.status === 'pending') {
          order.status = 'paid';
          order.paidAt = new Date().toISOString();
          db.saveOrder(order);
          db.addHistory(order.userId, {
            orderId: order.id, total: order.total,
            date: new Date().toISOString(),
            items: order.items.map(i => ({ productId: i.productId, name: i.name, qty: i.qty })),
          });
          await handleAffiliateCommission(order, db);
          await deliverOrder(client, order, db);
        }
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0x2ECC71)
            .setTitle('✅ Pagamento Confirmado!')
            .setDescription(`Pedido **${orderId}** pago com sucesso!\n📦 Verifique sua DM para receber os itens entregues.`)
            .setTimestamp()]
        });
      }

      if (['pending', 'in_process', 'authorized'].includes(result.status)) {
        const expireTs = Math.floor(new Date(order.expiresAt).getTime() / 1000);
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0xF1C40F)
            .setTitle('⏳ Aguardando Confirmação do Pagamento')
            .setDescription(`O pagamento ainda não foi confirmado pelo Mercado Pago.\n⏰ Este pedido expira <t:${expireTs}:R>.\n\n💡 Após realizar o PIX, aguarde alguns segundos e verifique novamente.`)
            .setTimestamp()]
        });
      }

      return interaction.editReply({ embeds: [errorEmbed(`Status: \`${result.status}\`. Se o valor foi debitado da sua conta, entre em contato com o suporte.`)] });
    }

    if (action === 'refund_approve' || action === 'refund_reject') {
      const isAdmin = cfg.adminRoles.some(r => interaction.member?.roles?.cache?.has(r))
        || interaction.member?.permissions?.has(8n)
        || interaction.user.id === process.env.OWNER_ID;
      if (!isAdmin) return interaction.reply({ embeds: [errorEmbed('Apenas administradores podem aprovar ou rejeitar reembolsos.')], ephemeral: true });

      const refundId = params[0];
      const request = db.getRefundRequest(refundId);
      if (!request) return interaction.reply({ embeds: [errorEmbed('Solicitação de reembolso não encontrada.')], ephemeral: true });
      if (request.status !== 'pending') return interaction.reply({ embeds: [errorEmbed(`Esta solicitação já foi **${request.status === 'approved' ? 'aprovada' : 'rejeitada'}**.`)], ephemeral: true });

      const order = db.getOrder(request.orderId);
      if (!order) return interaction.reply({ embeds: [errorEmbed('Pedido relacionado não encontrado.')], ephemeral: true });

      await interaction.deferReply({ ephemeral: true });

      if (action === 'refund_approve') {
        const result = await refundPayment(order.paymentId);
        if (!result.success) return interaction.editReply({ embeds: [errorEmbed(`Falha ao processar reembolso no Mercado Pago: ${result.error}`)] });

        order.status = 'refunded';
        order.refundedAt = new Date().toISOString();
        order.refundedBy = interaction.user.id;
        db.saveOrder(order);

        request.status = 'approved';
        request.resolvedAt = new Date().toISOString();
        request.resolvedBy = interaction.user.id;
        db.saveRefundRequest(request);

        await interaction.message.edit({
          embeds: [interaction.message.embeds[0].toJSON()
            ? EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(0x2ECC71)
                .setFooter({ text: `✅ Aprovado por ${interaction.user.tag} em ${brDate()}` })
            : interaction.message.embeds[0]],
          components: [],
        }).catch(() => {});

        try {
          const buyer = await client.users.fetch(request.userId).catch(() => null);
          if (buyer) {
            await buyer.send({
              embeds: [new EmbedBuilder()
                .setColor(0x2ECC71)
                .setTitle('✅ Reembolso Aprovado!')
                .setDescription(
                  `Sua solicitação de reembolso para o pedido **${order.id}** foi **aprovada**!\n\n` +
                  `💰 **${formatCurrency(order.total, cfg.currencySymbol)}** serão devolvidos em até 10 dias úteis pelo Mercado Pago.`
                )
                .addFields(
                  { name: '🆔 Pedido', value: `\`${order.id}\``, inline: true },
                  { name: '🆔 Reembolso', value: `\`${refundId}\``, inline: true },
                  { name: '🕐 Aprovado em', value: discordTs(new Date(), 'f'), inline: true },
                )
                .setTimestamp()]
            }).catch(() => {});
          }
        } catch {}

        logger.info('REFUND', `${refundId} aprovado por ${interaction.user.id}`);
        return interaction.editReply({ embeds: [successEmbed(`Reembolso **${refundId}** aprovado!\n💰 **${formatCurrency(order.total, cfg.currencySymbol)}** serão devolvidos ao comprador.`)] });
      }

      if (action === 'refund_reject') {
        request.status = 'rejected';
        request.resolvedAt = new Date().toISOString();
        request.resolvedBy = interaction.user.id;
        db.saveRefundRequest(request);

        await interaction.message.edit({
          embeds: [EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(0xE74C3C)
            .setFooter({ text: `❌ Rejeitado por ${interaction.user.tag} em ${brDate()}` })],
          components: [],
        }).catch(() => {});

        try {
          const buyer = await client.users.fetch(request.userId).catch(() => null);
          if (buyer) {
            await buyer.send({
              embeds: [new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('❌ Reembolso Rejeitado')
                .setDescription(
                  `Sua solicitação de reembolso para o pedido **${order.id}** foi **rejeitada** por um administrador.\n\n` +
                  `Se tiver dúvidas, entre em contato com o suporte do servidor.`
                )
                .addFields(
                  { name: '🆔 Pedido', value: `\`${order.id}\``, inline: true },
                  { name: '🆔 Solicitação', value: `\`${refundId}\``, inline: true },
                )
                .setTimestamp()]
            }).catch(() => {});
          }
        } catch {}

        logger.info('REFUND', `${refundId} rejeitado por ${interaction.user.id}`);
        return interaction.editReply({ embeds: [successEmbed(`Solicitação **${refundId}** rejeitada. O usuário foi notificado por DM.`)] });
      }
    }

    if (action === 'cancel_order') {
      const orderId = params[0];
      const order = db.getOrder(orderId);
      if (!order) return interaction.reply({ embeds: [errorEmbed('Pedido não encontrado.')], ephemeral: true });
      if (order.userId !== interaction.user.id) return interaction.reply({ embeds: [errorEmbed('Este não é o seu pedido.')], ephemeral: true });
      if (order.status !== 'pending') return interaction.reply({ embeds: [errorEmbed('Apenas pedidos com pagamento pendente podem ser cancelados.')], ephemeral: true });
      order.status = 'cancelled';
      order.cancelledAt = new Date().toISOString();
      db.saveOrder(order);
      return interaction.reply({ embeds: [successEmbed(`Pedido **${orderId}** cancelado com sucesso.`)], ephemeral: true });
    }

    if (action === 'buy_now') {
      const productId = params[0];
      if (cfg.blacklistEnabled && db.isBlacklisted(interaction.user.id)) {
        return interaction.reply({ embeds: [errorEmbed('Você está impedido de comprar nesta loja.')], ephemeral: true });
      }
      const product = db.getProduct(productId);
      if (!product || product.active === false) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });
      const stock = db.stockCount(productId);
      if (['key', 'download'].includes(product.deliveryType) && stock < 1) {
        return interaction.reply({ embeds: [errorEmbed(`**${product.name}** está sem estoque no momento.`)], ephemeral: true });
      }
      const cart = createCart(interaction.user.id);
      cart.items = [{ productId: product.id, qty: 1 }];
      recalcCart(cart, db.getAllProducts());
      db.saveCart(interaction.user.id, cart);
      await interaction.deferReply({ ephemeral: true });
      await processCheckout(interaction, client, interaction.user.id, null, false);
    }

    if (action === 'add_cart') {
      const productId = params[0];
      if (cfg.blacklistEnabled && db.isBlacklisted(interaction.user.id)) {
        return interaction.reply({ embeds: [errorEmbed('Você está impedido de comprar nesta loja.')], ephemeral: true });
      }
      const product = db.getProduct(productId);
      if (!product || product.active === false) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });
      let cart = db.getCart(interaction.user.id) || createCart(interaction.user.id);
      const result = addToCart(cart, product, 1, cfg);
      if (!result.success) return interaction.reply({ embeds: [errorEmbed(result.reason)], ephemeral: true });
      recalcCart(cart, db.getAllProducts());
      db.saveCart(interaction.user.id, cart);
      const total = cart.items.reduce((s, i) => s + i.qty, 0);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cart_checkout').setLabel('Finalizar Compra').setStyle(ButtonStyle.Success).setEmoji('💳'),
        new ButtonBuilder().setCustomId('open_cart').setLabel('Ver Carrinho').setStyle(ButtonStyle.Primary).setEmoji('🛒'),
      );
      return interaction.reply({ embeds: [successEmbed(`**${product.name}** adicionado! 🛒 ${total} item(s) no carrinho — Total: **${formatCurrency(cart.total, cfg.currencySymbol)}**`)], components: [row], ephemeral: true });
    }

    if (action === 'wishlist_add') {
      const productId = params[0];
      const product = db.getProduct(productId);
      if (!product) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });
      db.addToWishlist(interaction.user.id, productId);
      return interaction.reply({ embeds: [successEmbed(`**${product.name}** salvo na sua lista de desejos! ❤️`)], ephemeral: true });
    }

    if (action === 'cart_checkout') {
      if (cfg.blacklistEnabled && db.isBlacklisted(interaction.user.id)) {
        return interaction.reply({ embeds: [errorEmbed('Você está impedido de comprar nesta loja.')], ephemeral: true });
      }
      const cart = db.getCart(interaction.user.id);
      if (!cart || !cart.items.length) return interaction.reply({ embeds: [errorEmbed('Seu carrinho está vazio.')], ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      await processCheckout(interaction, client, interaction.user.id, null, false);
    }

    if (action === 'cart_clear') {
      db.deleteCart(interaction.user.id);
      return interaction.update({ embeds: [successEmbed('Carrinho esvaziado com sucesso! 🗑️')], components: [] });
    }

    if (action === 'open_shop') {
      const products = db.getAllProducts().filter(p => p.active !== false);
      if (!products.length) return interaction.reply({ embeds: [errorEmbed('Nenhum produto disponível no momento.')], ephemeral: true });

      const embed = new EmbedBuilder().setColor(cfg.shopColor)
        .setTitle(`${cfg.shopEmoji} ${cfg.shopName}`)
        .setDescription(cfg.shopDescription || '')
        .setFooter({ text: `${products.length} produto(s) • Selecione no menu abaixo` });

      if (cfg.shopBanner) embed.setImage(cfg.shopBanner);
      if (cfg.shopThumbnail) embed.setThumbnail(cfg.shopThumbnail);

      const categories = [...new Set(products.map(p => p.category || 'Geral'))];
      for (const cat of categories) {
        const cp = products.filter(p => (p.category || 'Geral') === cat);
        embed.addFields({ name: `📁 ${cat}`, value: cp.map(p => {
          const s = db.stockCount(p.id);
          const avail = ['manual', 'role'].includes(p.deliveryType) ? '∞' : String(s);
          const stockIcon = ['manual', 'role'].includes(p.deliveryType) ? '🟢' : s > 0 ? '🟢' : '🔴';
          return `${stockIcon} ${p.emoji || '📦'} **${p.name}** — ${formatCurrency(p.price, cfg.currencySymbol)} | ${avail} un`;
        }).join('\n') });
      }

      const rows = [];
      for (const cat of categories.slice(0, 4)) {
        const cp = products.filter(p => (p.category || 'Geral') === cat).slice(0, 25);
        if (!cp.length) continue;
        const options = cp.map(p => ({
          label: p.name.substring(0, 100),
          description: `${formatCurrency(p.price, cfg.currencySymbol)} • ${['manual','role'].includes(p.deliveryType) ? 'Disponível' : db.stockCount(p.id) + ' un'}`.substring(0, 100),
          value: p.id,
          emoji: p.emoji || '📦',
        }));
        rows.push(new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`catalog_select:${cat}`)
            .setPlaceholder(`📁 ${cat} — Selecione um produto`)
            .addOptions(options)
        ));
      }

      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }

    if (action === 'open_cart') {
      const cart = db.getCart(interaction.user.id);
      const products = db.getAllProducts();
      const embed = cartEmbed(cfg, cart, products);

      if (!cart || !cart.items.length) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('open_shop').setLabel('Ver Catálogo').setStyle(ButtonStyle.Primary).setEmoji('🛒'),
        );
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

      const removeOptions = cart.items.map(item => {
        const p = products.find(x => x.id === item.productId);
        return {
          label: `${p?.name || item.productId} ×${item.qty}`.substring(0, 100),
          description: p ? `Remover — ${formatCurrency(p.price * item.qty, cfg.currencySymbol)}` : 'Remover produto',
          value: item.productId,
          emoji: p?.emoji || '📦',
        };
      });

      const rows = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('cart_checkout').setLabel('Finalizar Compra').setStyle(ButtonStyle.Success).setEmoji('💳'),
          new ButtonBuilder().setCustomId('cart_clear').setLabel('Limpar Carrinho').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('cart_remove_select')
            .setPlaceholder('➖ Selecione um item para remover')
            .addOptions(removeOptions)
        ),
      ];

      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }

    if (action === 'confirm_delete_product') {
      const id = params[0];
      const p = db.getProduct(id);
      if (!p) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });
      db.deleteProduct(id);
      return interaction.update({ embeds: [successEmbed(`Produto **${p.name}** e todo o seu estoque foram deletados permanentemente.`)], components: [] });
    }

    if (action === 'cancel_action') {
      return interaction.update({ embeds: [successEmbed('Ação cancelada.')], components: [] });
    }

    if (action === 'admin_product_manage') {
      const productId = params[0];
      const product = db.getProduct(productId);
      if (!product) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });
      const stock = db.stockCount(productId);
      const rating = db.getProductRating(productId);
      const embed = productEmbed(cfg, product, stock, rating);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin_edit:${productId}`).setLabel('Editar').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId(`admin_toggle:${productId}`).setLabel(product.active === false ? 'Ativar' : 'Desativar').setStyle(product.active === false ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji(product.active === false ? '✅' : '❌'),
        new ButtonBuilder().setCustomId(`admin_stock:${productId}`).setLabel('Estoque').setStyle(ButtonStyle.Primary).setEmoji('📦'),
        new ButtonBuilder().setCustomId(`confirm_delete_product:${productId}`).setLabel('Deletar').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (action === 'admin_toggle') {
      const productId = params[0];
      const product = db.getProduct(productId);
      if (!product) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });
      product.active = product.active === false ? true : false;
      db.saveProduct(product);
      return interaction.reply({ embeds: [successEmbed(`Produto **${product.name}** foi ${product.active ? '✅ ativado' : '❌ desativado'}.`)], ephemeral: true });
    }

    if (action === 'admin_stock') {
      const productId = params[0];
      const product = db.getProduct(productId);
      if (!product) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });
      const items = db.getStockItems(productId);
      const embed = new EmbedBuilder().setColor(cfg.shopColor)
        .setTitle(`📦 Estoque — ${product.name}`)
        .addFields(
          { name: '🔢 Total', value: String(items.length), inline: true },
          { name: '🚚 Entrega', value: product.deliveryType || 'N/A', inline: true },
        );
      if (items.length) {
        embed.addFields({ name: '🔍 Primeiros 5 itens', value: items.slice(0, 5).map((it, i) => `\`${i + 1}.\` ${it.substring(0, 70)}`).join('\n') });
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

  } catch (error) {
    logger.error('BUTTON', `Erro no botão ${interaction.customId}`, { error: error.message, stack: error.stack });
    const reply = { embeds: [errorEmbed(`Erro inesperado: ${error.message}`)], ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
}

export async function handleSelectMenu(client, interaction) {
  const db = client.db;
  const cfg = db.getConfig();
  const customId = interaction.customId;
  const uid = interaction.user.id;

  try {
    if (customId.startsWith('catalog_select:')) {
      const productId = interaction.values[0];
      const product = db.getProduct(productId);
      if (!product || product.active === false) {
        return interaction.reply({ embeds: [errorEmbed('Produto não encontrado ou fora de estoque.')], ephemeral: true });
      }
      const stock = db.stockCount(product.id);
      const rating = db.getProductRating(productId);
      const embed = productEmbed(cfg, product, stock, rating);

      const reviews = db.getProductReviews(productId).slice(0, 3);
      if (reviews.length) {
        const stars = n => '⭐'.repeat(n) + '☆'.repeat(5 - n);
        embed.addFields({
          name: '💬 Avaliações Recentes',
          value: reviews.map(r => `${stars(r.rating)} <@${r.userId}>${r.comment ? `\n> ${r.comment}` : ''}`).join('\n\n')
        });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`buy_now:${product.id}`).setLabel('Comprar Agora').setStyle(ButtonStyle.Success).setEmoji('🛒'),
        new ButtonBuilder().setCustomId(`add_cart:${product.id}`).setLabel('Adicionar ao Carrinho').setStyle(ButtonStyle.Primary).setEmoji('➕'),
        new ButtonBuilder().setCustomId(`wishlist_add:${product.id}`).setLabel('Favoritar').setStyle(ButtonStyle.Secondary).setEmoji('❤️'),
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (customId === 'cart_remove_select') {
      const productId = interaction.values[0];
      const cart = db.getCart(uid);
      if (!cart || !cart.items.length) {
        return interaction.reply({ embeds: [errorEmbed('Seu carrinho está vazio.')], ephemeral: true });
      }
      const p = db.getProduct(productId);
      if (!removeFromCart(cart, productId)) {
        return interaction.reply({ embeds: [errorEmbed('Produto não encontrado no carrinho.')], ephemeral: true });
      }
      recalcCart(cart, db.getAllProducts());
      db.saveCart(uid, cart);

      const products = db.getAllProducts();
      const embed = cartEmbed(cfg, cart, products);

      if (!cart.items.length) {
        return interaction.update({
          embeds: [successEmbed(`**${p?.name || productId}** removido. Carrinho vazio.`)],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('open_shop').setLabel('Ver Catálogo').setStyle(ButtonStyle.Primary).setEmoji('🛒'),
          )]
        });
      }

      const removeOptions = cart.items.map(item => {
        const prod = products.find(x => x.id === item.productId);
        return {
          label: `${prod?.name || item.productId} ×${item.qty}`.substring(0, 100),
          description: prod ? `Remover — ${formatCurrency(prod.price * item.qty, cfg.currencySymbol)}` : 'Remover produto',
          value: item.productId,
          emoji: prod?.emoji || '📦',
        };
      });

      const rows = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('cart_checkout').setLabel('Finalizar Compra').setStyle(ButtonStyle.Success).setEmoji('💳'),
          new ButtonBuilder().setCustomId('cart_clear').setLabel('Limpar Carrinho').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('cart_remove_select')
            .setPlaceholder('➖ Selecione um item para remover')
            .addOptions(removeOptions)
        ),
      ];

      return interaction.update({ embeds: [embed], components: rows });
    }

    if (customId === 'admin_product_select') {
      const productId = interaction.values[0];
      const product = db.getProduct(productId);
      if (!product) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });
      const stock = db.stockCount(productId);
      const rating = db.getProductRating(productId);
      const embed = productEmbed(cfg, product, stock, rating);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin_toggle:${productId}`).setLabel(product.active === false ? 'Ativar' : 'Desativar').setStyle(product.active === false ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji(product.active === false ? '✅' : '❌'),
        new ButtonBuilder().setCustomId(`admin_stock:${productId}`).setLabel('Ver Estoque').setStyle(ButtonStyle.Primary).setEmoji('📦'),
        new ButtonBuilder().setCustomId(`confirm_delete_product:${productId}`).setLabel('Deletar').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

  } catch (error) {
    logger.error('SELECT', `Erro no select menu ${customId}`, { error: error.message, stack: error.stack });
    const reply = { embeds: [errorEmbed(`Erro inesperado: ${error.message}`)], ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
}

export async function handleModal(client, interaction) {
  const db = client.db;
  const cfg = db.getConfig();
  const id = interaction.customId;

  try {
    if (id === 'checkout_email') {
      const email = interaction.fields.getTextInputValue('email').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return interaction.reply({ embeds: [errorEmbed('E-mail inválido. Insira um endereço válido (ex: email@dominio.com).')], ephemeral: true });
      }
      await processCheckout(interaction, client, interaction.user.id, email, true);
      return;
    }

    if (id === 'produto_criar') {
      const name = interaction.fields.getTextInputValue('name').trim();
      const description = interaction.fields.getTextInputValue('description').trim();
      const price = parseFloat(interaction.fields.getTextInputValue('price').replace(',', '.'));
      const category = interaction.fields.getTextInputValue('category').trim() || 'Geral';
      const delivery = interaction.fields.getTextInputValue('delivery').trim().toLowerCase();

      if (isNaN(price) || price <= 0) {
        return interaction.reply({ embeds: [errorEmbed('Preço inválido. Use o formato: 29.90')], ephemeral: true });
      }
      if (!['key', 'download', 'role', 'manual'].includes(delivery)) {
        return interaction.reply({ embeds: [errorEmbed('Tipo de entrega inválido.\nUse: `key`, `download`, `role` ou `manual`')], ephemeral: true });
      }

      const productId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const product = {
        id: productId, name, description,
        price: Number(price.toFixed(2)), category,
        deliveryType: delivery, active: true,
        createdAt: new Date().toISOString(),
        emoji: '📦', imageUrl: null, thumbnailUrl: null,
      };
      db.saveProduct(product);

      const deliveryTips = {
        key: 'Use `/estoque adicionar-lote` para adicionar as chaves.',
        download: 'Use `/estoque adicionar-lote` para adicionar os links.',
        role: 'Use `/estoque cargo` para configurar o cargo a ser entregue.',
        manual: 'Entrega manual — staff será notificado a cada compra.',
      };

      return interaction.reply({
        embeds: [successEmbed(`Produto **${name}** criado com sucesso! 🎉\n\n📌 ID: \`${productId}\`\n💰 Preço: ${formatCurrency(price, cfg.currencySymbol)}\n🚚 Entrega: \`${delivery}\`\n\n💡 ${deliveryTips[delivery]}`)],
        ephemeral: true
      });
    }

    if (id.startsWith('produto_editar:')) {
      const productId = id.split(':')[1];
      const p = db.getProduct(productId);
      if (!p) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });
      p.name = interaction.fields.getTextInputValue('name').trim();
      p.description = interaction.fields.getTextInputValue('description').trim();
      const price = parseFloat(interaction.fields.getTextInputValue('price').replace(',', '.'));
      if (isNaN(price) || price <= 0) return interaction.reply({ embeds: [errorEmbed('Preço inválido.')], ephemeral: true });
      p.price = Number(price.toFixed(2));
      p.category = interaction.fields.getTextInputValue('category').trim() || 'Geral';
      const extras = interaction.fields.getTextInputValue('extras').split('|');
      if (extras[0]?.trim()) p.emoji = extras[0].trim();
      if (extras[1]?.trim()) p.imageUrl = extras[1].trim();
      if (extras[2]?.trim()) p.thumbnailUrl = extras[2].trim();
      db.saveProduct(p);
      return interaction.reply({ embeds: [successEmbed(`Produto **${p.name}** atualizado com sucesso! ✅`)], ephemeral: true });
    }

    if (id.startsWith('stock_bulk:')) {
      const productId = id.split(':')[1];
      const p = db.getProduct(productId);
      if (!p) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });
      const raw = interaction.fields.getTextInputValue('items');
      const items = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (!items.length) return interaction.reply({ embeds: [errorEmbed('Nenhum item válido foi fornecido. Insira um item por linha.')], ephemeral: true });
      db.addStockBulk(productId, items);
      return interaction.reply({
        embeds: [successEmbed(`**${items.length}** item(s) adicionados ao estoque de **${p.name}**!\n📦 Total em estoque agora: **${db.stockCount(productId)}** unidade(s).`)],
        ephemeral: true
      });
    }

    if (id === 'cupom_criar') {
      const code = interaction.fields.getTextInputValue('code').trim().toUpperCase().replace(/\s/g, '');
      const type = interaction.fields.getTextInputValue('type').trim().toLowerCase();
      const value = parseFloat(interaction.fields.getTextInputValue('value').replace(',', '.'));
      const maxUsesRaw = interaction.fields.getTextInputValue('maxUses').trim();
      const maxUses = parseInt(maxUsesRaw) || 0;
      const expiresRaw = interaction.fields.getTextInputValue('expires').trim();

      if (!['percent', 'fixed'].includes(type)) {
        return interaction.reply({ embeds: [errorEmbed('Tipo inválido. Use `percent` para percentual ou `fixed` para valor fixo.')], ephemeral: true });
      }
      if (isNaN(value) || value <= 0) return interaction.reply({ embeds: [errorEmbed('Valor inválido. Insira um número positivo.')], ephemeral: true });
      if (type === 'percent' && value > 100) return interaction.reply({ embeds: [errorEmbed('O percentual máximo é 100%.')], ephemeral: true });

      let expiresAt = null;
      if (expiresRaw) {
        const parts = expiresRaw.split('/');
        if (parts.length === 3) {
          expiresAt = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T23:59:59`).toISOString();
          if (isNaN(new Date(expiresAt).getTime())) {
            return interaction.reply({ embeds: [errorEmbed('Data de expiração inválida. Use o formato DD/MM/AAAA.')], ephemeral: true });
          }
        }
      }

      if (db.getCoupon(code)) {
        return interaction.reply({ embeds: [errorEmbed(`Já existe um cupom com o código \`${code}\`. Escolha outro código.`)], ephemeral: true });
      }

      const coupon = { code, type, value, maxUses: maxUses || null, uses: 0, expiresAt, createdAt: new Date().toISOString() };
      db.saveCoupon(coupon);
      return interaction.reply({
        embeds: [successEmbed(`Cupom \`${code}\` criado! 🏷️\n**Desconto:** ${type === 'percent' ? `${value}%` : formatCurrency(value, cfg.currencySymbol)}\n**Usos máximos:** ${maxUses || 'Ilimitado'}\n**Expiração:** ${expiresAt ? new Date(expiresAt).toLocaleDateString('pt-BR') : 'Sem expiração'}`)],
        ephemeral: true
      });
    }

    if (id === 'config_editar') {
      cfg.shopName = interaction.fields.getTextInputValue('shopName').trim() || cfg.shopName;
      cfg.shopDescription = interaction.fields.getTextInputValue('shopDescription').trim() || cfg.shopDescription;
      cfg.shopEmoji = interaction.fields.getTextInputValue('shopEmoji').trim() || '🛒';
      const banner = interaction.fields.getTextInputValue('shopBanner').trim();
      if (banner) cfg.shopBanner = banner;
      const colorRaw = interaction.fields.getTextInputValue('shopColor').trim().replace('#', '');
      if (/^[0-9a-fA-F]{6}$/.test(colorRaw)) cfg.shopColor = parseInt(colorRaw, 16);
      db.setConfig(cfg);
      return interaction.reply({ embeds: [successEmbed('Configurações da loja atualizadas! ✅\nUse `/config painel` para republicar o painel com as novas configurações.')], ephemeral: true });
    }

  } catch (error) {
    logger.error('MODAL', `Erro no modal ${id}`, { error: error.message, stack: error.stack });
    const reply = { embeds: [errorEmbed(`Erro inesperado: ${error.message}`)], ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
}
