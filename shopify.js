import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveStoreConfig } from './storeConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

class ShopifyClient {
  constructor(storeSlot = null) {
    const config = resolveStoreConfig(process.env, storeSlot);
    this.storeSlot = config.slot;
    this.shop = config.shop;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.apiVersion = config.apiVersion;

    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }

  validateConfig() {
    const missing = [];
    if (!this.shop) missing.push('SHOPIFY_SHOP_DOMAIN (e.g. zakdor.myshopify.com)');
    if (!this.clientId) missing.push('SHOPIFY_CLIENT_ID');
    if (!this.clientSecret) missing.push('SHOPIFY_CLIENT_SECRET');

    if (missing.length > 0) {
      throw new Error(`Missing environment variables:\n- ${missing.join('\n- ')}\nCheck your .env file.`);
    }
  }

  /**
   * Get valid Shopify Admin Access Token using Client Credentials Grant.
   * Caches token until 5 minutes before expiry.
   */
  async getAccessToken() {
    this.validateConfig();

    const now = Date.now();
    // Return cached token if valid and not expiring in next 5 minutes
    if (this.cachedToken && this.tokenExpiresAt > now + 5 * 60 * 1000) {
      return this.cachedToken;
    }

    const tokenUrl = `https://${this.shop}/admin/oauth/access_token`;
    const payload = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'client_credentials',
    };

    console.log(`[Shopify] Requesting access token for ${this.shop}...`);

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.error_description || data.error || JSON.stringify(data);
      throw new Error(`Shopify Auth Failed (${response.status}): ${errorMsg}`);
    }

    if (!data.access_token) {
      throw new Error(`No access_token returned by Shopify: ${JSON.stringify(data)}`);
    }

    this.cachedToken = data.access_token;
    // expires_in is in seconds (typically 86399 = 24 hours)
    const expiresInMs = (data.expires_in || 86400) * 1000;
    this.tokenExpiresAt = now + expiresInMs;

    console.log(`[Shopify] Token obtained successfully! Active scope: "${data.scope}", expires in ${Math.round(expiresInMs / 3600000)}h`);
    return this.cachedToken;
  }

  /**
   * Fetch list of products from Zakdor store
   */
  async listProducts({ limit = 10, title = '' } = {}) {
    const token = await this.getAccessToken();

    const searchParams = new URLSearchParams();
    searchParams.set('limit', Math.min(Math.max(1, limit), 50).toString());
    if (title) searchParams.set('title', title);

    const url = `https://${this.shop}/admin/api/${this.apiVersion}/products.json?${searchParams.toString()}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to list products (${res.status}): ${errText}`);
    }

    const result = await res.json();
    const products = result.products || [];

    // Return clean, summarized product objects for LLM readability
    return products.map((p) => ({
      id: p.id,
      title: p.title,
      handle: p.handle,
      status: p.status,
      vendor: p.vendor,
      product_type: p.product_type,
      tags: p.tags,
      variants_count: p.variants?.length || 0,
      variants: (p.variants || []).map((v) => ({
        id: v.id,
        title: v.title,
        price: v.price,
        sku: v.sku,
        inventory_quantity: v.inventory_quantity,
      })),
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));
  }

  /**
   * Fetch a single product by ID
   */
  async getProductById(productId) {
    const token = await this.getAccessToken();
    const cleanId = String(productId).replace(/^gid:\/\/shopify\/Product\//, '');

    const url = `https://${this.shop}/admin/api/${this.apiVersion}/products/${cleanId}.json`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to get product ${cleanId} (${res.status}): ${errText}`);
    }

    const result = await res.json();
    return result.product;
  }

  /**
   * Fetch all themes from store
   */
  async listThemes() {
    const token = await this.getAccessToken();
    const url = `https://${this.shop}/admin/api/${this.apiVersion}/themes.json`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to list themes (${res.status}): ${errText}`);
    }

    const result = await res.json();
    return (result.themes || []).map((t) => ({
      id: t.id,
      name: t.name,
      role: t.role,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }));
  }

  /**
   * List all asset keys in a theme
   */
  async listThemeAssets(themeId) {
    const token = await this.getAccessToken();
    const cleanThemeId = String(themeId).replace(/^gid:\/\/shopify\/Theme\//, '');
    const url = `https://${this.shop}/admin/api/${this.apiVersion}/themes/${cleanThemeId}/assets.json`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to list theme assets (${res.status}): ${errText}`);
    }

    const result = await res.json();
    return result.assets || [];
  }

  /**
   * Get content of a specific theme asset file
   */
  async getThemeAsset(themeId, assetKey) {
    const token = await this.getAccessToken();
    const cleanThemeId = String(themeId).replace(/^gid:\/\/shopify\/Theme\//, '');
    const url = `https://${this.shop}/admin/api/${this.apiVersion}/themes/${cleanThemeId}/assets.json?asset[key]=${encodeURIComponent(assetKey)}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to get theme asset "${assetKey}" (${res.status}): ${errText}`);
    }

    const result = await res.json();
    return result.asset;
  }

  /**
   * Create or update a theme asset file
   */
  async putThemeAsset(themeId, assetKey, value) {
    const token = await this.getAccessToken();
    const cleanThemeId = String(themeId).replace(/^gid:\/\/shopify\/Theme\//, '');
    const url = `https://${this.shop}/admin/api/${this.apiVersion}/themes/${cleanThemeId}/assets.json`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset: {
          key: assetKey,
          value: value,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to update theme asset "${assetKey}" (${res.status}): ${errText}`);
    }

    const result = await res.json();
    return result.asset;
  }

  /**
   * Delete a theme asset file
   */
  async deleteThemeAsset(themeId, assetKey) {
    const token = await this.getAccessToken();
    const cleanThemeId = String(themeId).replace(/^gid:\/\/shopify\/Theme\//, '');
    const url = `https://${this.shop}/admin/api/${this.apiVersion}/themes/${cleanThemeId}/assets.json?asset[key]=${encodeURIComponent(assetKey)}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to delete theme asset "${assetKey}" (${res.status}): ${errText}`);
    }

    const result = await res.json();
    return result;
  }

  // ==========================================
  // UNIVERSAL API EXECUTORS (100% COVERAGE)
  // ==========================================

  /**
   * Execute any Shopify Admin GraphQL Query or Mutation
   */
  async executeGraphQL({ query, variables = {} }) {
    const token = await this.getAccessToken();
    const url = `https://${this.shop}/admin/api/${this.apiVersion}/graphql.json`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    const data = await res.json();
    if (data.errors && data.errors.length > 0) {
      throw new Error(`Shopify GraphQL Error: ${JSON.stringify(data.errors)}`);
    }
    return data;
  }

  /**
   * Execute any Shopify Admin REST API request (GET, POST, PUT, DELETE)
   */
  async executeRest({ method = 'GET', endpoint, params = {}, body = null }) {
    const token = await this.getAccessToken();
    const cleanEndpoint = endpoint.replace(/^\/+/, '').replace(/^admin\/api\/[^\/]+\//, '');
    const url = new URL(`https://${this.shop}/admin/api/${this.apiVersion}/${cleanEndpoint}`);

    if (params && typeof params === 'object') {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.set(k, String(v));
        }
      });
    }

    const options = {
      method: method.toUpperCase(),
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const res = await fetch(url.toString(), options);
    const text = await res.text();

    try {
      const json = JSON.parse(text);
      if (!res.ok) {
        throw new Error(`Shopify REST Error (${res.status}): ${JSON.stringify(json)}`);
      }
      return json;
    } catch (e) {
      if (!res.ok) {
        throw new Error(`Shopify REST Error (${res.status}): ${text}`);
      }
      return { response: text };
    }
  }

  // ==========================================
  // PRODUCTS & COLLECTIONS
  // ==========================================

  async createProduct(productData) {
    const body = productData.product ? productData : { product: productData };
    return await this.executeRest({ method: 'POST', endpoint: 'products.json', body });
  }

  async updateProduct(productId, productData) {
    const cleanId = String(productId).replace(/^gid:\/\/shopify\/Product\//, '');
    const body = productData.product ? productData : { product: productData };
    return await this.executeRest({ method: 'PUT', endpoint: `products/${cleanId}.json`, body });
  }

  async deleteProduct(productId) {
    const cleanId = String(productId).replace(/^gid:\/\/shopify\/Product\//, '');
    return await this.executeRest({ method: 'DELETE', endpoint: `products/${cleanId}.json` });
  }

  async listCollections({ limit = 20 } = {}) {
    const [customRes, smartRes] = await Promise.allSettled([
      this.executeRest({ method: 'GET', endpoint: 'custom_collections.json', params: { limit } }),
      this.executeRest({ method: 'GET', endpoint: 'smart_collections.json', params: { limit } }),
    ]);

    const custom = customRes.status === 'fulfilled' ? (customRes.value.custom_collections || []) : [];
    const smart = smartRes.status === 'fulfilled' ? (smartRes.value.smart_collections || []) : [];

    return [...custom, ...smart];
  }

  // ==========================================
  // ORDERS & DRAFT ORDERS
  // ==========================================

  async listOrders({ status = 'any', limit = 10 } = {}) {
    return await this.executeRest({
      method: 'GET',
      endpoint: 'orders.json',
      params: { status, limit: Math.min(Math.max(1, limit), 50) },
    });
  }

  async getOrderById(orderId) {
    const cleanId = String(orderId).replace(/^gid:\/\/shopify\/Order\//, '');
    return await this.executeRest({ method: 'GET', endpoint: `orders/${cleanId}.json` });
  }

  async listDraftOrders({ limit = 10 } = {}) {
    return await this.executeRest({
      method: 'GET',
      endpoint: 'draft_orders.json',
      params: { limit: Math.min(Math.max(1, limit), 50) },
    });
  }

  async createDraftOrder(draftOrderData) {
    const body = draftOrderData.draft_order ? draftOrderData : { draft_order: draftOrderData };
    return await this.executeRest({ method: 'POST', endpoint: 'draft_orders.json', body });
  }

  // ==========================================
  // CUSTOMERS
  // ==========================================

  async listCustomers({ limit = 10, query = '' } = {}) {
    return await this.executeRest({
      method: 'GET',
      endpoint: 'customers.json',
      params: { limit: Math.min(Math.max(1, limit), 50), query },
    });
  }

  async getCustomerById(customerId) {
    const cleanId = String(customerId).replace(/^gid:\/\/shopify\/Customer\//, '');
    return await this.executeRest({ method: 'GET', endpoint: `customers/${cleanId}.json` });
  }

  async createCustomer(customerData) {
    const body = customerData.customer ? customerData : { customer: customerData };
    return await this.executeRest({ method: 'POST', endpoint: 'customers.json', body });
  }

  async updateCustomer(customerId, customerData) {
    const cleanId = String(customerId).replace(/^gid:\/\/shopify\/Customer\//, '');
    const body = customerData.customer ? customerData : { customer: customerData };
    return await this.executeRest({ method: 'PUT', endpoint: `customers/${cleanId}.json`, body });
  }

  // ==========================================
  // INVENTORY & LOCATIONS
  // ==========================================

  async listLocations() {
    return await this.executeRest({ method: 'GET', endpoint: 'locations.json' });
  }

  async listInventoryLevels({ location_ids, inventory_item_ids } = {}) {
    const params = {};
    if (location_ids) params.location_ids = Array.isArray(location_ids) ? location_ids.join(',') : location_ids;
    if (inventory_item_ids) params.inventory_item_ids = Array.isArray(inventory_item_ids) ? inventory_item_ids.join(',') : inventory_item_ids;
    return await this.executeRest({ method: 'GET', endpoint: 'inventory_levels.json', params });
  }

  async adjustInventoryLevel({ inventory_item_id, location_id, available_adjustment }) {
    const body = {
      inventory_item_id,
      location_id,
      available_adjustment: Number(available_adjustment),
    };
    return await this.executeRest({ method: 'POST', endpoint: 'inventory_levels/adjust.json', body });
  }

  // ==========================================
  // PAGES & NAVIGATION
  // ==========================================

  async listPages({ limit = 20 } = {}) {
    return await this.executeRest({
      method: 'GET',
      endpoint: 'pages.json',
      params: { limit: Math.min(Math.max(1, limit), 50) },
    });
  }

  async getPageById(pageId) {
    const cleanId = String(pageId).replace(/^gid:\/\/shopify\/Page\//, '');
    return await this.executeRest({ method: 'GET', endpoint: `pages/${cleanId}.json` });
  }

  async createOrUpdatePage(pageData) {
    const body = pageData.page ? pageData : { page: pageData };
    if (body.page && body.page.id) {
      return await this.executeRest({ method: 'PUT', endpoint: `pages/${body.page.id}.json`, body });
    }
    return await this.executeRest({ method: 'POST', endpoint: 'pages.json', body });
  }

  // ==========================================
  // DISCOUNTS & PRICE RULES
  // ==========================================

  async listPriceRules({ limit = 20 } = {}) {
    return await this.executeRest({
      method: 'GET',
      endpoint: 'price_rules.json',
      params: { limit },
    });
  }

  // ==========================================
  // FILES (GRAPHQL)
  // ==========================================

  async listFiles({ limit = 20 } = {}) {
    const query = `
      query getFiles($first: Int!) {
        files(first: $first) {
          nodes {
            id
            createdAt
            updatedAt
            alt
            fileStatus
            ... on GenericFile {
              url
            }
            ... on MediaImage {
              image {
                url
                width
                height
              }
            }
            ... on Video {
              filename
            }
          }
        }
      }
    `;
    const res = await this.executeGraphQL({ query, variables: { first: Math.min(Math.max(1, limit), 50) } });
    return res.data?.files?.nodes || [];
  }
}

const clients = new Map();

export function getShopifyClient(storeSlot = null) {
  const slot = String(storeSlot || process.env.SHOPIFY_ACTIVE_STORE || '1').trim();
  if (!clients.has(slot)) {
    clients.set(slot, new ShopifyClient(slot));
  }
  return clients.get(slot);
}

export function getShopifyClients() {
  return ['1', '2'].map((slot) => getShopifyClient(slot));
}

// Backward-compatible default client for the server health endpoint.
export const shopify = getShopifyClient();


