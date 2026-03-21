<div align="center">

# 🛒 ShopBot — Discord Store Bot

**Bot de loja completo para Discord com pagamentos via PIX (Mercado Pago)**

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord)](https://discord.js.org/)
[![Mercado Pago](https://img.shields.io/badge/Mercado%20Pago-PIX-009EE3?style=flat-square)](https://www.mercadopago.com.br)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Author](https://img.shields.io/badge/author-Ghostzinn07-ff6b6b?style=flat-square)](https://github.com/NGeff)

</div>

---

## ✨ Funcionalidades

### 💳 Pagamentos
- PIX via Mercado Pago com QR Code + código copia e cola
- **Polling automático** — o bot verifica o status dos pagamentos diretamente pela API do MP a cada 15 segundos, sem necessidade de servidor externo ou webhook
- Pedidos recentes verificados a cada ciclo, pedidos antigos verificados com menor frequência para poupar rate limit
- Expiração automática de pedidos pendentes
- Reembolso de pedidos pelo painel admin ou por solicitação do próprio usuário

### 📦 Estoque & Entrega
| Tipo | Descrição |
|---|---|
| `key` | 🔑 Chave/Código enviado por DM automaticamente |
| `download` | 📥 Link de download enviado por DM |
| `role` | 🎭 Cargo adicionado automaticamente ao membro |
| `manual` | 👤 Notificação ao staff para entrega manual |

- Estoque individual por produto
- Adição de itens em lote via modal (um por linha)
- Proteção contra entrega sem estoque
- Alerta de estoque baixo configurável

### 🛍️ Loja & Catálogo
- Catálogo com categorias, emojis, imagens e thumbnails
- Busca de produtos por nome, categoria ou descrição
- Painel publicável em canal com `/config painel`
- Botões de compra rápida e adicionar ao carrinho direto no produto

### 🛒 Carrinho
- Carrinho com múltiplos produtos e quantidades
- Limite configurável de itens por carrinho
- Compra rápida (sem carrinho) via botão

### 🏷️ Cupons
- Cupons percentuais (`20%`) e de valor fixo (`R$ 10,00`)
- Controle de uso máximo e data de expiração
- Valor mínimo de pedido por cupom

### ⭐ Avaliações
- Usuários podem avaliar produtos com nota (1–5) e comentário
- Exige compra prévia do produto para avaliar (configurável)
- Nota média exibida nos detalhes do produto
- Admins podem visualizar e remover avaliações

### ❤️ Lista de Desejos
- Usuários podem favoritar produtos e consultá-los depois
- Seleção rápida de um favorito diretamente pelo menu

### 🤝 Afiliados
- Registro com código único gerado automaticamente
- Comissão percentual configurável por venda confirmada
- Painel de estatísticas (vendas, ganho total, saldo pendente)
- Ranking de afiliados para admins
- Pagamento manual de saldo pelo admin com `/config afiliado-pagar`

### 🚫 Blacklist
- Bloqueio de usuários específicos de realizar compras
- Desbloqueio com `/config blacklist-remove`

### 📊 Histórico & Pedidos
- Histórico completo de compras por usuário
- Consulta de pedido por ID com status em tempo real
- Logs de vendas e falhas de entrega
- Solicitação de reembolso pelo próprio usuário com justificativa

### ⚙️ Administração
- Criação e edição de produtos via modais no Discord
- Estatísticas completas da loja (receita, pedidos, produtos)
- Controle de cargos admin e staff com possibilidade de remoção
- Canal de logs, canal de vendas e canal de reembolso separados
- Modo manutenção
- Expiração de pedidos configurável

---

## 📋 Comandos

### 🛍️ Usuários

| Comando | Descrição |
|---|---|
| `/loja catalogo` | Ver todos os produtos |
| `/loja produto <id>` | Ver detalhes de um produto |
| `/loja buscar <termo>` | Buscar produtos por nome, categoria ou descrição |
| `/loja comprar <id> [qty]` | Adicionar ao carrinho |
| `/loja carrinho` | Ver carrinho |
| `/loja remover <id>` | Remover item do carrinho |
| `/loja limpar` | Limpar carrinho |
| `/loja cupom <codigo>` | Aplicar cupom |
| `/loja checkout` | Finalizar pedido e gerar PIX |
| `/loja historico` | Ver histórico de compras |
| `/loja pedido <id>` | Consultar status de pedido |
| `/loja avaliar <produto> <nota> [comentario]` | Avaliar um produto comprado |
| `/loja favoritos` | Ver lista de desejos |
| `/loja favoritar <produto>` | Salvar produto na lista de desejos |
| `/loja desfavoritar <produto>` | Remover produto da lista de desejos |
| `/loja reembolso <pedido> <motivo>` | Solicitar reembolso de um pedido |
| `/afiliado entrar` | Entrar no programa de afiliados |
| `/afiliado info` | Ver estatísticas de afiliado |
| `/afiliado usar <codigo>` | Usar código de afiliado |

### ⚙️ Administração

| Comando | Descrição |
|---|---|
| `/produto criar` | Criar produto (modal) |
| `/produto editar <id>` | Editar produto (modal) |
| `/produto listar` | Listar produtos |
| `/produto ativar <id> <bool>` | Ativar/desativar produto |
| `/produto deletar <id>` | Deletar produto |
| `/produto avaliacoes <id>` | Ver avaliações de um produto |
| `/produto remover-avaliacao <id> <usuario>` | Remover avaliação de um usuário |
| `/estoque geral` | Resumo de estoque de todos os produtos |
| `/estoque ver <id>` | Ver itens em estoque |
| `/estoque adicionar <id> <item>` | Adicionar item |
| `/estoque adicionar-lote <id>` | Adicionar múltiplos itens (modal) |
| `/estoque limpar <id>` | Limpar estoque do produto |
| `/estoque cargo <id> <cargo>` | Definir cargo de entrega |
| `/cupom criar` | Criar cupom (modal) |
| `/cupom listar` | Listar cupons |
| `/cupom info <codigo>` | Ver detalhes de um cupom |
| `/cupom deletar <codigo>` | Deletar cupom |
| `/pedidos ver <id>` | Ver pedido |
| `/pedidos listar [status] [usuario]` | Listar pedidos recentes com filtros |
| `/pedidos reembolsar <id>` | Reembolsar via MP |
| `/pedidos entregar <id>` | Acionar entrega manualmente |
| `/config ver` | Ver configurações |
| `/config editar` | Editar nome, descrição, emoji, banner e cor |
| `/config canal-logs <canal>` | Canal de logs |
| `/config canal-vendas <canal>` | Canal de vendas |
| `/config canal-loja <canal>` | Canal do painel |
| `/config canal-reembolso <canal>` | Canal de solicitações de reembolso |
| `/config cargo-admin <cargo>` | Adicionar cargo admin |
| `/config cargo-staff <cargo>` | Adicionar cargo staff |
| `/config remover-cargo <cargo>` | Remover cargo da lista de admin/staff |
| `/config manutencao <bool>` | Modo manutenção |
| `/config expiracao <min>` | Tempo de expiração de pedidos |
| `/config comissao-afiliado <%>` | Percentual de comissão |
| `/config estoque-alerta <qtd>` | Limite para alerta de estoque baixo |
| `/config painel` | Publicar painel da loja |
| `/config stats` | Estatísticas completas da loja |
| `/config afiliados` | Ranking de afiliados |
| `/config blacklist-add <usuario> [motivo]` | Bloquear usuário |
| `/config blacklist-remove <usuario>` | Desbloquear usuário |
| `/config afiliado-pagar <usuario>` | Marcar saldo de afiliado como pago |

---

## 🚀 Instalação

### Pré-requisitos
- [Node.js](https://nodejs.org/) v22+
- Conta no [Mercado Pago Developers](https://www.mercadopago.com.br/developers) com Access Token de produção
- Bot no [Discord Developer Portal](https://discord.com/developers/applications)
  - Intents necessários: `Server Members Intent` e `Message Content Intent`
  - Permissões: `Manage Roles`, `Manage Channels`, `Send Messages`, `Embed Links`, `Read Message History`

### Passo a passo

```bash
# 1. Clone o repositório
git clone https://github.com/NGeff/discord-shop-bot.git
cd discord-shop-bot

# 2. Instale as dependências
npm install

# 3. Configure o ambiente
cp .env.example .env
# edite o .env com suas credenciais
```

**`.env`:**
```env
BOT_TOKEN=seu_bot_token
CLIENT_ID=seu_client_id
OWNER_ID=seu_discord_user_id

MP_ACCESS_TOKEN=seu_access_token_mercadopago

NODE_ENV=production
LOG_LEVEL=INFO
```

```bash
# 4. Inicie o bot
npm start
```

### Configuração inicial no Discord

```
1. /config cargo-admin @SeuCargo
2. /config canal-logs   #logs
3. /config canal-vendas #vendas
4. /config canal-loja   #loja
5. /config canal-reembolso #reembolsos
6. /produto criar        → preencha o modal
7. /estoque adicionar-lote <id>  → cole suas chaves (uma por linha)
8. /config painel        → publica o painel no canal configurado
```

---

## ⚙️ Como o pagamento funciona

```
Usuário faz /loja checkout
        ↓
Bot gera pagamento PIX na API do Mercado Pago
        ↓
Bot envia QR Code + código copia e cola para o usuário
        ↓
Polling automático a cada 15s verifica o status via API do MP
        ↓
Status "approved" → entrega automática + notificação
Status "cancelled/rejected" → pedido cancelado
Tempo expirado → pedido marcado como expirado
```

O usuário também pode clicar em **"Verificar Pagamento"** a qualquer momento para checar manualmente.

---

## 📁 Estrutura

```
shopbot/
├── src/
│   ├── commands/
│   │   ├── shop.js         # /loja, /afiliado
│   │   └── admin.js        # /produto, /estoque, /cupom, /pedidos, /config
│   ├── events/
│   │   ├── ready.js        # Poller de pagamentos + expirador automático
│   │   └── interactionCreate.js
│   ├── handlers/
│   │   ├── interactions.js # Botões e modais
│   │   └── webhook.js
│   └── utils/
│       ├── database.js     # Persistência JSON com flush assíncrono
│       ├── logger.js       # Logger + RateLimiter + formatters
│       ├── mercadopago.js  # Criar PIX, consultar status, reembolsar
│       ├── delivery.js     # Motor de entrega (key/download/role/manual)
│       ├── cart.js         # Lógica de carrinho e cupons
│       ├── embeds.js       # Embeds padronizados
│       └── time.js         # Utilitários de tempo
├── data/                   # JSON gerado automaticamente (gitignore)
├── logs/                   # Logs diários (gitignore)
├── .env.example
└── package.json
```

---

## 🗂️ Dados persistidos

| Arquivo | Conteúdo |
|---|---|
| `data/config.json` | Configurações da loja |
| `data/products.json` | Produtos cadastrados |
| `data/stock.json` | Itens em estoque por produto |
| `data/orders.json` | Todos os pedidos |
| `data/carts.json` | Carrinhos ativos |
| `data/coupons.json` | Cupons de desconto |
| `data/affiliates.json` | Afiliados e saldos |
| `data/history.json` | Histórico de compras por usuário |
| `data/reviews.json` | Avaliações de produtos |
| `data/wishlists.json` | Listas de desejos dos usuários |
| `data/blacklist.json` | Usuários bloqueados |
| `data/refund_requests.json` | Solicitações de reembolso |

> Adicione `data/` e `logs/` ao `.gitignore`.

---

## 📄 Licença

[MIT](LICENSE) © [Ghostzinn07](https://github.com/NGeff)