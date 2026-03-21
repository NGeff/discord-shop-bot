import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { logger, formatCurrency } from '../utils/logger.js';
import { productEmbed, orderEmbed, pixEmbed, cartEmbed, errorEmbed, successEmbed, shopEmbed } from '../utils/embeds.js';
import { createCart, recalcCart, addToCart, removeFromCart, applyCoupon, cartToOrderItems } from '../utils/cart.js';
import { createPixPayment } from '../utils/mercadopago.js';
import { brDate, discordTs } from '../utils/time.js';

function isStaff(interaction, cfg) {
  return cfg.adminRoles.some(r => interaction.member?.roles?.cache?.has(r))
    || cfg.staffRoles.some(r => interaction.member?.roles?.cache?.has(r))
    || interaction.user.id === process.env.OWNER_ID;
}

function buildCatalogSelectMenus(products, db, cfg) {
  const categories = [...new Set(products.map(p => p.category || 'Geral'))];
  const rows = [];
  for (const cat of categories) {
    const catProducts = products.filter(p => (p.category || 'Geral') === cat);
    if (!catProducts.length) continue;
    const options = catProducts.slice(0, 25).map(p => {
      const stock = db.stockCount(p.id);
      const stockStr = ['manual', 'role'].includes(p.deliveryType)
        ? 'Disponível'
        : stock > 0 ? `${stock} em estoque` : 'Sem estoque';
      const rating = db.getProductRating(p.id);
      const ratingStr = rating ? ` • ⭐${rating.avg}` : '';
      return {
        label: p.name.substring(0, 100),
        description: `${formatCurrency(p.price, cfg.currencySymbol)} • ${stockStr}${ratingStr}`.substring(0, 100),
        value: p.id,
        emoji: p.emoji || '📦',
      };
    });
    if (options.length > 0) {
      rows.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`catalog_select:${cat}`)
          .setPlaceholder(`📁 ${cat} — Selecione um produto para ver detalhes`)
          .addOptions(options)
      ));
    }
    if (rows.length >= 4) break;
  }
  return rows;
}

export const loja = {
  data: new SlashCommandBuilder()
    .setName('loja')
    .setDescription('🛒 Acessar a loja')
    .addSubcommand(s => s
      .setName('catalogo')
      .setDescription('📦 Ver todos os produtos disponíveis com menus interativos')
    )
    .addSubcommand(s => s
      .setName('produto')
      .setDescription('🔍 Ver detalhes completos de um produto específico')
      .addStringOption(o => o
        .setName('produto')
        .setDescription('Digite o nome ou ID do produto')
        .setRequired(true)
        .setAutocomplete(true)
      )
    )
    .addSubcommand(s => s
      .setName('buscar')
      .setDescription('🔎 Buscar produtos por nome, categoria ou descrição')
      .addStringOption(o => o
        .setName('termo')
        .setDescription('O que você quer encontrar? Ex: "jogo", "premium", "assinatura"')
        .setRequired(true)
      )
    )
    .addSubcommand(s => s
      .setName('comprar')
      .setDescription('🛍️ Adicionar um produto ao seu carrinho')
      .addStringOption(o => o
        .setName('produto')
        .setDescription('Digite o nome ou ID do produto')
        .setRequired(true)
        .setAutocomplete(true)
      )
      .addIntegerOption(o => o
        .setName('quantidade')
        .setDescription('Quantas unidades deseja adicionar? (padrão: 1)')
        .setMinValue(1)
        .setMaxValue(20)
      )
    )
    .addSubcommand(s => s
      .setName('carrinho')
      .setDescription('🛒 Ver itens no seu carrinho e finalizar a compra')
    )
    .addSubcommand(s => s
      .setName('remover')
      .setDescription('➖ Remover um produto do seu carrinho')
      .addStringOption(o => o
        .setName('produto')
        .setDescription('Qual produto deseja remover?')
        .setRequired(true)
        .setAutocomplete(true)
      )
    )
    .addSubcommand(s => s
      .setName('limpar')
      .setDescription('🗑️ Esvaziar todo o seu carrinho de uma vez')
    )
    .addSubcommand(s => s
      .setName('cupom')
      .setDescription('🏷️ Aplicar um código de desconto ao seu carrinho')
      .addStringOption(o => o
        .setName('codigo')
        .setDescription('Código do cupom (ex: DESCONTO20)')
        .setRequired(true)
      )
    )
    .addSubcommand(s => s
      .setName('checkout')
      .setDescription('💳 Finalizar pedido e gerar o PIX para pagamento')
    )
    .addSubcommand(s => s
      .setName('historico')
      .setDescription('📋 Ver todas as suas compras anteriores')
    )
    .addSubcommand(s => s
      .setName('pedido')
      .setDescription('🔎 Consultar detalhes e status de um pedido')
      .addStringOption(o => o
        .setName('id')
        .setDescription('ID do pedido (ex: PED-000001)')
        .setRequired(true)
      )
    )
    .addSubcommand(s => s
      .setName('avaliar')
      .setDescription('⭐ Deixar uma avaliação para um produto comprado')
      .addStringOption(o => o
        .setName('produto')
        .setDescription('Qual produto deseja avaliar?')
        .setRequired(true)
        .setAutocomplete(true)
      )
      .addIntegerOption(o => o
        .setName('nota')
        .setDescription('Sua nota para o produto')
        .setMinValue(1)
        .setMaxValue(5)
        .setRequired(true)
        .addChoices(
          { name: '⭐ 1 — Muito ruim', value: 1 },
          { name: '⭐⭐ 2 — Ruim', value: 2 },
          { name: '⭐⭐⭐ 3 — Regular', value: 3 },
          { name: '⭐⭐⭐⭐ 4 — Bom', value: 4 },
          { name: '⭐⭐⭐⭐⭐ 5 — Excelente', value: 5 },
        )
      )
      .addStringOption(o => o
        .setName('comentario')
        .setDescription('Adicione um comentário opcional à sua avaliação')
        .setMaxLength(300)
      )
    )
    .addSubcommand(s => s
      .setName('favoritos')
      .setDescription('❤️ Ver sua lista de desejos com produtos salvos')
    )
    .addSubcommand(s => s
      .setName('favoritar')
      .setDescription('❤️ Salvar um produto na lista de desejos')
      .addStringOption(o => o
        .setName('produto')
        .setDescription('Qual produto deseja favoritar?')
        .setRequired(true)
        .setAutocomplete(true)
      )
    )
    .addSubcommand(s => s
      .setName('desfavoritar')
      .setDescription('💔 Remover um produto da lista de desejos')
      .addStringOption(o => o
        .setName('produto')
        .setDescription('Qual produto deseja remover dos favoritos?')
        .setRequired(true)
        .setAutocomplete(true)
      )
    )
    .addSubcommand(s => s
      .setName('reembolso')
      .setDescription('↩️ Solicitar reembolso de um pedido pago')
      .addStringOption(o => o
        .setName('pedido')
        .setDescription('Selecione o pedido que deseja reembolsar')
        .setRequired(true)
        .setAutocomplete(true)
      )
      .addStringOption(o => o
        .setName('motivo')
        .setDescription('Descreva o motivo do reembolso')
        .setRequired(false)
        .setMaxLength(300)
      )
    ),

  async autocomplete(interaction, client) {
    const db = client.db;
    const sub = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused().toLowerCase();
    const uid = interaction.user.id;

    if (sub === 'remover') {
      const cart = db.getCart(uid);
      if (!cart || !cart.items.length) {
        return interaction.respond([{ name: '🛒 Seu carrinho está vazio', value: 'empty' }]);
      }
      const cfg = db.getConfig();
      const choices = cart.items
        .map(item => {
          const p = db.getProduct(item.productId);
          return {
            name: `${p?.name || item.productId} ×${item.qty} — ${formatCurrency((p?.price || 0) * item.qty, cfg.currencySymbol)}`.substring(0, 100),
            value: item.productId
          };
        })
        .filter(c => c.name.toLowerCase().includes(focused));
      return interaction.respond(choices.slice(0, 25));
    }

    if (sub === 'desfavoritar') {
      const wishlist = db.getWishlist(uid);
      const choices = wishlist
        .map(pid => db.getProduct(pid))
        .filter(Boolean)
        .filter(p => p.name.toLowerCase().includes(focused))
        .map(p => ({ name: p.name, value: p.id }));
      return interaction.respond(choices.slice(0, 25));
    }

    if (sub === 'reembolso') {
      const cfg = db.getConfig();
      const orders = db.getOrdersByUser(uid)
        .filter(o => ['paid', 'delivered'].includes(o.status))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (!orders.length) {
        return interaction.respond([{ name: '📭 Nenhum pedido elegível para reembolso', value: 'none' }]);
      }
      const choices = orders
        .filter(o => o.id.toLowerCase().includes(focused) || o.items.some(i => i.name.toLowerCase().includes(focused)))
        .slice(0, 25)
        .map(o => ({
          name: `${o.id} — ${formatCurrency(o.total, cfg.currencySymbol)} — ${o.items.map(i => i.name).join(', ')}`.substring(0, 100),
          value: o.id,
        }));
      return interaction.respond(choices.length ? choices : [{ name: '📭 Nenhum pedido encontrado', value: 'none' }]);
    }

    if (sub === 'avaliar') {
      const cfg = db.getConfig();
      const history = db.getUserHistory(uid);
      const purchasedIds = [...new Set(
        history.flatMap(e => (e.items || []).map(i => typeof i === 'string' ? i : i.productId))
      )];
      const choices = purchasedIds
        .map(pid => db.getProduct(pid))
        .filter(Boolean)
        .filter(p => p.name.toLowerCase().includes(focused))
        .map(p => ({ name: `${p.name} — ${formatCurrency(p.price, cfg.currencySymbol)}`.substring(0, 100), value: p.id }));
      if (!choices.length) {
        return interaction.respond([{ name: '📭 Nenhuma compra encontrada', value: 'none' }]);
      }
      return interaction.respond(choices.slice(0, 25));
    }

    const cfg = db.getConfig();
    const products = db.getAllProducts().filter(p =>
      p.active !== false && (
        p.name.toLowerCase().includes(focused) ||
        (p.category || '').toLowerCase().includes(focused) ||
        p.id.toLowerCase().includes(focused)
      )
    );

    const choices = products.slice(0, 25).map(p => {
      const stock = db.stockCount(p.id);
      const avail = ['manual', 'role'].includes(p.deliveryType) ? '∞' : String(stock);
      return {
        name: `${p.name} — ${formatCurrency(p.price, cfg.currencySymbol)} (${avail} un)`.substring(0, 100),
        value: p.id,
      };
    });

    return interaction.respond(choices);
  },

  async execute(interaction, client) {
    const db = client.db;
    const cfg = db.getConfig();
    const sub = interaction.options.getSubcommand();
    const uid = interaction.user.id;

    if (cfg.maintenanceMode && !isStaff(interaction, cfg)) {
      return interaction.reply({ embeds: [errorEmbed('🔧 **Loja em Manutenção**\nEstamos realizando melhorias. Volte em breve!')], ephemeral: true });
    }

    if (cfg.blacklistEnabled && db.isBlacklisted(uid)) {
      return interaction.reply({ embeds: [errorEmbed('🚫 Você está impedido de usar esta loja.')], ephemeral: true });
    }

    if (sub === 'catalogo') {
      const products = db.getAllProducts().filter(p => p.active !== false);
      if (!products.length) {
        return interaction.reply({ embeds: [errorEmbed('Nenhum produto disponível no momento. Volte mais tarde!')], ephemeral: true });
      }

      const categories = [...new Set(products.map(p => p.category || 'Geral'))];
      const embed = shopEmbed(cfg, cfg.shopName, cfg.shopDescription)
        .setFooter({ text: `${products.length} produto(s) disponíveis • Use o menu abaixo para ver detalhes` });

      if (cfg.shopBanner) embed.setImage(cfg.shopBanner);
      if (cfg.shopThumbnail) embed.setThumbnail(cfg.shopThumbnail);

      for (const cat of categories) {
        const catProducts = products.filter(p => (p.category || 'Geral') === cat);
        const lines = catProducts.map(p => {
          const stock = db.stockCount(p.id);
          const stockIcon = ['manual', 'role'].includes(p.deliveryType) ? '🟢' : stock > 0 ? '🟢' : '🔴';
          const stockStr = ['manual', 'role'].includes(p.deliveryType) ? '∞' : String(stock);
          const rating = db.getProductRating(p.id);
          const stars = rating ? ` ⭐${rating.avg}` : '';
          return `${stockIcon} ${p.emoji || '📦'} **${p.name}**${stars} — ${formatCurrency(p.price, cfg.currencySymbol)} | ${stockStr} un`;
        }).join('\n');
        embed.addFields({ name: `📁 ${cat}`, value: lines || 'Sem produtos' });
      }

      const selectRows = buildCatalogSelectMenus(products, db, cfg);
      return interaction.reply({ embeds: [embed], components: selectRows, ephemeral: true });
    }

    if (sub === 'buscar') {
      const term = interaction.options.getString('termo').toLowerCase();
      const products = db.getAllProducts().filter(p =>
        p.active !== false && (
          p.name.toLowerCase().includes(term) ||
          (p.description || '').toLowerCase().includes(term) ||
          (p.category || '').toLowerCase().includes(term)
        )
      );

      if (!products.length) {
        return interaction.reply({
          embeds: [errorEmbed(`Nenhum produto encontrado para **"${term}"**.\n\n💡 Use \`/loja catalogo\` para ver todos os produtos disponíveis.`)],
          ephemeral: true
        });
      }

      const embed = shopEmbed(cfg, `🔎 Resultados para "${term}"`)
        .setDescription(products.map(p => {
          const stock = db.stockCount(p.id);
          const stockStr = ['manual', 'role'].includes(p.deliveryType) ? '∞' : String(stock);
          const rating = db.getProductRating(p.id);
          const stars = rating ? ` ⭐${rating.avg}` : '';
          return `${p.emoji || '📦'} **${p.name}**${stars} — ${formatCurrency(p.price, cfg.currencySymbol)} | ${stockStr} un`;
        }).join('\n'))
        .setFooter({ text: `${products.length} resultado(s) • Selecione um produto abaixo` });

      const options = products.slice(0, 25).map(p => ({
        label: p.name.substring(0, 100),
        description: `${formatCurrency(p.price, cfg.currencySymbol)} • Categoria: ${p.category || 'Geral'}`.substring(0, 100),
        value: p.id,
        emoji: p.emoji || '📦',
      }));

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('catalog_select:busca')
          .setPlaceholder('👆 Selecione um produto para ver detalhes')
          .addOptions(options)
      );

      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (sub === 'produto') {
      const id = interaction.options.getString('produto');
      const product = db.getProduct(id);
      if (!product || product.active === false) {
        return interaction.reply({ embeds: [errorEmbed('Produto não encontrado. Use `/loja catalogo` para ver os disponíveis.')], ephemeral: true });
      }
      const stock = db.stockCount(product.id);
      const rating = db.getProductRating(id);
      const embed = productEmbed(cfg, product, stock, rating);

      const reviews = db.getProductReviews(id).slice(0, 3);
      if (reviews.length) {
        const stars = n => '⭐'.repeat(n) + '☆'.repeat(5 - n);
        embed.addFields({
          name: `💬 Avaliações Recentes`,
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

    if (sub === 'comprar') {
      const id = interaction.options.getString('produto');
      const qty = interaction.options.getInteger('quantidade') || 1;
      const product = db.getProduct(id);
      if (!product || product.active === false) {
        return interaction.reply({ embeds: [errorEmbed('Produto não encontrado. Use `/loja catalogo` para ver os disponíveis.')], ephemeral: true });
      }

      const stock = db.stockCount(product.id);
      if (['key', 'download'].includes(product.deliveryType) && stock < qty) {
        return interaction.reply({
          embeds: [errorEmbed(`Estoque insuficiente para **${product.name}**.\n📦 Disponível: **${stock}** unidade(s).`)],
          ephemeral: true
        });
      }

      let cart = db.getCart(uid) || createCart(uid);
      const result = addToCart(cart, product, qty, cfg);
      if (!result.success) return interaction.reply({ embeds: [errorEmbed(result.reason)], ephemeral: true });

      recalcCart(cart, db.getAllProducts());
      db.saveCart(uid, cart);

      const totalItems = cart.items.reduce((s, i) => s + i.qty, 0);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cart_checkout').setLabel('Finalizar Compra').setStyle(ButtonStyle.Success).setEmoji('💳'),
        new ButtonBuilder().setCustomId('open_cart').setLabel('Ver Carrinho').setStyle(ButtonStyle.Primary).setEmoji('🛒'),
      );
      return interaction.reply({
        embeds: [successEmbed(`**${product.name}** ×${qty} adicionado ao carrinho!\n🛒 **${totalItems} item(s)** no carrinho | Total: **${formatCurrency(cart.total, cfg.currencySymbol)}**`)],
        components: [row],
        ephemeral: true
      });
    }

    if (sub === 'carrinho') {
      const cart = db.getCart(uid);
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
            .setPlaceholder('➖ Selecione um item para remover do carrinho')
            .addOptions(removeOptions)
        ),
      ];

      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }

    if (sub === 'remover') {
      const id = interaction.options.getString('produto');
      if (id === 'empty') return interaction.reply({ embeds: [errorEmbed('Seu carrinho está vazio.')], ephemeral: true });
      const cart = db.getCart(uid);
      if (!cart || !cart.items.length) return interaction.reply({ embeds: [errorEmbed('Seu carrinho está vazio.')], ephemeral: true });
      const p = db.getProduct(id);
      if (!removeFromCart(cart, id)) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado no carrinho.')], ephemeral: true });
      recalcCart(cart, db.getAllProducts());
      db.saveCart(uid, cart);
      return interaction.reply({
        embeds: [successEmbed(`**${p?.name || id}** removido do carrinho.\n💰 Novo total: **${formatCurrency(cart.total, cfg.currencySymbol)}**`)],
        ephemeral: true
      });
    }

    if (sub === 'limpar') {
      const cart = db.getCart(uid);
      if (!cart || !cart.items.length) return interaction.reply({ embeds: [errorEmbed('Seu carrinho já está vazio.')], ephemeral: true });
      db.deleteCart(uid);
      return interaction.reply({ embeds: [successEmbed('Carrinho esvaziado com sucesso! 🗑️')], ephemeral: true });
    }

    if (sub === 'cupom') {
      const code = interaction.options.getString('codigo');
      let cart = db.getCart(uid);
      if (!cart || !cart.items.length) {
        return interaction.reply({ embeds: [errorEmbed('Seu carrinho está vazio. Adicione produtos antes de aplicar cupons.')], ephemeral: true });
      }
      const coupon = db.getCoupon(code);
      const subtotal = cart.items.reduce((s, item) => {
        const p = db.getProduct(item.productId);
        return s + (p ? p.price * item.qty : 0);
      }, 0);
      const result = applyCoupon(cart, coupon, subtotal);
      if (!result.success) return interaction.reply({ embeds: [errorEmbed(result.reason)], ephemeral: true });
      recalcCart(cart, db.getAllProducts());
      db.saveCart(uid, cart);
      return interaction.reply({
        embeds: [successEmbed(`🎉 Cupom **${code.toUpperCase()}** aplicado!\n💸 Desconto: **${formatCurrency(result.discount, cfg.currencySymbol)}**\n💰 Novo total: **${formatCurrency(cart.total, cfg.currencySymbol)}**`)],
        ephemeral: true
      });
    }

    if (sub === 'checkout') {
      const cart = db.getCart(uid);
      if (!cart || !cart.items.length) {
        return interaction.reply({ embeds: [errorEmbed('Seu carrinho está vazio. Use `/loja catalogo` para adicionar produtos.')], ephemeral: true });
      }

      for (const item of cart.items) {
        const p = db.getProduct(item.productId);
        if (!p || p.active === false) {
          return interaction.reply({ embeds: [errorEmbed(`O produto **${p?.name || item.productId}** não está mais disponível. Remova-o do carrinho.`)], ephemeral: true });
        }
        if (['key', 'download'].includes(p.deliveryType) && db.stockCount(p.id) < item.qty) {
          return interaction.reply({ embeds: [errorEmbed(`Estoque insuficiente para **${p.name}**. Disponível: ${db.stockCount(p.id)}`)], ephemeral: true });
        }
      }

      if (cfg.requireEmailOnPurchase) {
        const modal = new ModalBuilder().setCustomId('checkout_email').setTitle('📧 Informar E-mail');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('email')
            .setLabel('Seu e-mail para receber a nota fiscal')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('email@exemplo.com')
        ));
        return interaction.showModal(modal);
      }

      await interaction.deferReply({ ephemeral: true });
      await processCheckout(interaction, client, uid, null, false);
    }

    if (sub === 'historico') {
      const history = db.getUserHistory(uid);
      if (!history.length) {
        return interaction.reply({ embeds: [errorEmbed('Você ainda não realizou nenhuma compra.\n\n💡 Use `/loja catalogo` para ver os produtos disponíveis!')], ephemeral: true });
      }
      const embed = shopEmbed(cfg, '📋 Seu Histórico de Compras');
      const lines = history.slice(0, 15).map((e, i) => {
        const items = Array.isArray(e.items)
          ? e.items.map(i => typeof i === 'string' ? i : i.name || i.productId).join(', ')
          : '';
        const date = `<t:${Math.floor(new Date(e.date).getTime() / 1000)}:d>`;
        return `**${i + 1}.** \`${e.orderId}\` — ${formatCurrency(e.total, cfg.currencySymbol)} — ${date}${items ? `\n> ${items.substring(0, 80)}` : ''}`;
      }).join('\n');
      embed.setDescription(lines);
      if (history.length > 15) embed.setFooter({ text: `Mostrando 15 de ${history.length} compras` });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'pedido') {
      const id = interaction.options.getString('id').toUpperCase();
      const order = db.getOrder(id);
      if (!order) {
        return interaction.reply({ embeds: [errorEmbed(`Pedido \`${id}\` não encontrado.\n\n💡 Veja seus pedidos em \`/loja historico\`.`)], ephemeral: true });
      }
      if (order.userId !== uid && !isStaff(interaction, cfg)) {
        return interaction.reply({ embeds: [errorEmbed('Você não tem permissão para ver este pedido.')], ephemeral: true });
      }
      const embed = orderEmbed(cfg, order);
      const components = [];
      if (order.status === 'pending') {
        components.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`check_payment:${order.id}`).setLabel('Verificar Pagamento').setStyle(ButtonStyle.Primary).setEmoji('🔄'),
          new ButtonBuilder().setCustomId(`cancel_order:${order.id}`).setLabel('Cancelar Pedido').setStyle(ButtonStyle.Danger).setEmoji('❌'),
        ));
      }
      return interaction.reply({ embeds: [embed], components, ephemeral: true });
    }

    if (sub === 'avaliar') {
      const id = interaction.options.getString('produto');
      if (id === 'none') return interaction.reply({ embeds: [errorEmbed('Você precisa comprar um produto antes de avaliá-lo.')], ephemeral: true });
      const nota = interaction.options.getInteger('nota');
      const comentario = interaction.options.getString('comentario') || null;
      const product = db.getProduct(id);
      if (!product) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });

      if (cfg.requirePurchaseToReview && !db.userHasPurchased(uid, id)) {
        return interaction.reply({ embeds: [errorEmbed('Você precisa ter comprado este produto para avaliá-lo.')], ephemeral: true });
      }

      db.addReview(id, { userId: uid, rating: nota, comment: comentario, createdAt: new Date().toISOString() });
      const rating = db.getProductRating(id);
      const stars = '⭐'.repeat(nota) + '☆'.repeat(5 - nota);
      return interaction.reply({
        embeds: [successEmbed(`Obrigado pela avaliação! ${stars}\n**${product.name}** agora tem nota **${rating.avg}/5** (${rating.count} avaliações).`)],
        ephemeral: true
      });
    }

    if (sub === 'favoritos') {
      const wishlist = db.getWishlist(uid);
      if (!wishlist.length) {
        return interaction.reply({ embeds: [errorEmbed('Sua lista de desejos está vazia.\n\n💡 Use `/loja favoritar` para salvar produtos que te interessam!')], ephemeral: true });
      }
      const embed = shopEmbed(cfg, '❤️ Sua Lista de Desejos');
      const validProducts = wishlist.map(pid => db.getProduct(pid)).filter(Boolean);
      const lines = validProducts.map(p => {
        const stock = db.stockCount(p.id);
        const avail = ['manual', 'role'].includes(p.deliveryType) ? '🟢 Disponível' : stock > 0 ? `🟢 ${stock} un` : '🔴 Sem estoque';
        return `${p.emoji || '📦'} **${p.name}** — ${formatCurrency(p.price, cfg.currencySymbol)} | ${avail}`;
      }).join('\n');
      embed.setDescription(lines || 'Alguns produtos foram removidos da loja.');

      if (validProducts.length > 0) {
        const options = validProducts.slice(0, 25).map(p => ({
          label: p.name.substring(0, 100),
          description: formatCurrency(p.price, cfg.currencySymbol),
          value: p.id,
          emoji: p.emoji || '📦',
        }));
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('catalog_select:favoritos')
            .setPlaceholder('👆 Selecione um favorito para ver detalhes')
            .addOptions(options)
        );
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'favoritar') {
      const id = interaction.options.getString('produto');
      const product = db.getProduct(id);
      if (!product) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });
      db.addToWishlist(uid, id);
      return interaction.reply({ embeds: [successEmbed(`**${product.name}** salvo na sua lista de desejos! ❤️\nVeja em \`/loja favoritos\`.`)], ephemeral: true });
    }

    if (sub === 'desfavoritar') {
      const id = interaction.options.getString('produto');
      const product = db.getProduct(id);
      db.removeFromWishlist(uid, id);
      return interaction.reply({ embeds: [successEmbed(`**${product?.name || id}** removido da lista de desejos.`)], ephemeral: true });
    }

    if (sub === 'reembolso') {
      const orderId = interaction.options.getString('pedido');
      if (orderId === 'none') return interaction.reply({ embeds: [errorEmbed('Você não tem pedidos elegíveis para reembolso.')], ephemeral: true });

      const order = db.getOrder(orderId);
      if (!order) return interaction.reply({ embeds: [errorEmbed('Pedido não encontrado.')], ephemeral: true });
      if (order.userId !== uid) return interaction.reply({ embeds: [errorEmbed('Este pedido não é seu.')], ephemeral: true });
      if (!['paid', 'delivered'].includes(order.status)) {
        return interaction.reply({ embeds: [errorEmbed('Apenas pedidos com status **Pago** ou **Entregue** podem ser reembolsados.')], ephemeral: true });
      }
      if (order.status === 'refunded') {
        return interaction.reply({ embeds: [errorEmbed('Este pedido já foi reembolsado.')], ephemeral: true });
      }

      const existing = db.getPendingRefundByOrder(orderId);
      if (existing) {
        return interaction.reply({ embeds: [errorEmbed(`Já existe uma solicitação de reembolso pendente para este pedido (\`${existing.id}\`).`)], ephemeral: true });
      }

      const motivo = interaction.options.getString('motivo') || 'Não informado';
      const refundId = db.generateRefundId();
      const request = {
        id: refundId,
        orderId: order.id,
        userId: uid,
        reason: motivo,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      db.saveRefundRequest(request);

      const cfg = db.getConfig();

      if (cfg.refundChannelId) {
        try {
          const channel = await interaction.client.channels.fetch(cfg.refundChannelId).catch(() => null);
          if (channel) {
            const { refundRequestEmbed } = await import('../utils/embeds.js');
            const embed = refundRequestEmbed(cfg, request, order, interaction.user);
            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`refund_approve:${refundId}`).setLabel('Aprovar Reembolso').setStyle(ButtonStyle.Success).setEmoji('✅'),
              new ButtonBuilder().setCustomId(`refund_reject:${refundId}`).setLabel('Rejeitar').setStyle(ButtonStyle.Danger).setEmoji('❌'),
            );
            await channel.send({ embeds: [embed], components: [row] });
          }
        } catch (err) {
          logger.error('REFUND', 'Erro ao enviar solicitação ao canal', { error: err.message });
        }
      }

      logger.info('REFUND', `Solicitação ${refundId} criada por ${uid} para pedido ${orderId}`);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xF39C12)
          .setTitle('↩️ Solicitação de Reembolso Enviada')
          .setDescription(
            `Sua solicitação de reembolso para o pedido **${orderId}** foi registrada.\n\n` +
            `Um administrador irá analisar e aprovar ou rejeitar em breve.\n` +
            `Você será notificado por DM quando houver uma decisão.`
          )
          .addFields(
            { name: '🆔 ID da Solicitação', value: `\`${refundId}\``, inline: true },
            { name: '💰 Valor', value: formatCurrency(order.total, cfg.currencySymbol), inline: true },
            { name: '📝 Motivo', value: motivo },
          )
          .setFooter({ text: `Solicitado em ${brDate()}` })
          .setTimestamp()],
        ephemeral: true,
      });
    }
  }
};

export async function processCheckout(interaction, client, userId, email, isModal = false) {
  const db = client.db;
  const cfg = db.getConfig();
  const cart = db.getCart(userId);

  if (!cart || !cart.items.length) {
    const reply = { embeds: [errorEmbed('Carrinho vazio.')], ephemeral: true };
    if (isModal) return interaction.reply(reply);
    return interaction.deferred ? interaction.editReply(reply) : interaction.reply(reply);
  }

  if (!isModal && !interaction.deferred) {
    try { await interaction.deferReply({ ephemeral: true }); } catch {}
  }

  const allProducts = db.getAllProducts();
  const orderId = db.generateOrderId();
  const items = cartToOrderItems(cart, allProducts);
  const description = items.map(i => `${i.name} x${i.qty}`).join(', ').substring(0, 255);

  const payResult = await createPixPayment({
    orderId,
    amount: cart.total,
    description,
    email: email || `user_${userId}@discord.bot`,
    externalRef: orderId,
    expireMinutes: cfg.orderExpireMinutes || 30,
  });

  if (!payResult.success) {
    const reply = { embeds: [errorEmbed(`Erro ao gerar pagamento: ${payResult.error}`)], ephemeral: true };
    return isModal ? interaction.reply(reply) : interaction.editReply(reply);
  }

  const order = {
    id: orderId, userId, email: email || null, items,
    couponCode: cart.couponCode || null, discount: cart.discount || 0,
    affiliateCode: cart.affiliateCode || null, total: cart.total,
    status: 'pending', paymentId: payResult.paymentId,
    pixQrCode: payResult.qrCode,
    pixQrCodeBase64: payResult.qrCodeBase64 || null,
    pixTicketUrl: payResult.ticketUrl || null,
    createdAt: new Date().toISOString(), expiresAt: payResult.expiresAt, guildId: cfg.guildId,
  };

  db.saveOrder(order);
  db.deleteCart(userId);

  if (cart.couponCode) {
    const coupon = db.getCoupon(cart.couponCode);
    if (coupon) { coupon.uses = (coupon.uses || 0) + 1; db.saveCoupon(coupon); }
  }

  const embed = pixEmbed(cfg, order, payResult);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`check_payment:${orderId}`).setLabel('Verificar Pagamento').setStyle(ButtonStyle.Primary).setEmoji('🔄'),
    new ButtonBuilder().setCustomId(`cancel_order:${orderId}`).setLabel('Cancelar Pedido').setStyle(ButtonStyle.Danger).setEmoji('❌'),
  );

  const replyPayload = { embeds: [embed], components: [row], ephemeral: true };

  if (payResult.qrCodeBase64) {
    const qrBuffer = Buffer.from(payResult.qrCodeBase64, 'base64');
    replyPayload.files = [{ attachment: qrBuffer, name: 'qrcode.png' }];
  }

  if (isModal) await interaction.reply(replyPayload);
  else await interaction.editReply(replyPayload);

  logger.info('CHECKOUT', `Pedido ${orderId} criado`, { userId, total: cart.total });
}

export const afiliado = {
  data: new SlashCommandBuilder()
    .setName('afiliado')
    .setDescription('🤝 Sistema de afiliados — ganhe comissão por indicar amigos')
    .addSubcommand(s => s
      .setName('entrar')
      .setDescription('🎟️ Entrar no programa de afiliados e receber seu código único')
    )
    .addSubcommand(s => s
      .setName('info')
      .setDescription('📊 Ver suas estatísticas, saldo e comissões')
    )
    .addSubcommand(s => s
      .setName('usar')
      .setDescription('🔗 Registrar código de afiliado para aplicar na próxima compra')
      .addStringOption(o => o
        .setName('codigo')
        .setDescription('Código do afiliado (ex: AMIGO123)')
        .setRequired(true)
      )
    ),

  async execute(interaction, client) {
    const db = client.db;
    const cfg = db.getConfig();
    const uid = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'entrar') {
      let aff = db.getAffiliate(uid);
      if (aff) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(cfg.shopColor)
            .setTitle('🤝 Você já é Afiliado!')
            .setDescription(`Seu código único: \`${aff.code}\`\n\nCompartilhe com amigos e ganhe **${cfg.affiliateCommissionPercent}%** a cada compra confirmada!`)
            .addFields(
              { name: '🛒 Vendas Indicadas', value: String(aff.sales || 0), inline: true },
              { name: '💰 Total Ganho', value: formatCurrency(aff.totalEarned || 0, cfg.currencySymbol), inline: true },
              { name: '⏳ Saldo Pendente', value: formatCurrency(aff.pendingBalance || 0, cfg.currencySymbol), inline: true },
            )
            .setFooter({ text: 'Peça para seus amigos usarem /afiliado usar ' + aff.code })],
          ephemeral: true
        });
      }
      const base = interaction.user.username.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6);
      const code = `${base}${Math.floor(Math.random() * 900) + 100}`;
      aff = { userId: uid, code, sales: 0, totalEarned: 0, pendingBalance: 0, paidBalance: 0, joinedAt: new Date().toISOString() };
      db.saveAffiliate(aff);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x2ECC71)
          .setTitle('🎉 Bem-vindo ao Programa de Afiliados!')
          .setDescription(`Seu código único é: \`${code}\`\n\nCompartilhe com amigos! A cada compra confirmada com seu código, você ganha **${cfg.affiliateCommissionPercent}%** automaticamente.`)
          .addFields({
            name: '💡 Como funciona',
            value: `1. Compartilhe seu código \`${code}\`\n2. Amigos usam \`/afiliado usar ${code}\` antes de comprar\n3. Você recebe comissão automática em cada venda!`
          })
          .setFooter({ text: 'Veja suas estatísticas com /afiliado info' })],
        ephemeral: true
      });
    }

    if (sub === 'info') {
      const aff = db.getAffiliate(uid);
      if (!aff) {
        return interaction.reply({ embeds: [errorEmbed('Você não é afiliado ainda.\n\n💡 Use `/afiliado entrar` para participar e começar a ganhar!')], ephemeral: true });
      }
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(cfg.shopColor)
          .setTitle('📊 Suas Estatísticas de Afiliado')
          .setThumbnail(interaction.user.displayAvatarURL())
          .addFields(
            { name: '🔗 Seu Código', value: `\`${aff.code}\``, inline: true },
            { name: '💹 Comissão por Venda', value: `${cfg.affiliateCommissionPercent}%`, inline: true },
            { name: '🛒 Vendas Indicadas', value: String(aff.sales || 0), inline: true },
            { name: '💰 Total Ganho', value: formatCurrency(aff.totalEarned || 0, cfg.currencySymbol), inline: true },
            { name: '⏳ Saldo Pendente', value: formatCurrency(aff.pendingBalance || 0, cfg.currencySymbol), inline: true },
            { name: '✅ Total Pago', value: formatCurrency(aff.paidBalance || 0, cfg.currencySymbol), inline: true },
            { name: '📅 Membro desde', value: `<t:${Math.floor(new Date(aff.joinedAt).getTime() / 1000)}:D>`, inline: true },
          )
          .setFooter({ text: `Compartilhe seu código: ${aff.code}` })
          .setTimestamp()],
        ephemeral: true
      });
    }

    if (sub === 'usar') {
      const code = interaction.options.getString('codigo').toUpperCase();
      const aff = db.getAllAffiliates().find(a => a.code === code);
      if (!aff) return interaction.reply({ embeds: [errorEmbed('Código de afiliado inválido. Verifique o código e tente novamente.')], ephemeral: true });
      if (aff.userId === uid) return interaction.reply({ embeds: [errorEmbed('Você não pode usar o seu próprio código de afiliado.')], ephemeral: true });
      let cart = db.getCart(uid) || createCart(uid);
      cart.affiliateCode = code;
      db.saveCart(uid, cart);
      return interaction.reply({ embeds: [successEmbed(`Código de afiliado \`${code}\` registrado! ✅\nEle será aplicado automaticamente na sua próxima compra.`)], ephemeral: true });
    }
  }
};
