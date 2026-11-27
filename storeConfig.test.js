import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStoreConfig } from './storeConfig.js';

const first = { SHOPIFY_SHOP_DOMAIN: 'old.myshopify.com', SHOPIFY_CLIENT_ID: 'old-id', SHOPIFY_CLIENT_SECRET: 'test-old-secret' };
const second = suffix => ({ ['SHOPIFY_SHOP_DOMAIN' + suffix]: 'new.myshopify.com', ['SHOPIFY_CLIENT_ID' + suffix]: 'new-id', ['SHOPIFY_CLIENT_SECRET' + suffix]: 'test-new-secret' });
test('existing store stays selected by default even when store 2 exists', () => {
  assert.equal(resolveStoreConfig({ ...first, ...second('_2') }).shop, 'old.myshopify.com');
});
for (const suffix of ['2', '_2']) {
  test(`store 2 selects the whole ${suffix} credential set`, () => {
    const config = resolveStoreConfig({ ...first, ...second(suffix), SHOPIFY_ACTIVE_STORE: '2' });
    assert.deepEqual([config.shop, config.clientId, config.clientSecret], ['new.myshopify.com', 'new-id', 'test-new-secret']);
  });
}
test('missing store 2 secret never falls back to store 1 secret', () => {
  assert.throws(() => resolveStoreConfig({ ...first, SHOPIFY_ACTIVE_STORE: '2', SHOPIFY_SHOP_DOMAIN2: 'new.myshopify.com', SHOPIFY_CLIENT_ID2: 'new-id' }), /Missing: SHOPIFY_CLIENT_SECRET2/);
});
test('mixed suffixes are rejected instead of combining credentials', () => {
  assert.throws(() => resolveStoreConfig({ SHOPIFY_ACTIVE_STORE: '2', SHOPIFY_SHOP_DOMAIN2: 'new.myshopify.com', SHOPIFY_CLIENT_ID_2: 'new-id', SHOPIFY_CLIENT_SECRET_2: 'test-new-secret' }), /configuration incomplete/);
});
test('conflicting complete store 2 groups are rejected without disclosing values', () => {
  assert.throws(() => resolveStoreConfig({ ...second('2'), ...second('_2'), SHOPIFY_CLIENT_SECRET2: 'different-test-secret', SHOPIFY_ACTIVE_STORE: '2' }), /^Error: Conflicting store 2 credential sets/);
});
test('normalizes hostname and rejects paths and unsupported store selectors', () => {
  assert.equal(resolveStoreConfig({ ...first, SHOPIFY_SHOP_DOMAIN: ' https://OLD.myshopify.com/ ' }).shop, 'old.myshopify.com');
  assert.throws(() => resolveStoreConfig({ ...first, SHOPIFY_SHOP_DOMAIN: 'old.myshopify.com/admin' }), /Invalid/);
  assert.throws(() => resolveStoreConfig({ ...first, SHOPIFY_ACTIVE_STORE: '3' }), /must be 1 or 2/);
});
