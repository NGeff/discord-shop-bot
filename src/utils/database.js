import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '../..');
const DATA_DIR = join(ROOT_DIR, 'data');

function readJSON(file) {
  try {
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {}
  return null;
}

function writeJSON(file, data) {
  try {
    writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error(`Erro ao salvar ${file}:`, e.message);
  }
}

export class Database {
  constructor() {
    this.files = {
      config:         join(DATA_DIR, 'config.json'),
      products:       join(DATA_DIR, 'products.json'),
      orders:         join(DATA_DIR, 'orders.json'),
      carts:          join(DATA_DIR, 'carts.json'),
      coupons:        join(DATA_DIR, 'coupons.json'),
      affiliates:     join(DATA_DIR, 'affiliates.json'),
      history:        join(DATA_DIR, 'history.json'),
      stock:          join(DATA_DIR, 'stock.json'),
      reviews:        join(DATA_DIR, 'reviews.json'),
      wishlists:      join(DATA_DIR, 'wishlists.json'),
      blacklist:      join(DATA_DIR, 'blacklist.json'),
      refundRequests: join(DATA_DIR, 'refund_requests.json'),
    };
    this._data = {};
    this._dirty = new Set();
  }

  ensureDirectories() {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  }

  load() {
    for (const [key, file] of Object.entries(this.files)) {
      this._data[key] = readJSON(file) ?? this._defaults(key);
    }
    this._startFlush();
  }

  _defaults(key) {
    const d = {
      config: {
        guildId: null,
        shopName: 'Minha Loja',
        shopDescription: 'Bem-vindo à nossa loja!',
        shopEmoji: '🛒',
        shopColor: 0x2ECC71,
        shopBanner: null,
        shopThumbnail: null,
        categories: [],
        logChannelId: null,
        salesChannelId: null,
        refundChannelId: null,
        staffRoles: [],
        adminRoles: [],
        currency: 'BRL',
        currencySymbol: 'R$',
        allowCart: true,
        maxCartItems: 10,
        orderExpireMinutes: 30,
        affiliateCommissionPercent: 5,
        requireEmailOnPurchase: false,
        maintenanceMode: false,
        welcomeDM: true,
        shopChannelId: null,
        lowStockThreshold: 5,
        lowStockAlerts: true,
        allowReviews: true,
        requirePurchaseToReview: true,
        blacklistEnabled: true,
      },
      products:       {},
      orders:         {},
      carts:          {},
      coupons:        {},
      affiliates:     {},
      history:        {},
      stock:          {},
      reviews:        {},
      wishlists:      {},
      blacklist:      [],
      refundRequests: {},
    };
    return d[key] ?? {};
  }

  _startFlush() {
    setInterval(() => {
      for (const key of this._dirty) {
        writeJSON(this.files[key], this._data[key]);
      }
      this._dirty.clear();
    }, 2000);
  }

  get(key) { return this._data[key]; }
  set(key, data) { this._data[key] = data; this._dirty.add(key); }
  patch(key, partial) { this._data[key] = { ...this._data[key], ...partial }; this._dirty.add(key); }

  flush() {
    for (const [key, file] of Object.entries(this.files)) {
      writeJSON(file, this._data[key]);
    }
    this._dirty.clear();
  }

  getConfig() { return this._data.config; }
  setConfig(data) { this.set('config', data); }
  patchConfig(p) { this.patch('config', p); }

  getProduct(id) { return this._data.products[id] || null; }
  getAllProducts() { return Object.values(this._data.products); }
  saveProduct(p) { this._data.products[p.id] = p; this._dirty.add('products'); }
  deleteProduct(id) {
    delete this._data.products[id];
    delete this._data.stock[id];
    delete this._data.reviews[id];
    this._dirty.add('products');
    this._dirty.add('stock');
    this._dirty.add('reviews');
  }

  getStockItems(pid) { return this._data.stock[pid] || []; }
  addStockItem(pid, item) {
    if (!this._data.stock[pid]) this._data.stock[pid] = [];
    this._data.stock[pid].push(item);
    this._dirty.add('stock');
  }
  addStockBulk(pid, items) {
    if (!this._data.stock[pid]) this._data.stock[pid] = [];
    this._data.stock[pid].push(...items);
    this._dirty.add('stock');
  }
  popStockItem(pid) {
    if (!this._data.stock[pid] || !this._data.stock[pid].length) return null;
    const item = this._data.stock[pid].shift();
    this._dirty.add('stock');
    return item;
  }
  stockCount(pid) { return (this._data.stock[pid] || []).length; }

  getOrder(id) { return this._data.orders[id] || null; }
  getAllOrders() { return Object.values(this._data.orders); }
  getOrdersByUser(uid) { return this.getAllOrders().filter(o => o.userId === uid); }
  saveOrder(o) { this._data.orders[o.id] = o; this._dirty.add('orders'); }

  getCart(uid) { return this._data.carts[uid] || null; }
  saveCart(uid, cart) { this._data.carts[uid] = cart; this._dirty.add('carts'); }
  deleteCart(uid) { delete this._data.carts[uid]; this._dirty.add('carts'); }

  getCoupon(code) { return this._data.coupons[code.toUpperCase()] || null; }
  getAllCoupons() { return Object.values(this._data.coupons); }
  saveCoupon(c) { this._data.coupons[c.code.toUpperCase()] = c; this._dirty.add('coupons'); }
  deleteCoupon(code) { delete this._data.coupons[code.toUpperCase()]; this._dirty.add('coupons'); }

  getAffiliate(uid) { return this._data.affiliates[uid] || null; }
  getAllAffiliates() { return Object.values(this._data.affiliates); }
  saveAffiliate(a) { this._data.affiliates[a.userId] = a; this._dirty.add('affiliates'); }

  getUserHistory(uid) { return this._data.history[uid] || []; }
  addHistory(uid, entry) {
    if (!this._data.history[uid]) this._data.history[uid] = [];
    this._data.history[uid].unshift(entry);
    this._dirty.add('history');
  }

  getProductReviews(pid) { return this._data.reviews[pid] || []; }
  getAllReviews() {
    const all = [];
    for (const reviews of Object.values(this._data.reviews)) all.push(...reviews);
    return all;
  }
  addReview(pid, review) {
    if (!this._data.reviews[pid]) this._data.reviews[pid] = [];
    const existing = this._data.reviews[pid].findIndex(r => r.userId === review.userId);
    if (existing >= 0) this._data.reviews[pid][existing] = review;
    else this._data.reviews[pid].push(review);
    this._dirty.add('reviews');
  }
  deleteReview(pid, userId) {
    if (!this._data.reviews[pid]) return;
    this._data.reviews[pid] = this._data.reviews[pid].filter(r => r.userId !== userId);
    this._dirty.add('reviews');
  }
  getProductRating(pid) {
    const reviews = this.getProductReviews(pid);
    if (!reviews.length) return null;
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    return { avg: Number(avg.toFixed(1)), count: reviews.length };
  }

  getWishlist(uid) { return this._data.wishlists[uid] || []; }
  addToWishlist(uid, pid) {
    if (!this._data.wishlists[uid]) this._data.wishlists[uid] = [];
    if (!this._data.wishlists[uid].includes(pid)) {
      this._data.wishlists[uid].push(pid);
      this._dirty.add('wishlists');
    }
  }
  removeFromWishlist(uid, pid) {
    if (!this._data.wishlists[uid]) return;
    this._data.wishlists[uid] = this._data.wishlists[uid].filter(id => id !== pid);
    this._dirty.add('wishlists');
  }

  isBlacklisted(uid) { return (this._data.blacklist || []).includes(uid); }
  addBlacklist(uid) {
    if (!this._data.blacklist) this._data.blacklist = [];
    if (!this._data.blacklist.includes(uid)) {
      this._data.blacklist.push(uid);
      this._dirty.add('blacklist');
    }
  }
  removeBlacklist(uid) {
    this._data.blacklist = (this._data.blacklist || []).filter(id => id !== uid);
    this._dirty.add('blacklist');
  }

  getRefundRequest(id) { return this._data.refundRequests[id] || null; }
  getAllRefundRequests() { return Object.values(this._data.refundRequests); }
  saveRefundRequest(r) { this._data.refundRequests[r.id] = r; this._dirty.add('refundRequests'); }
  deleteRefundRequest(id) { delete this._data.refundRequests[id]; this._dirty.add('refundRequests'); }
  getPendingRefundByOrder(orderId) {
    return Object.values(this._data.refundRequests).find(r => r.orderId === orderId && r.status === 'pending') || null;
  }

  getStats() {
    const orders = this.getAllOrders();
    const now = Date.now();
    const today = new Date().setHours(0, 0, 0, 0);
    const weekAgo = now - 7 * 86400000;
    const monthAgo = now - 30 * 86400000;

    const paid = orders.filter(o => ['paid', 'delivered'].includes(o.status));
    const revenue = (orders) => orders.reduce((s, o) => s + (o.total || 0), 0);

    return {
      totalOrders: orders.length,
      totalRevenue: revenue(paid),
      todayOrders: paid.filter(o => new Date(o.createdAt).getTime() >= today).length,
      todayRevenue: revenue(paid.filter(o => new Date(o.createdAt).getTime() >= today)),
      weekRevenue: revenue(paid.filter(o => new Date(o.createdAt).getTime() >= weekAgo)),
      monthRevenue: revenue(paid.filter(o => new Date(o.createdAt).getTime() >= monthAgo)),
      pendingOrders: orders.filter(o => o.status === 'pending').length,
      cancelledOrders: orders.filter(o => o.status === 'cancelled' || o.status === 'expired').length,
      totalProducts: this.getAllProducts().length,
      activeProducts: this.getAllProducts().filter(p => p.active !== false).length,
      totalAffiliates: this.getAllAffiliates().length,
      totalCoupons: this.getAllCoupons().length,
    };
  }

  getTopProducts(limit = 5) {
    const orders = this.getAllOrders().filter(o => ['paid', 'delivered'].includes(o.status));
    const counts = {};
    const revenue = {};
    for (const order of orders) {
      for (const item of order.items) {
        counts[item.productId] = (counts[item.productId] || 0) + item.qty;
        revenue[item.productId] = (revenue[item.productId] || 0) + item.price * item.qty;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([pid, qty]) => ({ product: this.getProduct(pid), qty, revenue: revenue[pid] || 0 }))
      .filter(e => e.product);
  }

  userHasPurchased(uid, pid) {
    const history = this.getUserHistory(uid);
    return history.some(e => e.items && e.items.some(i =>
      (typeof i === 'string' ? i : i.productId || i) === pid
    ));
  }

  generateOrderId() {
    const count = Object.keys(this._data.orders).length + 1;
    return `PED-${String(count).padStart(6, '0')}`;
  }

  generateRefundId() {
    const count = Object.keys(this._data.refundRequests).length + 1;
    return `REF-${String(count).padStart(6, '0')}`;
  }
}
