/* Display conversion only. Catalogue, cart payloads and demo orders remain EUR. */
(function(root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.RobotShopCurrency = api;
}(typeof window !== 'undefined' ? window : globalThis, function() {
    'use strict';
    var regions = Object.freeze([
        Object.freeze({ id: 'EURO', label: 'Euro area · EUR', currency: 'EUR', locale: 'en-IE' }),
        Object.freeze({ id: 'IN', label: 'India · INR', currency: 'INR', locale: 'en-IN' }),
        Object.freeze({ id: 'US', label: 'United States · USD', currency: 'USD', locale: 'en-US' }),
        Object.freeze({ id: 'GB', label: 'United Kingdom · GBP', currency: 'GBP', locale: 'en-GB' })
    ]);
    var formatters = Object.create(null);
    var storageKey = 'robotshop_region';

    function regionFor(id) {
        return regions.find(function(region) { return region.id === id; }) || regions[0];
    }
    function currencyRegion(code) {
        var region = regions.find(function(item) { return item.currency === code; });
        if (!region) throw new Error('Unsupported currency');
        return region;
    }
    function readPreference(storage) {
        try {
            var raw = storage.getItem(storageKey);
            if (!raw || raw.length > 128) return 'EURO';
            var saved = JSON.parse(raw);
            return saved && saved.version === 1 ? regionFor(saved.region).id : 'EURO';
        } catch (error) { return 'EURO'; }
    }
    function savePreference(storage, id) {
        if (regionFor(id).id !== id) return false;
        try {
            storage.setItem(storageKey, JSON.stringify({ version: 1, region: id }));
            return true;
        } catch (error) { return false; }
    }
    // Decimal strings become integer ratios; binary float multiplication is not used.
    function decimalRatio(value) {
        if (typeof value !== 'number' && typeof value !== 'string') throw new Error('Invalid amount');
        var text = String(value);
        if (text.length > 48) throw new Error('Amount too long');
        var match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d{1,2}))?$/i.exec(text);
        if (!match || !Number.isFinite(Number(text)) || Number(text) > 1e9) throw new Error('Invalid amount');
        var fraction = match[2] || '';
        var exponent = Number(match[3] || 0);
        if (Math.abs(exponent) > 24 || fraction.length > 24) throw new Error('Invalid precision');
        var scale = fraction.length - exponent;
        var numerator = BigInt(match[1] + fraction);
        return scale >= 0 ? [numerator, 10n ** BigInt(scale)] : [numerator * 10n ** BigInt(-scale), 1n];
    }
    function validateSnapshot(input, now) {
        if (!input || input.schemaVersion !== 1 || input.baseCurrency !== 'EUR' || input.source !== 'ECB') throw new Error('Invalid rate snapshot');
        if (typeof input.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.asOf)) throw new Error('Invalid rate date');
        var date = Date.parse(input.asOf + 'T00:00:00Z');
        var current = now === undefined ? Date.now() : now;
        if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== input.asOf || date > current) throw new Error('Invalid rate date');
        var rates = Object.create(null);
        regions.forEach(function(region) {
            var value = input.rates && Object.prototype.hasOwnProperty.call(input.rates, region.currency) && input.rates[region.currency];
            if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,3})(?:\.\d{1,8})?$/.test(value) || Number(value) <= 0) throw new Error('Invalid rate');
            rates[region.currency] = value;
        });
        if (Number(rates.EUR) !== 1) throw new Error('EUR rate must be one');
        return Object.freeze({ asOf: input.asOf, timestamp: date, rates: Object.freeze(rates) });
    }
    function toMinor(euroAmount, code, snapshot) {
        currencyRegion(code);
        var amount = decimalRatio(euroAmount);
        if (code !== 'EUR' && !snapshot) throw new Error('Rates unavailable');
        var rate = decimalRatio(code === 'EUR' ? '1' : snapshot.rates[code]);
        var numerator = amount[0] * rate[0] * 100n;
        var denominator = amount[1] * rate[1];
        var result = (numerator * 2n + denominator) / (denominator * 2n); // HALF_UP
        if (result > 1000000000000n) throw new Error('Amount exceeds display limit');
        return Number(result);
    }
    function format(euroAmount, code, snapshot) {
        try {
            var region = currencyRegion(code);
            if (!formatters[code]) formatters[code] = new Intl.NumberFormat(region.locale, {
                style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2
            });
            return formatters[code].format(toMinor(euroAmount, code, snapshot) / 100);
        } catch (error) { return '—'; }
    }
    return Object.freeze({ regions: regions, storageKey: storageKey, regionFor: regionFor,
        readPreference: readPreference, savePreference: savePreference,
        validateSnapshot: validateSnapshot, toMinor: toMinor, format: format });
}));
