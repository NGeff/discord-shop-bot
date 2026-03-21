import { ChannelType,
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder
} from 'discord.js';
import { logger, formatCurrency } from '../utils/logger.js';
import { errorEmbed, successEmbed, shopEmbed, orderEmbed } from '../utils/embeds.js';
import { refundPayment } from '../utils/mercadopago.js';
import { deliverOrder } from '../utils/delivery.js';

function isAdmin(interaction, cfg) {
  return cfg.adminRoles.some(r => interaction.member?.roles?.cache?.has(r))
    || interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)
    || interaction.user.id === process.env.OWNER_ID;
}

function adminGuard(interaction, cfg) {
  if (!isAdmin(interaction, cfg)) {
    interaction.reply({ embeds: [errorEmbed('Você não tem permissão para usar este comando.')], ephemeral: true });
    return false;
  }
  return true;
}

export const produto = {
  data: new SlashCommandBuilder()
    .setName('produto')
    .setDescription('📦 Gerenciar produtos da loja')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s
      .setName('listar')
      .setDescription('📋 Ver todos os produtos cadastrados com status e estoque')
    )
    .addSubcommand(s => s
      .setName('criar')
      .setDescription('➕ Criar um novo produto (abre formulário completo)')
    )
    .addSubcommand(s => s
      .setName('editar')
      .setDescription('✏️ Editar nome, preço, descrição ou categoria de um produto')
      .addStringOption(o => o
        .setName('produto')
        .setDescription('Qual produto deseja editar?')
        .setRequired(true)
        .setAutocomplete(true)
      )
    )
    .addSubcommand(s => s
      .setName('deletar')
      .setDescription('🗑️ Deletar produto permanentemente (irreversível)')
      .addStringOption(o => o
        .setName('produto')
        .setDescription('Qual produto deseja deletar?')
        .setRequired(true)
        .setAutocomplete(true)
      )
    )
    .addSubcommand(s => s
      .setName('ativar')
      .setDescription('✅ Ativar ou desativar a visibilidade de um produto')
      .addStringOption(o => o
        .setName('produto')
        .setDescription('Qual produto deseja ativar/desativar?')
        .setRequired(true)
        .setAutocomplete(true)
      )
      .addBooleanOption(o => o
        .setName('ativo')
        .setDescription('true = visível na loja | false = oculto')
        .setRequired(true)
      )
    )
    .addSubcommand(s => s
      .setName('avaliacoes')
      .setDescription('⭐ Ver todas as avaliações de um produto')
      .addStringOption(o => o
        .setName('produto')
        .setDescription('Qual produto deseja ver avaliações?')
        .setRequired(true)
        .setAutocomplete(true)
      )
    )
    .addSubcommand(s => s
      .setName('remover-avaliacao')
      .setDescription('🗑️ Remover a avaliação de um usuário específico')
      .addStringOption(o => o
        .setName('produto')
        .setDescription('Produto da avaliação')
        .setRequired(true)
        .setAutocomplete(true)
      )
      .addUserOption(o => o
        .setName('usuario')
        .setDescription('Usuário cuja avaliação será removida')
        .setRequired(true)
      )
    ),

  async autocomplete(interaction, client) {
    const db = client.db;
    const focused = interaction.options.getFocused().toLowerCase();
    const products = db.getAllProducts().filter(p =>
      p.name.toLowerCase().includes(focused) ||
      p.id.toLowerCase().includes(focused) ||
      (p.category || '').toLowerCase().includes(focused)
    );
    const cfg = db.getConfig();
    const choices = products.slice(0, 25).map(p => {
      const stock = db.stockCount(p.id);
      const status = p.active === false ? '❌' : '✅';
      return {
        name: `${status} ${p.name} — ${formatCurrency(p.price, cfg.currencySymbol)} | ${stock} un`.substring(0, 100),
        value: p.id,
      };
    });
    return interaction.respond(choices);
  },

  async execute(interaction, client) {
    const db = client.db;
    const cfg = db.getConfig();
    if (!adminGuard(interaction, cfg)) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'listar') {
      const products = db.getAllProducts();
      if (!products.length) return interaction.reply({ embeds: [errorEmbed('Nenhum produto cadastrado. Use `/produto criar` para adicionar.')], ephemeral: true });
      const embed = new EmbedBuilder().setColor(cfg.shopColor).setTitle('📦 Produtos Cadastrados').setTimestamp();
      const lines = products.map(p => {
        const stock = db.stockCount(p.id);
        const rating = db.getProductRating(p.id);
        const status = p.active === false ? '❌' : '✅';
        const stars = rating ? ` ⭐${rating.avg}(${rating.count})` : '';
        const infinite = ['manual', 'role'].includes(p.deliveryType);
        const stockInfo = infinite ? '∞' : `${stock} un`;
        return `${status} ${p.emoji || '📦'} **${p.name}**${stars}\n> ${formatCurrency(p.price, cfg.currencySymbol)} | ${stockInfo} | \`${p.deliveryType}\` | ID: \`${p.id}\``;
      }).join('\n');
      embed.setDescription(lines.substring(0, 4000));
      embed.setFooter({ text: `${products.length} produto(s) • Use /produto editar para modificar` });

      if (products.length > 0) {
        const options = products.slice(0, 25).map(p => ({
          label: `${p.active === false ? '❌' : '✅'} ${p.name}`.substring(0, 100),
          description: `${formatCurrency(p.price, cfg.currencySymbol)} • ID: ${p.id}`,
          value: p.id,
          emoji: p.emoji || '📦',
        }));
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('admin_product_select')
            .setPlaceholder('🔧 Selecione um produto para gerenciar')
            .addOptions(options)
        );
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'criar') {
      const modal = new ModalBuilder().setCustomId('produto_criar').setTitle('📦 Criar Novo Produto');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome do Produto').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder('Ex: Assinatura Premium Mensal')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Descrição Detalhada').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setPlaceholder('Descreva o produto, o que está incluso, benefícios...')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço (use ponto como decimal)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 29.90')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('category').setLabel('Categoria').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Geral, Assinaturas, Jogos...')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('delivery').setLabel('Tipo de Entrega').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('key | download | role | manual'))
      );
      return interaction.showModal(modal);
    }

    if (sub === 'editar') {
      const id = interaction.options.getString('produto');
      const p = db.getProduct(id);
      if (!p) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });
      const modal = new ModalBuilder().setCustomId(`produto_editar:${id}`).setTitle(`✏️ Editar: ${p.name.substring(0, 30)}`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true).setValue(p.name)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(p.description || '')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Preço').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(p.price))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('category').setLabel('Categoria').setStyle(TextInputStyle.Short).setRequired(false).setValue(p.category || 'Geral')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('extras').setLabel('Emoji | URL Imagem | URL Thumbnail').setStyle(TextInputStyle.Short).setRequired(false).setValue([p.emoji || '', p.imageUrl || '', p.thumbnailUrl || ''].join('|')).setPlaceholder('🎮|https://img.url/img.png|https://img.url/thumb.png'))
      );
      return interaction.showModal(modal);
    }

    if (sub === 'deletar') {
      const id = interaction.options.getString('produto');
      const p = db.getProduct(id);
      if (!p) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });
      const stock = db.stockCount(id);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`confirm_delete_product:${id}`).setLabel('Sim, deletar permanentemente').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
        new ButtonBuilder().setCustomId('cancel_action').setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
      );
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('⚠️ Confirmar Exclusão')
          .setDescription(`Deseja deletar **${p.name}** e todo o seu estoque?\n\n📦 Itens em estoque: **${stock}**\n💰 Preço: **${formatCurrency(p.price, cfg.currencySymbol)}**\n\n**⚠️ Esta ação é irreversível!**`)],
        components: [row], ephemeral: true
      });
    }

    if (sub === 'ativar') {
      const id = interaction.options.getString('produto');
      const ativo = interaction.options.getBoolean('ativo');
      const p = db.getProduct(id);
      if (!p) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });
      p.active = ativo;
      db.saveProduct(p);
      return interaction.reply({ embeds: [successEmbed(`Produto **${p.name}** foi ${ativo ? '✅ ativado e está visível na loja' : '❌ desativado e ficou oculto da loja'}.`)], ephemeral: true });
    }

    if (sub === 'avaliacoes') {
      const id = interaction.options.getString('produto');
      const p = db.getProduct(id);
      if (!p) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });
      const reviews = db.getProductReviews(id);
      const rating = db.getProductRating(id);
      if (!reviews.length) return interaction.reply({ embeds: [errorEmbed(`**${p.name}** ainda não tem avaliações.`)], ephemeral: true });
      const embed = new EmbedBuilder().setColor(cfg.shopColor)
        .setTitle(`⭐ Avaliações — ${p.name}`)
        .setDescription(`Nota média: **${rating.avg}/5** (${rating.count} avaliação(ões))`)
        .addFields(reviews.slice(0, 10).map(r => ({
          name: `${'⭐'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} — <@${r.userId}>`,
          value: r.comment || '*Sem comentário*'
        })));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'remover-avaliacao') {
      const id = interaction.options.getString('produto');
      const user = interaction.options.getUser('usuario');
      const p = db.getProduct(id);
      db.deleteReview(id, user.id);
      return interaction.reply({ embeds: [successEmbed(`Avaliação de <@${user.id}> removida do produto **${p?.name || id}**.`)], ephemeral: true });
    }
  }
};

export const estoque = {
  data: new SlashCommandBuilder()
    .setName('estoque')
    .setDescription('📦 Gerenciar estoque de produtos')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s
      .setName('geral')
      .setDescription('📊 Ver resumo de estoque de todos os produtos com alertas')
    )
    .addSubcommand(s => s
      .setName('ver')
      .setDescription('👁️ Ver itens em estoque de um produto específico')
      .addStringOption(o => o
        .setName('produto')
        .setDescription('Qual produto deseja ver o estoque?')
        .setRequired(true)
        .setAutocomplete(true)
      )
    )
    .addSubcommand(s => s
      .setName('adicionar')
      .setDescription('➕ Adicionar um único item ao estoque (chave, link ou código)')
      .addStringOption(o => o
        .setName('produto')
        .setDescription('Qual produto?')
        .setRequired(true)
        .setAutocomplete(true)
      )
      .addStringOption(o => o
        .setName('item')
        .setDescription('Chave, link de download ou código a adicionar')
        .setRequired(true)
      )
    )
    .addSubcommand(s => s
      .setName('adicionar-lote')
      .setDescription('📥 Adicionar vários itens de uma vez (abre formulário, um por linha)')
      .addStringOption(o => o
        .setName('produto')
        .setDescription('Qual produto receberá os itens?')
        .setRequired(true)
        .setAutocomplete(true)
      )
    )
    .addSubcommand(s => s
      .setName('limpar')
      .setDescription('🗑️ Remover todo o estoque de um produto')
      .addStringOption(o => o
        .setName('produto')
        .setDescription('Qual produto terá o estoque zerado?')
        .setRequired(true)
        .setAutocomplete(true)
      )
    )
    .addSubcommand(s => s
      .setName('cargo')
      .setDescription('🎭 Definir qual cargo será entregue automaticamente ao comprar')
      .addStringOption(o => o
        .setName('produto')
        .setDescription('Produto de tipo "role"')
        .setRequired(true)
        .setAutocomplete(true)
      )
      .addRoleOption(o => o
        .setName('cargo')
        .setDescription('Cargo a ser entregue ao comprador')
        .setRequired(true)
      )
    ),

  async autocomplete(interaction, client) {
    const db = client.db;
    const focused = interaction.options.getFocused().toLowerCase();
    const cfg = db.getConfig();
    const products = db.getAllProducts().filter(p =>
      p.name.toLowerCase().includes(focused) ||
      p.id.toLowerCase().includes(focused)
    );
    const choices = products.slice(0, 25).map(p => {
      const stock = db.stockCount(p.id);
      const infinite = ['manual', 'role'].includes(p.deliveryType);
      const stockInfo = infinite ? '∞' : `${stock} un`;
      const alert = !infinite && stock <= (db.getConfig().lowStockThreshold || 5) && stock > 0 ? ' ⚠️' : '';
      const empty = !infinite && stock === 0 ? ' 🔴' : '';
      return {
        name: `${p.name} — ${stockInfo}${alert}${empty} | ${formatCurrency(p.price, cfg.currencySymbol)}`.substring(0, 100),
        value: p.id,
      };
    });
    return interaction.respond(choices);
  },

  async execute(interaction, client) {
    const db = client.db;
    const cfg = db.getConfig();
    if (!adminGuard(interaction, cfg)) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'geral') {
      const products = db.getAllProducts();
      if (!products.length) return interaction.reply({ embeds: [errorEmbed('Nenhum produto cadastrado.')], ephemeral: true });
      const threshold = cfg.lowStockThreshold || 5;
      const embed = new EmbedBuilder().setColor(cfg.shopColor).setTitle('📊 Resumo de Estoque Geral').setTimestamp();

      let semEstoque = 0, baixoEstoque = 0;
      const lines = products.map(p => {
        const count = db.stockCount(p.id);
        const infinite = ['manual', 'role'].includes(p.deliveryType);
        let icon, info;
        if (infinite) {
          icon = '♾️';
          info = `Entrega ${p.deliveryType}`;
        } else if (count === 0) {
          icon = '🔴';
          info = 'SEM ESTOQUE';
          semEstoque++;
        } else if (count <= threshold) {
          icon = '⚠️';
          info = `${count} un — ESTOQUE BAIXO`;
          baixoEstoque++;
        } else {
          icon = '✅';
          info = `${count} unidades`;
        }
        return `${icon} **${p.name}** — ${info} | \`${p.id}\``;
      }).join('\n');

      embed.setDescription(lines.substring(0, 4000));
      const summary = [];
      if (semEstoque) summary.push(`🔴 ${semEstoque} produto(s) sem estoque`);
      if (baixoEstoque) summary.push(`⚠️ ${baixoEstoque} produto(s) com estoque baixo`);
      if (!summary.length) summary.push('✅ Todos os estoques estão OK');
      embed.setFooter({ text: summary.join(' • ') });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const id = interaction.options.getString('produto');
    const product = db.getProduct(id);
    if (!product) return interaction.reply({ embeds: [errorEmbed('Produto não encontrado.')], ephemeral: true });

    if (sub === 'ver') {
      const items = db.getStockItems(id);
      const embed = new EmbedBuilder().setColor(cfg.shopColor)
        .setTitle(`📦 Estoque — ${product.name}`)
        .addFields(
          { name: '🔢 Total de Itens', value: String(items.length), inline: true },
          { name: '🚚 Tipo de Entrega', value: product.deliveryType || 'N/A', inline: true },
          { name: '💰 Preço Unitário', value: formatCurrency(product.price, cfg.currencySymbol), inline: true },
        );
      if (items.length) {
        embed.addFields({ name: '🔍 Primeiros 10 Itens', value: items.slice(0, 10).map((it, i) => `\`${i + 1}.\` ${it.substring(0, 70)}`).join('\n') });
      } else {
        embed.addFields({ name: '⚠️ Aviso', value: 'Estoque vazio! Use `/estoque adicionar-lote` para adicionar itens.' });
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'adicionar') {
      const item = interaction.options.getString('item');
      db.addStockItem(id, item);
      const total = db.stockCount(id);
      return interaction.reply({ embeds: [successEmbed(`Item adicionado ao estoque de **${product.name}**!\n📦 Total em estoque agora: **${total}** unidade(s).`)], ephemeral: true });
    }

    if (sub === 'adicionar-lote') {
      const modal = new ModalBuilder().setCustomId(`stock_bulk:${id}`).setTitle(`📥 Lote — ${product.name.substring(0, 25)}`);
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('items')
          .setLabel(`Itens para: ${product.name.substring(0, 40)}`)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Cole aqui os itens, um por linha:\nCHAVE-XXXX-YYYY-ZZZZ\nhttps://link.com/download/...\nCódigo123')
      ));
      return interaction.showModal(modal);
    }

    if (sub === 'limpar') {
      const before = db.stockCount(id);
      db.set('stock', { ...db.get('stock'), [id]: [] });
      return interaction.reply({ embeds: [successEmbed(`Estoque de **${product.name}** zerado.\n🗑️ **${before}** item(s) removidos.`)], ephemeral: true });
    }

    if (sub === 'cargo') {
      const roleId = String(interaction.options.get('cargo')?.value);
      if (!roleId) return interaction.reply({ embeds: [errorEmbed('Cargo não encontrado.')], ephemeral: true });
      product.deliveryType = 'role';
      product.deliveryRoleId = roleId;
      db.saveProduct(product);
      return interaction.reply({ embeds: [successEmbed(`Cargo <@&${roleId}> configurado como entrega de **${product.name}**.\n\nAo comprar, o cargo será atribuído automaticamente.`)], ephemeral: true });
    }
  }
};

export const cupom = {
  data: new SlashCommandBuilder()
    .setName('cupom')
    .setDescription('🏷️ Gerenciar cupons de desconto')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s
      .setName('criar')
      .setDescription('➕ Criar um novo cupom de desconto (abre formulário)')
    )
    .addSubcommand(s => s
      .setName('listar')
      .setDescription('📋 Ver todos os cupons com status, usos e validade')
    )
    .addSubcommand(s => s
      .setName('info')
      .setDescription('🔍 Ver detalhes completos de um cupom específico')
      .addStringOption(o => o
        .setName('codigo')
        .setDescription('Código do cupom')
        .setRequired(true)
        .setAutocomplete(true)
      )
    )
    .addSubcommand(s => s
      .setName('deletar')
      .setDescription('🗑️ Deletar um cupom permanentemente')
      .addStringOption(o => o
        .setName('codigo')
        .setDescription('Código do cupom a deletar')
        .setRequired(true)
        .setAutocomplete(true)
      )
    ),

  async autocomplete(interaction, client) {
    const db = client.db;
    const focused = interaction.options.getFocused().toLowerCase();
    const cfg = db.getConfig();
    const coupons = db.getAllCoupons().filter(c =>
      c.code.toLowerCase().includes(focused)
    );
    const now = Date.now();
    const choices = coupons.slice(0, 25).map(c => {
      const val = c.type === 'percent' ? `${c.value}%` : formatCurrency(c.value, cfg.currencySymbol);
      const expired = c.expiresAt && new Date(c.expiresAt).getTime() < now;
      const status = expired ? '❌ Expirado' : '✅ Ativo';
      const uses = c.maxUses ? `${c.uses || 0}/${c.maxUses} usos` : `${c.uses || 0} usos`;
      return {
        name: `${c.code} — ${val} de desconto • ${uses} • ${status}`.substring(0, 100),
        value: c.code,
      };
    });
    return interaction.respond(choices);
  },

  async execute(interaction, client) {
    const db = client.db;
    const cfg = db.getConfig();
    if (!adminGuard(interaction, cfg)) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'criar') {
      const modal = new ModalBuilder().setCustomId('cupom_criar').setTitle('🏷️ Criar Cupom de Desconto');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Código do Cupom (será em maiúsculas)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20).setPlaceholder('Ex: DESCONTO20')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('Tipo de desconto').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('percent = percentual (%) | fixed = valor fixo (R$)')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('value').setLabel('Valor do desconto').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 20 para 20% ou 10.00 para R$10,00')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('maxUses').setLabel('Máximo de usos (0 ou vazio = ilimitado)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('0')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('expires').setLabel('Data de expiração (vazio = sem expiração)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('DD/MM/AAAA'))
      );
      return interaction.showModal(modal);
    }

    if (sub === 'listar') {
      const coupons = db.getAllCoupons();
      if (!coupons.length) return interaction.reply({ embeds: [errorEmbed('Nenhum cupom cadastrado. Use `/cupom criar` para criar um.')], ephemeral: true });
      const embed = new EmbedBuilder().setColor(cfg.shopColor).setTitle('🏷️ Cupons de Desconto').setTimestamp();
      const now = Date.now();
      const lines = coupons.map(c => {
        const val = c.type === 'percent' ? `**${c.value}%** off` : `**${formatCurrency(c.value, cfg.currencySymbol)}** off`;
        const uses = c.maxUses ? `${c.uses || 0}/${c.maxUses}` : `${c.uses || 0}/∞`;
        const expired = c.expiresAt && new Date(c.expiresAt).getTime() < now;
        const exp = c.expiresAt ? `<t:${Math.floor(new Date(c.expiresAt).getTime() / 1000)}:d>` : 'sem expiração';
        return `${expired ? '❌' : '✅'} \`${c.code}\` — ${val} | Usos: ${uses} | ${exp}`;
      }).join('\n');
      embed.setDescription(lines);
      embed.setFooter({ text: `${coupons.length} cupom(ns) • Use /cupom info <código> para detalhes` });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'info') {
      const code = interaction.options.getString('codigo');
      const c = db.getCoupon(code);
      if (!c) return interaction.reply({ embeds: [errorEmbed('Cupom não encontrado.')], ephemeral: true });
      const embed = new EmbedBuilder().setColor(cfg.shopColor).setTitle(`🏷️ Cupom: ${c.code}`)
        .addFields(
          { name: '📊 Tipo de Desconto', value: c.type === 'percent' ? '📉 Percentual' : '💵 Valor fixo', inline: true },
          { name: '💰 Valor', value: c.type === 'percent' ? `${c.value}% de desconto` : `${formatCurrency(c.value, cfg.currencySymbol)} de desconto`, inline: true },
          { name: '🔢 Usos', value: `${c.uses || 0}${c.maxUses ? `/${c.maxUses}` : ' (ilimitado)'}`, inline: true },
          { name: '📅 Criado em', value: `<t:${Math.floor(new Date(c.createdAt).getTime() / 1000)}:d>`, inline: true },
          { name: '⏰ Expira em', value: c.expiresAt ? `<t:${Math.floor(new Date(c.expiresAt).getTime() / 1000)}:f>` : 'Sem expiração', inline: true },
          { name: '💵 Valor mínimo', value: c.minValue ? formatCurrency(c.minValue, cfg.currencySymbol) : 'Nenhum', inline: true },
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'deletar') {
      const code = interaction.options.getString('codigo');
      if (!db.getCoupon(code)) return interaction.reply({ embeds: [errorEmbed('Cupom não encontrado.')], ephemeral: true });
      db.deleteCoupon(code);
      return interaction.reply({ embeds: [successEmbed(`Cupom \`${code.toUpperCase()}\` deletado com sucesso.`)], ephemeral: true });
    }
  }
};

export const pedidos = {
  data: new SlashCommandBuilder()
    .setName('pedidos')
    .setDescription('📋 Gerenciar pedidos da loja')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s
      .setName('ver')
      .setDescription('🔍 Ver detalhes completos de um pedido específico')
      .addStringOption(o => o
        .setName('id')
        .setDescription('ID do pedido (ex: PED-000001)')
        .setRequired(true)
      )
    )
    .addSubcommand(s => s
      .setName('listar')
      .setDescription('📋 Listar pedidos recentes com filtros opcionais')
      .addStringOption(o => o
        .setName('status')
        .setDescription('Filtrar por status do pedido')
        .addChoices(
          { name: '⏳ Aguardando Pagamento', value: 'pending' },
          { name: '✅ Pago', value: 'paid' },
          { name: '📦 Entregue', value: 'delivered' },
          { name: '❌ Expirado', value: 'expired' },
          { name: '↩️ Reembolsado', value: 'refunded' },
          { name: '🚫 Cancelado', value: 'cancelled' },
        )
      )
      .addUserOption(o => o.setName('usuario').setDescription('Filtrar por usuário específico'))
    )
    .addSubcommand(s => s
      .setName('reembolsar')
      .setDescription('↩️ Processar reembolso de um pedido via Mercado Pago')
      .addStringOption(o => o
        .setName('id')
        .setDescription('ID do pedido a reembolsar (ex: PED-000001)')
        .setRequired(true)
      )
    )
    .addSubcommand(s => s
      .setName('entregar')
      .setDescription('📦 Forçar entrega manual de um pedido')
      .addStringOption(o => o
        .setName('id')
        .setDescription('ID do pedido (ex: PED-000001)')
        .setRequired(true)
      )
    ),

  async execute(interaction, client) {
    const db = client.db;
    const cfg = db.getConfig();
    if (!adminGuard(interaction, cfg)) return;
    const sub = interaction.options.getSubcommand();

    if (sub === 'ver') {
      const id = interaction.options.getString('id').toUpperCase();
      const order = db.getOrder(id);
      if (!order) return interaction.reply({ embeds: [errorEmbed(`Pedido \`${id}\` não encontrado.`)], ephemeral: true });
      return interaction.reply({ embeds: [orderEmbed(cfg, order)], ephemeral: true });
    }

    if (sub === 'listar') {
      await interaction.deferReply({ ephemeral: true });
      const status = interaction.options.getString('status');
      const user = interaction.options.getUser('usuario');
      let orders = db.getAllOrders();
      if (status) orders = orders.filter(o => o.status === status);
      if (user) orders = orders.filter(o => o.userId === user.id);
      orders = orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 25);
      if (!orders.length) return interaction.editReply({ embeds: [errorEmbed('Nenhum pedido encontrado com esses filtros.')] });
      const icons = { pending: '⏳', paid: '✅', delivered: '📦', expired: '❌', refunded: '↩️', cancelled: '🚫' };
      const embed = new EmbedBuilder().setColor(cfg.shopColor).setTitle('📋 Pedidos').setTimestamp()
        .setFooter({ text: `${orders.length} resultado(s)${status ? ` • Filtro: ${status}` : ''}${user ? ` • Usuário: ${user.tag}` : ''}` });
      const lines = orders.map(o =>
        `${icons[o.status] || '?'} **${o.id}** — <@${o.userId}> — ${formatCurrency(o.total, cfg.currencySymbol)} — <t:${Math.floor(new Date(o.createdAt).getTime() / 1000)}:R>`
      ).join('\n');
      embed.setDescription(lines);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'reembolsar') {
      const id = interaction.options.getString('id').toUpperCase();
      const order = db.getOrder(id);
      if (!order) return interaction.reply({ embeds: [errorEmbed(`Pedido \`${id}\` não encontrado.`)], ephemeral: true });
      if (order.status === 'refunded') return interaction.reply({ embeds: [errorEmbed('Este pedido já foi reembolsado.')], ephemeral: true });
      if (!['paid', 'delivered'].includes(order.status)) return interaction.reply({ embeds: [errorEmbed('Apenas pedidos com status **Pago** ou **Entregue** podem ser reembolsados.')], ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      const result = await refundPayment(order.paymentId);
      if (!result.success) return interaction.editReply({ embeds: [errorEmbed(`Falha ao processar reembolso: ${result.error}`)] });
      order.status = 'refunded';
      order.refundedAt = new Date().toISOString();
      order.refundedBy = interaction.user.id;
      db.saveOrder(order);
      const pending = db.getPendingRefundByOrder(id);
      if (pending) { pending.status = 'approved'; pending.resolvedAt = new Date().toISOString(); pending.resolvedBy = interaction.user.id; db.saveRefundRequest(pending); }
      try {
        const buyer = await client.users.fetch(order.userId).catch(() => null);
        if (buyer) await buyer.send({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setTitle('↩️ Reembolso Aprovado').setDescription(`Seu reembolso do pedido **${id}** foi processado por um administrador.\n💰 **${formatCurrency(order.total, cfg.currencySymbol)}** serão devolvidos em até 10 dias úteis.`).setTimestamp()] }).catch(() => {});
      } catch {}
      logger.info('ADMIN', `Pedido ${id} reembolsado diretamente`, { by: interaction.user.id });
      return interaction.editReply({ embeds: [successEmbed(`Pedido **${id}** reembolsado!\n💰 **${formatCurrency(order.total, cfg.currencySymbol)}** serão devolvidos ao comprador em até 10 dias úteis.`)] });
    }

    if (sub === 'entregar') {
      const id = interaction.options.getString('id').toUpperCase();
      const order = db.getOrder(id);
      if (!order) return interaction.reply({ embeds: [errorEmbed(`Pedido \`${id}\` não encontrado.`)], ephemeral: true });
      if (order.status === 'delivered') return interaction.reply({ embeds: [errorEmbed('Este pedido já foi entregue.')], ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      if (order.status === 'pending') { order.status = 'paid'; order.paidAt = new Date().toISOString(); db.saveOrder(order); }
      await deliverOrder(client, order, db);
      return interaction.editReply({ embeds: [successEmbed(`Entrega do pedido **${id}** processada! O comprador receberá os itens por DM.`)] });
    }
  }
};

export const configLoja = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('⚙️ Configurar a loja')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s
      .setName('ver')
      .setDescription('👁️ Ver todas as configurações atuais da loja')
    )
    .addSubcommand(s => s
      .setName('editar')
      .setDescription('✏️ Editar nome, descrição, emoji, banner e cor da loja')
    )
    .addSubcommand(s => s
      .setName('canal-logs')
      .setDescription('📋 Definir o canal onde os logs internos serão enviados')
      .addChannelOption(o => o.setName('canal').setDescription('Canal de texto para logs').setRequired(true).addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand(s => s
      .setName('canal-vendas')
      .setDescription('📢 Definir o canal de notificações públicas de venda')
      .addChannelOption(o => o.setName('canal').setDescription('Canal de texto para notificações').setRequired(true).addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand(s => s
      .setName('canal-loja')
      .setDescription('🛒 Definir o canal onde o painel da loja será publicado')
      .addChannelOption(o => o.setName('canal').setDescription('Canal de texto da loja').setRequired(true).addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand(s => s
      .setName('canal-reembolso')
      .setDescription('↩️ Definir o canal onde as solicitações de reembolso serão enviadas para aprovação')
      .addChannelOption(o => o.setName('canal').setDescription('Canal de texto para solicitações de reembolso').setRequired(true).addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand(s => s
      .setName('cargo-admin')
      .setDescription('👑 Adicionar um cargo com permissão total de administrador')
      .addRoleOption(o => o.setName('cargo').setDescription('Cargo com acesso completo').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('cargo-staff')
      .setDescription('🛠️ Adicionar um cargo de suporte/staff')
      .addRoleOption(o => o.setName('cargo').setDescription('Cargo de staff').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('remover-cargo')
      .setDescription('➖ Remover um cargo da lista de admin ou staff')
      .addRoleOption(o => o.setName('cargo').setDescription('Cargo a remover').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('manutencao')
      .setDescription('🔧 Ativar ou desativar o modo manutenção (bloqueia compras)')
      .addBooleanOption(o => o.setName('ativo').setDescription('true = ativar manutenção | false = desativar').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('expiracao')
      .setDescription('⏰ Definir tempo de expiração dos pedidos pendentes')
      .addIntegerOption(o => o
        .setName('minutos')
        .setDescription('Minutos até o pedido expirar (5 a 1440)')
        .setMinValue(5)
        .setMaxValue(1440)
        .setRequired(true)
      )
    )
    .addSubcommand(s => s
      .setName('comissao-afiliado')
      .setDescription('🤝 Definir percentual de comissão para afiliados')
      .addIntegerOption(o => o
        .setName('percentual')
        .setDescription('Percentual de comissão (1 a 50)')
        .setMinValue(1)
        .setMaxValue(50)
        .setRequired(true)
      )
    )
    .addSubcommand(s => s
      .setName('estoque-alerta')
      .setDescription('📊 Definir quantidade mínima para alerta de estoque baixo')
      .addIntegerOption(o => o
        .setName('quantidade')
        .setDescription('Alerta quando estoque ficar abaixo deste número')
        .setMinValue(1)
        .setRequired(true)
      )
    )
    .addSubcommand(s => s
      .setName('painel')
      .setDescription('📋 Publicar ou atualizar o painel da loja no canal configurado')
    )
    .addSubcommand(s => s
      .setName('stats')
      .setDescription('📊 Ver estatísticas completas da loja (receita, pedidos, produtos)')
    )
    .addSubcommand(s => s
      .setName('afiliados')
      .setDescription('🏆 Ver ranking dos afiliados com mais vendas e ganhos')
    )
    .addSubcommand(s => s
      .setName('blacklist-add')
      .setDescription('🚫 Bloquear um usuário de comprar na loja')
      .addUserOption(o => o.setName('usuario').setDescription('Usuário a bloquear').setRequired(true))
      .addStringOption(o => o.setName('motivo').setDescription('Motivo do bloqueio (opcional)').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('blacklist-remove')
      .setDescription('✅ Desbloquear um usuário da blacklist')
      .addUserOption(o => o.setName('usuario').setDescription('Usuário a desbloquear').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('afiliado-pagar')
      .setDescription('💸 Marcar saldo pendente de um afiliado como pago')
      .addUserOption(o => o.setName('usuario').setDescription('Afiliado a receber o pagamento').setRequired(true))
    ),

  async execute(interaction, client) {
    const db = client.db;
    const cfg = db.getConfig();
    if (!isAdmin(interaction, cfg)) return interaction.reply({ embeds: [errorEmbed('Sem permissão de administrador.')], ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === 'ver') {
      const embed = new EmbedBuilder().setColor(cfg.shopColor).setTitle('⚙️ Configurações da Loja').setTimestamp()
        .addFields(
          { name: '🏪 Nome da Loja', value: cfg.shopName, inline: true },
          { name: `Emoji`, value: cfg.shopEmoji || '🛒', inline: true },
          { name: '💰 Moeda', value: `${cfg.currencySymbol} (${cfg.currency})`, inline: true },
          { name: '⏰ Expiração de Pedido', value: `${cfg.orderExpireMinutes} minutos`, inline: true },
          { name: '🛒 Máx. Itens/Carrinho', value: String(cfg.maxCartItems), inline: true },
          { name: '⚠️ Alerta Estoque Baixo', value: `< ${cfg.lowStockThreshold || 5} unidades`, inline: true },
          { name: '🔧 Modo Manutenção', value: cfg.maintenanceMode ? '✅ Ativo (loja fechada)' : '❌ Inativo (loja aberta)', inline: true },
          { name: '🤝 Comissão Afiliado', value: `${cfg.affiliateCommissionPercent}%`, inline: true },
          { name: '⭐ Avaliações', value: cfg.allowReviews ? '✅ Ativas' : '❌ Inativas', inline: true },
          { name: '📋 Canal Logs', value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : '❌ Não configurado', inline: true },
          { name: '📢 Canal Vendas', value: cfg.salesChannelId ? `<#${cfg.salesChannelId}>` : '❌ Não configurado', inline: true },
          { name: '🛒 Canal Loja', value: cfg.shopChannelId ? `<#${cfg.shopChannelId}>` : '❌ Não configurado', inline: true },
          { name: '↩️ Canal Reembolsos', value: cfg.refundChannelId ? `<#${cfg.refundChannelId}>` : '❌ Não configurado', inline: true },
          { name: '👑 Cargos Admin', value: cfg.adminRoles.map(r => `<@&${r}>`).join(', ') || 'Nenhum configurado' },
          { name: '🛠️ Cargos Staff', value: cfg.staffRoles.map(r => `<@&${r}>`).join(', ') || 'Nenhum configurado' },
        );
      if (cfg.shopBanner) embed.setImage(cfg.shopBanner);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'editar') {
      const modal = new ModalBuilder().setCustomId('config_editar').setTitle('⚙️ Editar Configurações da Loja');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('shopName').setLabel('Nome da Loja').setStyle(TextInputStyle.Short).setValue(cfg.shopName).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('shopDescription').setLabel('Descrição da Loja').setStyle(TextInputStyle.Paragraph).setValue(cfg.shopDescription || '').setRequired(false).setPlaceholder('Aparece no catálogo e no painel da loja...')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('shopEmoji').setLabel('Emoji da Loja').setStyle(TextInputStyle.Short).setValue(cfg.shopEmoji || '🛒').setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('shopBanner').setLabel('URL do Banner (imagem larga)').setStyle(TextInputStyle.Short).setValue(cfg.shopBanner || '').setRequired(false).setPlaceholder('https://...')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('shopColor').setLabel('Cor principal em hexadecimal').setStyle(TextInputStyle.Short).setValue('#' + (cfg.shopColor || 0x2ECC71).toString(16).padStart(6, '0')).setRequired(false).setPlaceholder('#2ECC71'))
      );
      return interaction.showModal(modal);
    }

    const roleOps = {
      'cargo-admin':   () => { const r = String(interaction.options.get('cargo')?.value); if (!r) throw new Error('Cargo não encontrado.'); if (!cfg.adminRoles.includes(r)) cfg.adminRoles.push(r); return `Cargo admin <@&${r}> adicionado com sucesso.`; },
      'cargo-staff':   () => { const r = String(interaction.options.get('cargo')?.value); if (!r) throw new Error('Cargo não encontrado.'); if (!cfg.staffRoles.includes(r)) cfg.staffRoles.push(r); return `Cargo staff <@&${r}> adicionado com sucesso.`; },
      'remover-cargo': () => { const r = String(interaction.options.get('cargo')?.value); if (!r) throw new Error('Cargo não encontrado.'); cfg.adminRoles = cfg.adminRoles.filter(x => x !== r); cfg.staffRoles = cfg.staffRoles.filter(x => x !== r); return `Cargo <@&${r}> removido da lista de admin e staff.`; },
    };
    const channelOps = {
      'canal-logs':       () => { const chId = interaction.options.get('canal')?.value; if (!chId) throw new Error('Canal não encontrado.'); cfg.logChannelId      = String(chId); return `Canal de logs definido como <#${cfg.logChannelId}>.`; },
      'canal-vendas':     () => { const chId = interaction.options.get('canal')?.value; if (!chId) throw new Error('Canal não encontrado.'); cfg.salesChannelId    = String(chId); return `Canal de vendas definido como <#${cfg.salesChannelId}>.`; },
      'canal-loja':       () => { const chId = interaction.options.get('canal')?.value; if (!chId) throw new Error('Canal não encontrado.'); cfg.shopChannelId     = String(chId); return `Canal da loja definido como <#${cfg.shopChannelId}>.`; },
      'canal-reembolso':  () => { const chId = interaction.options.get('canal')?.value; if (!chId) throw new Error('Canal não encontrado.'); cfg.refundChannelId   = String(chId); return `Canal de reembolsos definido como <#${cfg.refundChannelId}>.\n\nSolicitações de reembolso dos usuários serão enviadas para aprovação neste canal.`; },
    };
    const simpleOps = {
      'manutencao':        () => { cfg.maintenanceMode = interaction.options.getBoolean('ativo'); return `Modo manutenção **${cfg.maintenanceMode ? '✅ ativado' : '❌ desativado'}**. ${cfg.maintenanceMode ? 'A loja está fechada para usuários.' : 'A loja voltou ao normal.'}`; },
      'expiracao':         () => { cfg.orderExpireMinutes = interaction.options.getInteger('minutos'); return `Pedidos pendentes expirarão após **${cfg.orderExpireMinutes} minutos**.`; },
      'comissao-afiliado': () => { cfg.affiliateCommissionPercent = interaction.options.getInteger('percentual'); return `Comissão de afiliados atualizada para **${cfg.affiliateCommissionPercent}%** por venda.`; },
      'estoque-alerta':    () => { cfg.lowStockThreshold = interaction.options.getInteger('quantidade'); return `Alerta de estoque baixo configurado: abaixo de **${cfg.lowStockThreshold}** unidades.`; },
    };

    if (roleOps[sub] || channelOps[sub] || simpleOps[sub]) {
      const fn = roleOps[sub] || channelOps[sub] || simpleOps[sub];
      const msg = fn();
      db.setConfig(cfg);
      return interaction.reply({ embeds: [successEmbed(msg)], ephemeral: true });
    }

    if (sub === 'stats') {
      const stats = db.getStats();
      const top = db.getTopProducts(5);
      const embed = new EmbedBuilder().setColor(cfg.shopColor).setTitle('📊 Estatísticas da Loja').setTimestamp()
        .addFields(
          { name: '💰 Receita Total', value: formatCurrency(stats.totalRevenue, cfg.currencySymbol), inline: true },
          { name: '📅 Receita Hoje', value: formatCurrency(stats.todayRevenue, cfg.currencySymbol), inline: true },
          { name: '📆 Receita 30 dias', value: formatCurrency(stats.monthRevenue, cfg.currencySymbol), inline: true },
          { name: '📦 Total de Pedidos', value: String(stats.totalOrders), inline: true },
          { name: '⏳ Pedidos Pendentes', value: String(stats.pendingOrders), inline: true },
          { name: '🚫 Cancelados/Expirados', value: String(stats.cancelledOrders), inline: true },
          { name: '🏷️ Produtos Ativos', value: `${stats.activeProducts} de ${stats.totalProducts}`, inline: true },
          { name: '🤝 Afiliados', value: String(stats.totalAffiliates), inline: true },
          { name: '🏷️ Cupons', value: String(stats.totalCoupons), inline: true },
        );
      if (top.length) {
        embed.addFields({ name: '🏆 Produtos Mais Vendidos', value: top.map((e, i) => `**${i + 1}.** ${e.product.name} — ${e.qty} vendas — ${formatCurrency(e.revenue, cfg.currencySymbol)}`).join('\n') });
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'painel') {
      if (!cfg.shopChannelId) return interaction.reply({ embeds: [errorEmbed('Configure o canal da loja primeiro com `/config canal-loja`.')], ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      const channel = await client.channels.fetch(cfg.shopChannelId).catch(() => null);
      if (!channel) return interaction.editReply({ embeds: [errorEmbed('Canal não encontrado. Verifique as configurações com `/config ver`.')] });
      const products = db.getAllProducts().filter(p => p.active !== false);
      const embed = new EmbedBuilder()
        .setColor(cfg.shopColor)
        .setTitle(`${cfg.shopEmoji} ${cfg.shopName}`)
        .setDescription(cfg.shopDescription || 'Bem-vindo à nossa loja!')
        .setTimestamp()
        .setFooter({ text: `${products.length} produto(s) disponíveis • Clique em "Abrir Catálogo"` });
      if (cfg.shopBanner) embed.setImage(cfg.shopBanner);
      if (cfg.shopThumbnail) embed.setThumbnail(cfg.shopThumbnail);
      const categories = [...new Set(products.map(p => p.category || 'Geral'))];
      for (const cat of categories) {
        const cp = products.filter(p => (p.category || 'Geral') === cat);
        embed.addFields({ name: `📁 ${cat}`, value: cp.map(p => {
          const stock = db.stockCount(p.id);
          const avail = ['manual', 'role'].includes(p.deliveryType) ? '∞' : String(stock);
          const rating = db.getProductRating(p.id);
          const stars = rating ? ` ⭐${rating.avg}` : '';
          const stockIcon = ['manual', 'role'].includes(p.deliveryType) ? '🟢' : stock > 0 ? '🟢' : '🔴';
          return `${stockIcon} ${p.emoji || '📦'} **${p.name}**${stars} — ${formatCurrency(p.price, cfg.currencySymbol)} | ${avail} un`;
        }).join('\n') });
      }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('open_shop').setLabel('Abrir Catálogo').setStyle(ButtonStyle.Success).setEmoji('🛒'),
        new ButtonBuilder().setCustomId('open_cart').setLabel('Meu Carrinho').setStyle(ButtonStyle.Primary).setEmoji('🛍️'),
      );
      await channel.send({ embeds: [embed], components: [row] });
      return interaction.editReply({ embeds: [successEmbed(`Painel da loja publicado em <#${cfg.shopChannelId}> com sucesso!`)] });
    }

    if (sub === 'afiliados') {
      const affs = db.getAllAffiliates().sort((a, b) => (b.totalEarned || 0) - (a.totalEarned || 0)).slice(0, 10);
      if (!affs.length) return interaction.reply({ embeds: [errorEmbed('Nenhum afiliado cadastrado ainda.')], ephemeral: true });
      const embed = new EmbedBuilder().setColor(cfg.shopColor).setTitle('🏆 Ranking de Afiliados').setTimestamp();
      const medals = ['🥇', '🥈', '🥉'];
      const lines = affs.map((a, i) =>
        `${medals[i] || `**${i + 1}.**`} <@${a.userId}> — Código: \`${a.code}\` — ${a.sales} venda(s) — ${formatCurrency(a.totalEarned || 0, cfg.currencySymbol)} ganhos`
      ).join('\n');
      embed.setDescription(lines);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'blacklist-add') {
      const user = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo') || 'Não especificado';
      db.addBlacklist(user.id);
      logger.info('ADMIN', `Usuário ${user.id} adicionado à blacklist`, { by: interaction.user.id, motivo });
      return interaction.reply({ embeds: [successEmbed(`<@${user.id}> foi bloqueado da loja.\n**Motivo:** ${motivo}`)], ephemeral: true });
    }

    if (sub === 'blacklist-remove') {
      const user = interaction.options.getUser('usuario');
      db.removeBlacklist(user.id);
      return interaction.reply({ embeds: [successEmbed(`<@${user.id}> foi removido da blacklist e pode comprar novamente.`)], ephemeral: true });
    }

    if (sub === 'afiliado-pagar') {
      const user = interaction.options.getUser('usuario');
      const aff = db.getAffiliate(user.id);
      if (!aff) return interaction.reply({ embeds: [errorEmbed(`<@${user.id}> não é afiliado.`)], ephemeral: true });
      if (!aff.pendingBalance || aff.pendingBalance <= 0) return interaction.reply({ embeds: [errorEmbed(`<@${user.id}> não tem saldo pendente.`)], ephemeral: true });
      const amount = aff.pendingBalance;
      aff.paidBalance = (aff.paidBalance || 0) + amount;
      aff.pendingBalance = 0;
      db.saveAffiliate(aff);
      logger.info('ADMIN', `Comissão de ${amount} paga para afiliado ${user.id}`, { by: interaction.user.id });
      return interaction.reply({ embeds: [successEmbed(`**${formatCurrency(amount, cfg.currencySymbol)}** marcados como pagos para <@${user.id}>.\n✅ Saldo pendente zerado.`)], ephemeral: true });
    }
  }
};
