const KEYS = ['SHOPIFY_SHOP_DOMAIN', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET'];
export const STORE_SLOTS = ['1', '2'];

// Select a complete credential set. Never mix credentials between stores.
export function resolveStoreConfig(env = process.env, requestedSlot = null) {
  const slot = String(requestedSlot || env.SHOPIFY_ACTIVE_STORE || '1').trim();
  if (!STORE_SLOTS.includes(slot)) throw new Error('Store selector must be 1 or 2');
  const suffixes = slot === '1' ? [''] : ['_2', '2'];
  const groups = suffixes.map(suffix => ({
    suffix,
    values: KEYS.map(key => String(env[key + suffix] || '').trim()),
  }));
  const complete = groups.filter(group => group.values.every(Boolean));
  if (complete.length > 1 && JSON.stringify(complete[0].values) !== JSON.stringify(complete[1].values)) {
    throw new Error('Conflicting store 2 credential sets: use only one suffix convention (_2 or 2)');
  }
  const group = complete[0] || groups.find(group => group.values.some(Boolean)) || groups[0];
  const missing = KEYS.filter((key, i) => !group.values[i]).map(key => key + group.suffix);
  if (missing.length) throw new Error(`Store ${slot} configuration incomplete. Missing: ${missing.join(', ')}`);
  const shop = group.values[0].replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw new Error(`Invalid SHOPIFY_SHOP_DOMAIN${group.suffix}: use a myshopify.com hostname`);
  }
  return { slot, shop, clientId: group.values[1], clientSecret: group.values[2], apiVersion: String(env.SHOPIFY_API_VERSION || '2025-01').trim() };
}

