const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Op } = require('sequelize');

// Exercise the real service with an isolated transactional store; no production DB access.
function setup() {
  const rows = [];
  let notices = 0;
  let queue = Promise.resolve();
  const match = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && value[Op.ne] !== undefined) return row[key] !== value[Op.ne];
    return row[key] === value;
  });
  const Order = {
    async findOne({ where, paranoid = true } = {}) {
      return [...rows].reverse().find(row => (!paranoid || !row.deletedAt) && match(row, where)) || null;
    },
    async count() { return rows.filter(row => row.status !== 'incomplete').length; },
    async create(values, options) {
      assert.ok(options.transaction, 'all order inserts must be transactional');
      const row = { Id: rows.length + 1, ...values, async update(next, options) {
        assert.ok(options.transaction, 'all checkout updates must be transactional');
        Object.assign(this, next); return this;
      }, toJSON() { const { update, toJSON, ...plain } = this; return plain; } };
      if (row.checkoutKey) assert.ok(!rows.some(r => r.checkoutKey === row.checkoutKey));
      rows.push(row); return row;
    },
  };
  const db = { order: Order, user: {}, orderWriteLock: { async findByPk(id, options) {
    assert.equal(options.lock, 'UPDATE'); return { Id: id };
  } }, sequelize: { transaction(work) {
    const result = queue.then(() => work({ LOCK: { UPDATE: 'UPDATE' } }));
    queue = result.catch(() => {}); return result;
  } } };
  const context = { module: { exports: {} }, console, process, setTimeout, require(name) {
    if (name === '../../../models') return db;
    if (name.includes('siteSetting.service')) return { getByType: async () => null, getPublic: async () => ({}) };
    if (name.includes('notification.service')) return { createForRoles: async () => { notices++; } };
    if (name.includes('couponCode.service')) return { validateCoupon: async () => { throw Error('expired coupon'); } };
    if (name === './orderPricing') return { priceOrderItems: async (payload) => payload };
    if (name === './orderStock') return { registerOrderStockHooks() {} };
    if (name === 'crypto' || name === 'sequelize') return require(name);
    if (name.includes('ApiError')) return class extends Error { constructor(code, message) { super(message); this.statusCode = code; } };
    return {};
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/modules/order/order.service'), 'utf8'), context);
  return { service: context.module.exports, rows, notices: () => notices };
}
const payload = (key = 'checkout_test_key_0001') => ({ checkoutKey: key, customerPhone: '01712345678', customerName: 'Customer', customerAddress: 'Dhaka', items: [{ id: 1, name: 'Product', qty: 1, price: 700 }], total: 700 });

test('phone-only autosaves create one incomplete order, confirmation promotes that row once', async () => {
  const { service, rows, notices } = setup();
  const draft = { ...payload(), customerName: '', customerAddress: '' };
  await Promise.all(Array.from({ length: 8 }, () => service.saveIncompleteOrderInDB(draft)));
  assert.equal(rows.length, 1); assert.equal(rows[0].status, 'incomplete'); assert.equal(notices(), 0);
  const orders = await Promise.all(Array.from({ length: 8 }, () => service.createOrderInDB(payload())));
  assert.equal(new Set(orders.map(o => o.Id)).size, 1);
  assert.equal(rows.length, 1); assert.equal(rows[0].status, 'pending'); assert.equal(notices(), 1);
});
test('simultaneous final submit and autosave cannot demote or duplicate an order', async () => {
  for (const finalFirst of [true, false]) {
    const { service, rows, notices } = setup();
    const final = () => service.createOrderInDB(payload());
    const draft = () => service.saveIncompleteOrderInDB(payload());
    await Promise.all((finalFirst ? [final, draft, final, draft] : [draft, final, draft, final]).map(fn => fn()));
    await service.saveIncompleteOrderInDB({ ...payload(), customerAddress: 'stale' });
    assert.equal(rows.length, 1); assert.equal(rows[0].status, 'pending');
    assert.equal(rows[0].customerArea, 'Dhaka'); assert.equal(notices(), 1);
  }
});
test('retry after success returns saved order even if coupon has expired', async () => {
  const { service, rows, notices } = setup();
  const first = await service.createOrderInDB(payload());
  const retry = await service.createOrderInDB({ ...payload(), couponCode: 'EXPIRED' });
  assert.equal(first.Id, retry.Id); assert.equal(rows.length, 1); assert.equal(notices(), 1);
});
test('same customer can intentionally start a new checkout', async () => {
  const { service, rows } = setup();
  await service.createOrderInDB(payload());
  await service.createOrderInDB(payload('checkout_test_key_0002'));
  assert.equal(rows.length, 2); assert.notEqual(rows[0].orderId, rows[1].orderId);
});
test('legacy draft ID cannot demote a completed order', async () => {
  const { service, rows } = setup();
  const data = { ...payload(), checkoutKey: undefined };
  const draft = await service.saveIncompleteOrderInDB(data);
  await service.createOrderInDB({ ...data, incompleteOrderId: draft.Id });
  await service.saveIncompleteOrderInDB({ ...data, incompleteOrderId: draft.Id });
  assert.equal(rows.length, 1); assert.equal(rows[0].status, 'pending');
});
test('deleted checkout and mismatched phone cannot create a replacement', async () => {
  const { service, rows } = setup();
  await service.createOrderInDB(payload());
  await assert.rejects(service.createOrderInDB({ ...payload(), customerPhone: '01812345678' }), /phone does not match/);
  rows[0].deletedAt = new Date();
  await assert.rejects(service.createOrderInDB(payload()), /deleted/);
  assert.equal(rows.length, 1);
});
test('different concurrent checkouts receive distinct invoices', async () => {
  const { service, rows } = setup();
  await Promise.all(Array.from({ length: 8 }, (_, i) => service.createOrderInDB(payload(`checkout_parallel_${i}`))));
  assert.equal(rows.length, 8);
  assert.equal(new Set(rows.map(row => row.orderId)).size, 8);
});
test('malformed checkout keys are rejected before any write', async () => {
  const { service, rows } = setup();
  await assert.rejects(service.createOrderInDB(payload('bad')), /Invalid checkout key/);
  await assert.rejects(service.saveIncompleteOrderInDB(payload('bad')), /Invalid checkout key/);
  assert.equal(rows.length, 0);
});
