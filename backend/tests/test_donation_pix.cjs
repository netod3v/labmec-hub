// Run with: node backend/tests/test_donation_pix.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({window:{}, TextEncoder});
vm.runInContext(fs.readFileSync('assets/qrcodegen.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('assets/donation-pix.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export function /g, 'function '), context);
const config = {key:'4a557275-68e4-4b1b-95b8-f1f58416937c',name:'Pedro Alexandrino Furtado Pereira Neto',city:'Bras\u00edlia'};
const parse = text => {
  const fields = {};
  for (let offset = 0; offset < text.length;) {
    const id = text.slice(offset, offset+2), length = Number(text.slice(offset+2, offset+4));
    assert.ok(Number.isInteger(length) && length > 0);
    fields[id] = text.slice(offset+4, offset+4+length);
    assert.equal(fields[id].length, length);
    offset += 4 + length;
  }
  return fields;
};
assert.equal(context.crc16('123456789'), '29B1'); // CRC-16/CCITT-FALSE check vector
for (const [amount, expected] of [['0,01','0.01'],['5','5.00'],['12,34','12.34'],['50.99','50.99']]) {
  const payload = context.createPixPayload(config, amount), data = parse(payload);
  assert.equal(data['54'], expected);
  assert.equal(data['53'], '986');
  assert.equal(data['58'], 'BR');
  assert.equal(data['59'], 'PEDRO ALEXANDRINO FURTADO');
  assert.equal(data['60'], 'BRASILIA');
  assert.equal(parse(data['26'])['01'], config.key);
  assert.equal(parse(data['62'])['05'], '***');
  assert.equal(data['63'], context.crc16(payload.slice(0,-4)));
  const qr = context.window.labiomecQr.QrCode.encodeText(payload, context.window.labiomecQr.QrCode.Ecc.MEDIUM);
  assert.ok(qr.size >= 21 && qr.size <= 177);
  assert.equal(qr.getModule(0,0), true);
}
for (const amount of ['0','-1','1.001','1e3','NaN','','1,000.00','999999999999']) assert.throws(() => context.createPixPayload(config, amount));
assert.throws(() => context.createPixPayload({...config,key:'invalid'}, '10'));
console.log('Pix: CRC, beneficiary, amount validation, TLV fields and QR generation passed.');
