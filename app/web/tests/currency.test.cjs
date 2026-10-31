const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const money = require('../static/js/currency.js');
const input = { schemaVersion: 1, baseCurrency: 'EUR', source: 'ECB', asOf: '2026-10-29',
    rates: { EUR: '1', INR: '90', USD: '1.1', GBP: '0.85' } };
const now = Date.parse('2026-10-30T12:00:00Z');
const snapshot = money.validateSnapshot(input, now);
const copy = () => JSON.parse(JSON.stringify(input));

test('EUR identity works without a rate file and zero is not missing', () => {
    assert.equal(money.toMinor(67, 'EUR'), 6700);
    assert.equal(money.toMinor(0, 'EUR'), 0);
    assert.equal(money.format(0, 'EUR'), '€0.00');
});
test('known product values convert from EUR without mutating products', () => {
    const product = Object.freeze({ sku: 'STAN-1', price: 67 });
    assert.equal(money.toMinor(product.price, 'INR', snapshot), 603000);
    assert.equal(money.toMinor(product.price, 'USD', snapshot), 7370);
    assert.equal(money.toMinor(product.price, 'GBP', snapshot), 5695);
    assert.equal(money.toMinor(product.price, 'EUR', snapshot), 6700);
    assert.equal(product.price, 67);
});
test('decimal HALF_UP rounds ties and floating-point edge cases correctly', () => {
    assert.equal(money.toMinor('1.005', 'EUR'), 101);
    assert.equal(money.toMinor('2.675', 'EUR'), 268);
    assert.equal(money.toMinor('0.0049', 'EUR'), 0);
    assert.equal(money.toMinor('0.005', 'EUR'), 1);
    assert.equal(money.toMinor(1e-7, 'EUR'), 0);
    assert.equal(money.toMinor(11.166666666666664, 'INR', snapshot), 100500);
});
test('localized output uses grouping and explicit currency choices', () => {
    assert.equal(money.format(2001, 'INR', snapshot), '₹1,80,090.00');
    assert.equal(money.format(67, 'GBP', snapshot), '£56.95');
    assert.equal(money.format(67, 'USD', snapshot), '$73.70');
    assert.equal(money.format(67, 'EUR', snapshot), '€67.00');
});
test('invalid, negative, huge, and executable-like values never become prices', () => {
    for (const value of [null, undefined, true, {}, [], -1, NaN, Infinity, '1abc', '1e99', '1e-99', '<script>', 1e10]) {
        assert.throws(() => money.toMinor(value, 'EUR'));
        assert.equal(money.format(value, 'EUR'), '—');
    }
    assert.throws(() => money.toMinor(1e9, 'INR', snapshot));
    assert.equal(money.format(67, '__proto__', snapshot), '—');
    assert.equal(money.format(67, 'INR'), '—');
});
test('snapshot is atomic: reject missing, malformed, nonpositive and excessive rates', () => {
    for (const value of [null, 90, '-1', '0', 'NaN', 'Infinity', '1e2', '10000', '0.123456789']) {
        const data=copy(); data.rates.INR=value;
        assert.throws(() => money.validateSnapshot(data, now));
    }
    const absent=copy(); delete absent.rates.GBP;
    assert.throws(() => money.validateSnapshot(absent, now));
    const otherBase=copy(); otherBase.baseCurrency='USD';
    assert.throws(() => money.validateSnapshot(otherBase, now));
    const wrongEuro=copy(); wrongEuro.rates.EUR='2';
    assert.throws(() => money.validateSnapshot(wrongEuro, now));
});
test('snapshot rejects impossible/future dates and ignores untrusted extra fields', () => {
    for (const date of ['2026-02-30','2026-13-01','2099-01-01','<img>']) {
        const data=copy(); data.asOf=date;
        assert.throws(() => money.validateSnapshot(data, now));
    }
    const extra=copy(); extra.rates.XYZ='100'; extra.url='https://example.invalid';
    const valid=money.validateSnapshot(extra,now);
    assert.deepEqual(Object.keys(valid.rates).sort(),['EUR','GBP','INR','USD']);
    assert.equal(valid.url,undefined);
    assert.ok(Object.isFrozen(valid.rates));
});
test('only allowlisted, versioned region preferences are accepted', () => {
    for (const saved of ['{', '{}', 'null', 'x'.repeat(129), JSON.stringify({version:2,region:'IN'}), JSON.stringify({version:1,region:'__proto__'})]) {
        assert.equal(money.readPreference({getItem:()=>saved}),'EURO');
    }
    assert.equal(money.readPreference(null),'EURO');
    assert.equal(money.readPreference({getItem:()=>{throw new Error('blocked');}}),'EURO');
    assert.equal(money.readPreference({getItem:()=>JSON.stringify({version:1,region:'IN',rates:{INR:'999'}})}),'IN');
});
test('persistence writes only a valid region and never fails the shopping page', () => {
    let written;
    assert.equal(money.savePreference({setItem:(key,value)=>written=[key,JSON.parse(value)]},'GB'),true);
    assert.deepEqual(written,['robotshop_region',{version:1,region:'GB'}]);
    assert.equal(money.savePreference(null,'IN'),false);
    assert.equal(money.savePreference({setItem:()=>{throw new Error('quota');}},'US'),false);
    assert.equal(money.savePreference({setItem:()=>assert.fail('must not write')},'<img>'),false);
});
test('checked-in production snapshot validates independently of current date', () => {
    const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../static/data/currency-rates.json')));
    const actual=money.validateSnapshot(data,Date.parse(data.asOf+'T23:59:59Z'));
    for (const region of money.regions) assert.ok(money.toMinor(67,region.currency,actual)>0);
});

function browserAdapter(saved, blockedStorage=false) {
    let entry;
    const root={}; const requests=[]; const writes=[];
    const storage={getItem:()=>saved,setItem:(key,value)=>writes.push([key,value])};
    const win={RobotShopCurrency:money,angular:{module:()=>({run:definition=>entry=definition.at(-1)})}};
    Object.defineProperty(win,'localStorage',{get:()=>{if(blockedStorage) throw new Error('blocked'); return storage;}});
    const http={get:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/js/region.js'),'utf8'),{window:win});
    entry(root,http,win);
    const settle=()=>new Promise(resolve=>setImmediate(resolve));
    return {root,requests,writes,settle};
}
test('browser restores a region, converts when rates load, and never changes EUR checkout', async () => {
    const b=browserAdapter(JSON.stringify({version:1,region:'IN'}));
    b.root.regionState.options[0].$$hashKey = 'angular-test';
    assert.equal(money.regions[0].$$hashKey, undefined);
    assert.equal(b.root.money(67),'…');
    assert.equal(b.root.money(67,'EUR'),'€67.00');
    assert.equal(b.requests[0].url,'/data/currency-rates.json');
    assert.equal(b.requests[0].options.timeout,8000);
    b.requests[0].resolve({data:input}); await b.settle();
    assert.equal(b.root.money(67),'₹6,030.00');
    b.root.regionState.selectedId='US'; b.root.changeRegion();
    assert.equal(b.root.money(67),'$73.70');
    assert.equal(b.root.money(67,'EUR'),'€67.00');
    assert.equal(b.requests.length,1);
});
test('failed or invalid rates visibly fall back to EUR and a retry restores preference', async () => {
    const b=browserAdapter(JSON.stringify({version:1,region:'IN'}));
    b.requests[0].resolve({data:'<html>not a rate file</html>'}); await b.settle();
    assert.equal(b.root.regionState.failed,true);
    assert.equal(b.root.regionState.current.currency,'EUR');
    assert.equal(b.root.money(67),'€67.00');
    b.root.retryCurrencyRates();
    b.requests[1].resolve({data:input}); await b.settle();
    assert.equal(b.root.regionState.failed,false);
    assert.equal(b.root.money(67),'₹6,030.00');
});
test('network failure, repeated retry and unavailable storage do not break region selection', async () => {
    const b=browserAdapter(null,true);
    b.root.retryCurrencyRates(); assert.equal(b.requests.length,1);
    b.requests[0].reject(new Error('network')); await b.settle();
    assert.equal(b.root.regionState.failed,true);
    b.root.retryCurrencyRates(); b.requests[1].resolve({data:input}); await b.settle();
    b.root.regionState.selectedId='IN'; b.root.changeRegion();
    assert.equal(b.root.money(67),'₹6,030.00');
    assert.equal(b.root.regionState.storageUnavailable,true);
});
test('old rates are labelled stale and an invalid region cannot change the currency', async () => {
    const b=browserAdapter(null);
    const old=copy(); old.asOf='2000-01-01';
    b.requests[0].resolve({data:old}); await b.settle();
    assert.equal(b.root.regionState.stale,true);
    b.root.regionState.selectedId='<script>'; b.root.changeRegion();
    assert.equal(b.root.regionState.current.currency,'EUR');
});
