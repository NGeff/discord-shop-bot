# ShopBot

A complete store bot for Discord with PIX payments via Mercado Pago.

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord)](https://discord.js.org/)
[![Mercado Pago](https://img.shields.io/badge/Mercado%20Pago-PIX-009EE3?style=flat-square)](https://www.mercadopago.com.br)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Description

ShopBot turns any Discord server into a store. Users browse products, checkout with PIX, and receive digital goods automatically. Staff manage products, stock, coupons, affiliates, and orders from Discord. Order data is persisted to JSON files under `data/`.

## Features

### Payments
- PIX payments via Mercado Pago with QR Code and copy-paste code
- Automatic polling every 15 seconds to verify payment status (no webhook server required)
- Automatic order expiry for pending payments
- Refunds from the admin panel or on user request

### Inventory & Delivery

| Type | Description |
|------|-------------|
| `key` | License key / code delivered by DM |
| `download` | Download link delivered by DM |
| `role` | Discord role assigned automatically |
| `manual` | Staff notification for manual delivery |

- Batch stock import (paste keys, one per line)
- Low-stock alerts
- Stock history and adjustments

## Requirements

- Node.js >= 22
- A Discord Application with bot token
- Mercado Pago account with PIX credentials

## Installation

```bash
git clone https://github.com/NGeff/discord-shop-bot.git
cd discord-shop-bot
npm install
cp .env.example .env
```

Edit `.env`:

```env
BOT_TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here
OWNER_ID=your_discord_user_id_here

MP_ACCESS_TOKEN=your_mercado_pago_access_token

NODE_ENV=production
LOG_LEVEL=INFO
```

Start the bot:

```bash
npm start
```

## Usage

1. Invite the bot with `Send Messages`, `Manage Messages`, `Embed Links`, and `Read Message History` permissions.
2. Run `/config painel` to publish the store panel.
3. Run `/produto criar` to add your first product.
4. Run `/estoque adicionar-lote <id>` to add stock.

## Commands

### Users

| Command | Description |
|---------|-------------|
| `/loja` | Open the store |
| `/loja comprar <id>` | Buy a product |
| `/loja cupom <code>` | Apply a discount coupon |
| `/loja favoritos` | View your wishlist |
| `/loja historico` | View your order history |
| `/loja avaliar <id>` | Review a purchased product |

### Affiliate

| Command | Description |
|---------|-------------|
| `/afiliado ingressar` | Join the affiliate program |
| `/afiliado link` | Get your referral link |
| `/afiliado saldo` | Check your balance |
| `/afiliado saques` | Request a payout |

### Admin

| Command | Description |
|---------|-------------|
| `/produto criar` | Add a product |
| `/produto editar <id>` | Edit product details |
| `/produto deletar <id>` | Delete a product |
| `/estoque adicionar-lote <id>` | Add stock (one key per line) |
| `/estoque listar <id>` | View stock for a product |
| `/cupom criar` | Create a discount coupon |
| `/pedidos [status]` | View orders by status |
| `/config painel` | Publish the store panel |
| `/config canal <channel>` | Set the orders channel |

## Project Structure

```
discord-shop-bot/
├── .env.example
├── package.json
├── data/            # Auto-generated JSON data (gitignored)
├── logs/            # Daily logs (gitignored)
└── src/
    ├── index.js
    ├── commands/
    │   ├── admin.js
    │   └── shop.js
    ├── events/
    │   ├── interactionCreate.js
    │   └── ready.js
    ├── handlers/
    │   ├── interactions.js
    │   └── webhook.js
    └── utils/
        ├── cart.js
        ├── database.js
        ├── delivery.js
        ├── embeds.js
        ├── logger.js
        ├── mercadopago.js
        └── time.js
```

> Add `data/` and `logs/` to your `.gitignore`.

## License

MIT © NGeff
