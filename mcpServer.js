import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { shopify } from './shopify.js';

export function createShopifyMcpServer() {
  const server = new Server(
    {
      name: 'shopify-zakdor-mcp',
      version: '2.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Define tools available to Claude
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        // ==========================================
        // 1. UNIVERSAL TOOLS (100% SHOPIFY CAPABILITY)
        // ==========================================
        {
          name: 'shopify_graphql_query',
          description: 'Execute ANY Shopify Admin GraphQL query or mutation. Unlocks 100% of Shopify GraphQL API (orders, products, files, metaobjects, fulfillments, checkouts, translations, etc.).',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The GraphQL query or mutation string',
              },
              variables: {
                type: 'object',
                description: 'Optional variables for the GraphQL query/mutation',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'shopify_rest_api',
          description: 'Execute ANY Shopify Admin REST API request (GET, POST, PUT, DELETE). Use this to reach any endpoint not directly covered by a convenience tool.',
          inputSchema: {
            type: 'object',
            properties: {
              method: {
                type: 'string',
                description: 'HTTP method: GET, POST, PUT, or DELETE',
                enum: ['GET', 'POST', 'PUT', 'DELETE'],
              },
              endpoint: {
                type: 'string',
                description: 'REST endpoint path, e.g. "orders.json", "custom_collections.json", "webhooks.json"',
              },
              params: {
                type: 'object',
                description: 'Optional URL query parameters (e.g. { limit: 10, status: "any" })',
              },
              body: {
                type: 'object',
                description: 'Optional JSON payload for POST/PUT requests',
              },
            },
            required: ['method', 'endpoint'],
          },
        },
        {
          name: 'ping_store',
          description: 'Test connectivity to the Shopify store and verify API token status.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },

        // Actual image content, not just a Shopify CDN URL.
        // Only images that belong to the supplied Shopify product are accepted.
        {
          name: 'get_product_image',
          description: 'Read an existing Shopify product image and return its actual JPEG/PNG/WebP bytes as MCP image content, enabling visual inspection of the original print and placement. Read-only. Requires the numeric product_id and image_id from get_product_by_id.',
          inputSchema: {
            type: 'object',
            properties: {
              product_id: {
                type: 'string',
                description: 'Numeric Shopify product ID from get_product_by_id',
              },
              image_id: {
                type: 'string',
                description: 'Numeric ID of one of that product\'s existing images',
              },
            },
            required: ['product_id', 'image_id'],
          },
        },

        // ==========================================
        // 2. THEMES & ASSETS (LIQUID, CSS, JSON)
        // ==========================================
        {
          name: 'list_themes',
          description: 'Fetch all themes installed in the Shopify store. Useful to find the active/main theme ID.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'list_theme_assets',
          description: 'List all asset filenames/keys in a given theme (e.g. layout/theme.liquid, templates/index.json, assets/base.css).',
          inputSchema: {
            type: 'object',
            properties: {
              theme_id: {
                type: 'string',
                description: 'The numeric Shopify Theme ID',
              },
            },
            required: ['theme_id'],
          },
        },
        {
          name: 'get_theme_asset',
          description: 'Get the file content and metadata of a specific theme asset (e.g. layout/theme.liquid, assets/style.css).',
          inputSchema: {
            type: 'object',
            properties: {
              theme_id: {
                type: 'string',
                description: 'The numeric Shopify Theme ID',
              },
              asset_key: {
                type: 'string',
                description: 'The asset file path/key (e.g. "layout/theme.liquid", "config/settings_data.json")',
              },
            },
            required: ['theme_id', 'asset_key'],
          },
        },
        {
          name: 'put_theme_asset',
          description: 'Create or update the text content of a theme asset file.',
          inputSchema: {
            type: 'object',
            properties: {
              theme_id: {
                type: 'string',
                description: 'The numeric Shopify Theme ID',
              },
              asset_key: {
                type: 'string',
                description: 'The asset file path/key (e.g. "layout/theme.liquid", "sections/custom-banner.liquid")',
              },
              value: {
                type: 'string',
                description: 'The string content to write to the asset file',
              },
            },
            required: ['theme_id', 'asset_key', 'value'],
          },
        },
        {
          name: 'delete_theme_asset',
          description: 'Delete an asset file from a theme.',
          inputSchema: {
            type: 'object',
            properties: {
              theme_id: {
                type: 'string',
                description: 'The numeric Shopify Theme ID',
              },
              asset_key: {
                type: 'string',
                description: 'The asset file path/key to delete',
              },
            },
            required: ['theme_id', 'asset_key'],
          },
        },

        // ==========================================
        // 3. PRODUCTS & COLLECTIONS
        // ==========================================
        {
          name: 'list_products',
          description: 'Fetch a list of products from the Shopify store with title, status, vendor, price, and variant inventory.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of products to return (default 10, max 50)',
              },
              title: {
                type: 'string',
                description: 'Optional filter by product title keywords',
              },
            },
          },
        },
        {
          name: 'get_product_by_id',
          description: 'Get complete details for a specific product by its Shopify Product ID.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'The numeric Shopify Product ID',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'create_product',
          description: 'Create a new product in the store.',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Product title' },
              body_html: { type: 'string', description: 'Product description HTML' },
              vendor: { type: 'string', description: 'Vendor name' },
              product_type: { type: 'string', description: 'Product type' },
              status: { type: 'string', enum: ['active', 'archived', 'draft'] },
              tags: { type: 'string', description: 'Comma separated tags' },
              variants: {
                type: 'array',
                description: 'List of product variants (price, sku, etc.)',
              },
            },
            required: ['title'],
          },
        },
        {
          name: 'update_product',
          description: 'Update an existing product by Product ID.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'The numeric Shopify Product ID' },
              title: { type: 'string', description: 'New product title' },
              body_html: { type: 'string', description: 'New description HTML' },
              status: { type: 'string', enum: ['active', 'archived', 'draft'] },
              tags: { type: 'string', description: 'Comma separated tags' },
            },
            required: ['id'],
          },
        },
        {
          name: 'delete_product',
          description: 'Delete a product from the store by Product ID.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'The numeric Shopify Product ID' },
            },
            required: ['id'],
          },
        },
        {
          name: 'list_collections',
          description: 'List custom and smart collections on the store.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Number of collections to return' },
            },
          },
        },

        // ==========================================
        // 4. ORDERS & DRAFT ORDERS
        // ==========================================
        {
          name: 'list_orders',
          description: 'Fetch store orders (supports filtering by status: "open", "closed", "cancelled", "any").',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['open', 'closed', 'cancelled', 'any'], description: 'Order status filter' },
              limit: { type: 'number', description: 'Max orders to return (default 10, max 50)' },
            },
          },
        },
        {
          name: 'get_order_by_id',
          description: 'Get full details of a specific order by Order ID.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'The numeric Shopify Order ID' },
            },
            required: ['id'],
          },
        },
        {
          name: 'list_draft_orders',
          description: 'Fetch list of draft orders.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Max draft orders to return' },
            },
          },
        },
        {
          name: 'create_draft_order',
          description: 'Create a draft order with line items, customer details, and pricing.',
          inputSchema: {
            type: 'object',
            properties: {
              line_items: {
                type: 'array',
                description: 'List of line items (title, price, quantity, etc.)',
              },
              customer: {
                type: 'object',
                description: 'Customer object with id or email',
              },
              note: { type: 'string', description: 'Note for draft order' },
            },
            required: ['line_items'],
          },
        },

        // ==========================================
        // 5. CUSTOMERS
        // ==========================================
        {
          name: 'list_customers',
          description: 'Search or list customers from the store.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query (name, email, etc.)' },
              limit: { type: 'number', description: 'Max customers to return' },
            },
          },
        },
        {
          name: 'get_customer_by_id',
          description: 'Get full profile and order history summary of a customer by Customer ID.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'The numeric Shopify Customer ID' },
            },
            required: ['id'],
          },
        },
        {
          name: 'create_customer',
          description: 'Create a new customer profile.',
          inputSchema: {
            type: 'object',
            properties: {
              first_name: { type: 'string' },
              last_name: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              tags: { type: 'string' },
            },
          },
        },
        {
          name: 'update_customer',
          description: 'Update customer details by Customer ID.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'The numeric Shopify Customer ID' },
              first_name: { type: 'string' },
              last_name: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              tags: { type: 'string' },
            },
            required: ['id'],
          },
        },

        // ==========================================
        // 6. INVENTORY & LOCATIONS
        // ==========================================
        {
          name: 'list_locations',
          description: 'Fetch store fulfillment locations/warehouses.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'list_inventory_levels',
          description: 'Get stock/inventory levels for specific locations or inventory items.',
          inputSchema: {
            type: 'object',
            properties: {
              location_ids: { type: 'string', description: 'Comma separated location IDs' },
              inventory_item_ids: { type: 'string', description: 'Comma separated inventory item IDs' },
            },
          },
        },
        {
          name: 'adjust_inventory_level',
          description: 'Adjust available stock level of an inventory item at a specific location.',
          inputSchema: {
            type: 'object',
            properties: {
              inventory_item_id: { type: 'string', description: 'Shopify Inventory Item ID' },
              location_id: { type: 'string', description: 'Shopify Location ID' },
              available_adjustment: { type: 'number', description: 'Amount to adjust (+5 to add, -2 to subtract)' },
            },
            required: ['inventory_item_id', 'location_id', 'available_adjustment'],
          },
        },

        // ==========================================
        // 7. PAGES & NAVIGATION
        // ==========================================
        {
          name: 'list_pages',
          description: 'List online store pages (About Us, Contact, Policies, etc.).',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Max pages to return' },
            },
          },
        },
        {
          name: 'get_page_by_id',
          description: 'Get full content and metadata of a page by Page ID.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'The numeric Shopify Page ID' },
            },
            required: ['id'],
          },
        },
        {
          name: 'create_or_update_page',
          description: 'Create a new online store page or update an existing one.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Optional Page ID if updating existing page' },
              title: { type: 'string', description: 'Page title' },
              body_html: { type: 'string', description: 'Page HTML body content' },
              handle: { type: 'string', description: 'URL slug handle' },
            },
            required: ['title'],
          },
        },

        // ==========================================
        // 8. DISCOUNTS & FILES
        // ==========================================
        {
          name: 'list_discounts',
          description: 'List store discount price rules and promo codes.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Max price rules to return' },
            },
          },
        },
        {
          name: 'list_files',
          description: 'List uploaded media files, images, and documents in Shopify Content / Files.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Max files to return (default 20, max 50)' },
            },
          },
        },
      ],
    };
  });

  // Handle tool calls from Claude
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      // 1. Universal Tools
      if (name === 'shopify_graphql_query') {
        if (!args.query) throw new Error('Parameter "query" is required');
        const res = await shopify.executeGraphQL({ query: args.query, variables: args.variables });
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }

      if (name === 'shopify_rest_api') {
        if (!args.method || !args.endpoint) throw new Error('"method" and "endpoint" are required');
        const res = await shopify.executeRest({
          method: args.method,
          endpoint: args.endpoint,
          params: args.params,
          body: args.body,
        });
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }

      if (name === 'ping_store') {
        const token = await shopify.getAccessToken();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'connected',
                  shop: shopify.shop,
                  token_preview: token ? `${token.substring(0, 10)}...` : null,
                  message: `Successfully authenticated with ${shopify.shop}.`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Read and return actual image pixels for visual verification of original artwork.
      if (name === 'get_product_image') {
        const productId = String(args.product_id || '').replace(/^gid:\/\/shopify\/Product\//, '');
        const imageId = String(args.image_id || '').replace(/^gid:\/\/shopify\/ProductImage\//, '');
        if (!/^\d+$/.test(productId) || !/^\d+$/.test(imageId)) {
          throw new Error('Numeric product_id and image_id are required');
        }

        // Look up the image on this product first; do not accept arbitrary URLs.
        const product = await shopify.getProductById(productId);
        const item = (product.images || []).find(img => String(img.id) === imageId);
        if (!item || !item.src) {
          throw new Error('Image not found on the requested Shopify product');
        }

        const url = new URL(item.src);
        if (url.protocol !== 'https:' || url.hostname !== 'cdn.shopify.com') {
          throw new Error('Shopify image source is not an approved CDN host');
        }

        const maxBytes = 5 * 1024 * 1024;
        const timeoutController = new AbortController();
        const timeout = setTimeout(() => timeoutController.abort(), 15000);

        try {
          // No redirects: prevents following a product-media URL to an unrelated host.
          const response = await fetch(url.toString(), {
            redirect: 'error',
            signal: timeoutController.signal,
            headers: { Accept: 'image/jpeg, image/png, image/webp' },
          });
          if (!response.ok) {
            throw new Error(`Shopify image download failed (${response.status})`);
          }

          const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
            throw new Error(`Unsupported product image format: ${mimeType || 'unknown'}`);
          }
          const declaredSize = Number(response.headers.get('content-length') || 0);
          if (declaredSize > maxBytes) {
            throw new Error('Product image exceeds the 5 MB visual inspection limit');
          }
          if (!response.body) {
            throw new Error('Product image response has no body');
          }

          // Stream with a hard byte cap even when Content-Length is missing.
          const reader = response.body.getReader();
          const chunks = [];
          let total = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) {
              await reader.cancel();
              throw new Error('Product image exceeds the 5 MB visual inspection limit');
            }
            chunks.push(Buffer.from(value));
          }
          if (total === 0) throw new Error('Product image is empty');

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  product_id: productId,
                  image_id: imageId,
                  original_filename: item.alt || null,
                  variant_ids: item.variant_ids || [],
                  width: item.width || null,
                  height: item.height || null,
                  note: 'Actual image content follows. Verify the original print visually before creating mockups.',
                }),
              },
              {
                type: 'image',
                data: Buffer.concat(chunks, total).toString('base64'),
                mimeType,
              },
            ],
          };
        } finally {
          clearTimeout(timeout);
        }
      }

      // 2. Themes & Assets
      if (name === 'list_themes') {
        const themes = await shopify.listThemes();
        return { content: [{ type: 'text', text: JSON.stringify(themes, null, 2) }] };
      }

      if (name === 'list_theme_assets') {
        if (!args.theme_id) throw new Error('Theme "theme_id" parameter is required');
        const assets = await shopify.listThemeAssets(args.theme_id);
        return { content: [{ type: 'text', text: JSON.stringify(assets, null, 2) }] };
      }

      if (name === 'get_theme_asset') {
        if (!args.theme_id || !args.asset_key) throw new Error('"theme_id" and "asset_key" are required');
        const asset = await shopify.getThemeAsset(args.theme_id, args.asset_key);
        return { content: [{ type: 'text', text: JSON.stringify(asset, null, 2) }] };
      }

      if (name === 'put_theme_asset') {
        if (!args.theme_id || !args.asset_key || args.value === undefined) {
          throw new Error('"theme_id", "asset_key", and "value" are required');
        }
        const asset = await shopify.putThemeAsset(args.theme_id, args.asset_key, args.value);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ status: 'success', asset_key: args.asset_key, asset }, null, 2),
            },
          ],
        };
      }

      if (name === 'delete_theme_asset') {
        if (!args.theme_id || !args.asset_key) throw new Error('"theme_id" and "asset_key" are required');
        const res = await shopify.deleteThemeAsset(args.theme_id, args.asset_key);
        return { content: [{ type: 'text', text: JSON.stringify({ status: 'deleted', res }, null, 2) }] };
      }

      // 3. Products & Collections
      if (name === 'list_products') {
        const products = await shopify.listProducts(args);
        return { content: [{ type: 'text', text: JSON.stringify(products, null, 2) }] };
      }

      if (name === 'get_product_by_id') {
        if (!args.id) throw new Error('Product "id" parameter is required');
        const product = await shopify.getProductById(args.id);
        return { content: [{ type: 'text', text: JSON.stringify(product, null, 2) }] };
      }

      if (name === 'create_product') {
        const res = await shopify.createProduct(args);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }

      if (name === 'update_product') {
        if (!args.id) throw new Error('Product "id" parameter is required');
        const { id, ...data } = args;
        const res = await shopify.updateProduct(id, data);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }

      if (name === 'delete_product') {
        if (!args.id) throw new Error('Product "id" parameter is required');
        const res = await shopify.deleteProduct(args.id);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }

      if (name === 'list_collections') {
        const collections = await shopify.listCollections(args);
        return { content: [{ type: 'text', text: JSON.stringify(collections, null, 2) }] };
      }

      // 4. Orders & Draft Orders
      if (name === 'list_orders') {
        const orders = await shopify.listOrders(args);
        return { content: [{ type: 'text', text: JSON.stringify(orders, null, 2) }] };
      }

      if (name === 'get_order_by_id') {
        if (!args.id) throw new Error('Order "id" parameter is required');
        const order = await shopify.getOrderById(args.id);
        return { content: [{ type: 'text', text: JSON.stringify(order, null, 2) }] };
      }

      if (name === 'list_draft_orders') {
        const draftOrders = await shopify.listDraftOrders(args);
        return { content: [{ type: 'text', text: JSON.stringify(draftOrders, null, 2) }] };
      }

      if (name === 'create_draft_order') {
        const res = await shopify.createDraftOrder(args);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }

      // 5. Customers
      if (name === 'list_customers') {
        const customers = await shopify.listCustomers(args);
        return { content: [{ type: 'text', text: JSON.stringify(customers, null, 2) }] };
      }

      if (name === 'get_customer_by_id') {
        if (!args.id) throw new Error('Customer "id" parameter is required');
        const customer = await shopify.getCustomerById(args.id);
        return { content: [{ type: 'text', text: JSON.stringify(customer, null, 2) }] };
      }

      if (name === 'create_customer') {
        const res = await shopify.createCustomer(args);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }

      if (name === 'update_customer') {
        if (!args.id) throw new Error('Customer "id" parameter is required');
        const { id, ...data } = args;
        const res = await shopify.updateCustomer(id, data);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }

      // 6. Inventory & Locations
      if (name === 'list_locations') {
        const locations = await shopify.listLocations();
        return { content: [{ type: 'text', text: JSON.stringify(locations, null, 2) }] };
      }

      if (name === 'list_inventory_levels') {
        const levels = await shopify.listInventoryLevels(args);
        return { content: [{ type: 'text', text: JSON.stringify(levels, null, 2) }] };
      }

      if (name === 'adjust_inventory_level') {
        const res = await shopify.adjustInventoryLevel(args);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }

      // 7. Pages & Navigation
      if (name === 'list_pages') {
        const pages = await shopify.listPages(args);
        return { content: [{ type: 'text', text: JSON.stringify(pages, null, 2) }] };
      }

      if (name === 'get_page_by_id') {
        if (!args.id) throw new Error('Page "id" parameter is required');
        const page = await shopify.getPageById(args.id);
        return { content: [{ type: 'text', text: JSON.stringify(page, null, 2) }] };
      }

      if (name === 'create_or_update_page') {
        const res = await shopify.createOrUpdatePage(args);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }

      // 8. Discounts & Files
      if (name === 'list_discounts') {
        const discounts = await shopify.listPriceRules(args);
        return { content: [{ type: 'text', text: JSON.stringify(discounts, null, 2) }] };
      }

      if (name === 'list_files') {
        const files = await shopify.listFiles(args);
        return { content: [{ type: 'text', text: JSON.stringify(files, null, 2) }] };
      }

      throw new Error(`Tool not found: ${name}`);
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error executing ${name}: ${err.message}`,
          },
        ],
      };
    }
  });

  return server;
}

