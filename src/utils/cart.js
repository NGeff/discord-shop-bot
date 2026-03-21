export function createCart(userId) {
  return { userId, items: [], couponCode: null, discount: 0, total: 0, affiliateCode: null, updatedAt: new Date().toISOString() };
}

export function recalcCart(cart, products) {
  let subtotal = 0;
  for (const item of cart.items) {
    const p = products.find(x => x.id === item.productId);
    if (p) subtotal += p.price * item.qty;
  }
  cart.total = Math.max(0, Number((subtotal - (cart.discount || 0)).toFixed(2)));
  cart.updatedAt = new Date().toISOString();
  return cart;
}

export function addToCart(cart, product, qty, cfg) {
  if (!cfg.allowCart) {
    cart.items = [{ productId: product.id, qty: 1 }];
    return { success: true };
  }
  const existing = cart.items.find(i => i.productId === product.id);
  const newQty = (existing ? existing.qty : 0) + qty;
  const totalItems = cart.items.reduce((s, i) => s + i.qty, 0) - (existing ? existing.qty : 0) + newQty;
  if (totalItems > (cfg.maxCartItems || 10)) return { success: false, reason: `Limite de ${cfg.maxCartItems} itens por carrinho.` };
  if (existing) existing.qty = newQty;
  else cart.items.push({ productId: product.id, qty });
  return { success: true };
}

export function removeFromCart(cart, productId) {
  const idx = cart.items.findIndex(i => i.productId === productId);
  if (idx === -1) return false;
  cart.items.splice(idx, 1);
  return true;
}

export function applyCoupon(cart, coupon, subtotal) {
  if (!coupon) return { success: false, reason: 'Cupom não encontrado.' };
  const now = new Date();
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) return { success: false, reason: 'Cupom expirado.' };
  if (coupon.maxUses && coupon.uses >= coupon.maxUses) return { success: false, reason: 'Cupom esgotado.' };
  if (coupon.minValue && subtotal < coupon.minValue) return { success: false, reason: `Valor mínimo: R$ ${coupon.minValue.toFixed(2).replace('.', ',')}` };

  let discount = 0;
  if (coupon.type === 'percent') discount = Number((subtotal * coupon.value / 100).toFixed(2));
  else if (coupon.type === 'fixed') discount = Math.min(coupon.value, subtotal);

  cart.couponCode = coupon.code;
  cart.discount = discount;
  return { success: true, discount };
}

export function cartToOrderItems(cart, products) {
  return cart.items.map(item => {
    const p = products.find(x => x.id === item.productId);
    return { productId: item.productId, name: p?.name || '?', qty: item.qty, price: p?.price || 0 };
  });
}
