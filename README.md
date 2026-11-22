# Shopify MCP Server for Claude (Zakdor Store)

Ye MCP (Model Context Protocol) Server Claude ko aapke Shopify Store (**Zakdor**) se connect karta hai, jisse Claude store ke products ko read aur analyze kar sake.

---

## 📁 Project Structure

- `shopify.js`: Shopify API Client (Token auto-generation & caching, `listProducts`, `getProductById`)
- `mcpServer.js`: MCP tools definition (`list_products`, `get_product_by_id`, `ping_store`)
- `server.js`: HTTP/SSE Server (Claude Developer / Remote HTTPS connection ke liye)
- `stdio-server.js`: Stdio Server (Claude Desktop App ke liye)
- `test-shopify.js`: Credentials aur Shopify connection verify karne ka instant script
- `.env`: Aapke API credentials (Client ID, Client Secret, Store Domain)

---

## 🚀 Step-by-Step Setup Guide

### 1. Dev Dashboard mein Scopes verify karein
1. Shopify Partners / Dev Dashboard kholiye (`partners.shopify.com`).
2. **Apps** > **Claude MCP** par jaiye.
3. Left sidebar mein **Versions** kholiye aur active version par click karein.
4. Scopes mein verify karein ki sirf **`read_products`** enabled ho (unnecessary permissions jaise payments, customers, write_* hata dein).
5. Version **Release** karein.
6. **Settings / API Credentials** se **Client ID** aur **Client Secret** copy karein.

---

### 2. `.env` file mein credentials bharein
File open karein: `C:\Users\shahi\.gemini\antigravity\scratch\shopify-mcp-server\.env`
```env
SHOPIFY_SHOP_DOMAIN=zakdor.myshopify.com
SHOPIFY_CLIENT_ID=aapka_client_id_yahan
SHOPIFY_CLIENT_SECRET=aapka_client_secret_yahan
SHOPIFY_API_VERSION=2025-01
PORT=3000
```

---

### 3. Server ko pehle alag test karein (Without Claude)
Terminal / Command Prompt mein ye command chalayein:
```bash
node test-shopify.js
```
Agar credentials sahi hain, to ye Zakdor store ke products fetch karke terminal par print kar dega! 🎉

---

### 4. Server Run karein

#### Option A: Claude Developer / Claude.ai (Web) ke liye
1. Server start karein:
   ```bash
   node server.js
   ```
2. Public HTTPS endpoint banayein (Cloudflare Tunnel ya ngrok se):
   ```bash
   npx localtunnel --port 3000
   ```
   Aapko ek HTTPS URL milega (jaise `https://brave-frog-42.loca.lt`).
   Aapka MCP Endpoint hoga:
   ```
   https://brave-frog-42.loca.lt/sse
   ```

3. **Claude Developer / Integrations** mein jakar:
   - MCP Server URL mein wahi HTTPS URL (`https://.../sse`) paste karein.

#### Option B: Claude Desktop App ke liye (Local)
Agar aap Windows par Claude Desktop app use kar rahe hain, to bina kisi hosting ke local connect kar sakte hain:
`%APPDATA%\Claude\claude_desktop_config.json` mein add karein:
```json
{
  "mcpServers": {
    "shopify-zakdor": {
      "command": "node",
      "args": [
        "C:\\Users\\shahi\\.gemini\\antigravity\\scratch\\shopify-mcp-server\\stdio-server.js"
      ]
    }
  }
}
```

---

### 5. Claude se Test karein
Claude mein connect hone ke baad simply puchiye:
> *"Zakdor ke kuch products dikhao"* ya *"Store mein active products kaunse hain?"*
Claude automatically `list_products` tool call karega aur products showcase karega!
