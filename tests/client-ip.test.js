const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getClientIp, isInternalServerRequest } = require('../app/utils/clientIp');

process.env.PROXY_SECRET = 'secret';
const req = (headers, ip = '10.0.0.1') => ({ headers, ip });

test('trusts X-Client-IP only with the shared secret', () => {
  assert.equal(getClientIp(req({ 'x-proxy-secret': 'secret', 'x-client-ip': '203.0.113.7' })), '203.0.113.7');
  assert.equal(getClientIp(req({ 'x-proxy-secret': 'wrong', 'x-client-ip': '203.0.113.7' })), '10.0.0.1');
  assert.equal(getClientIp(req({ 'x-client-ip': '203.0.113.7' })), '10.0.0.1');
});

test('ignores a forged X-Forwarded-For and invalid client IPs', () => {
  assert.equal(getClientIp(req({ 'x-forwarded-for': '6.6.6.6' })), '10.0.0.1');
  assert.equal(getClientIp(req({ 'x-proxy-secret': 'secret', 'x-client-ip': 'not-an-ip' })), '10.0.0.1');
  assert.equal(getClientIp(req({}, '::ffff:192.0.2.1')), '192.0.2.1');
});

test('server-side calls carry the secret without a client IP', () => {
  assert.equal(isInternalServerRequest(req({ 'x-proxy-secret': 'secret' })), true);
  assert.equal(isInternalServerRequest(req({ 'x-proxy-secret': 'secret', 'x-client-ip': '203.0.113.7' })), false);
  assert.equal(isInternalServerRequest(req({ 'x-proxy-secret': 'wrong' })), false);
});
