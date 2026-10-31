/* Address state stays in memory. It is never part of localStorage/cart data. */
(function(angular) {
    'use strict';
    angular.module('robotshop').factory('checkoutState', function() {
        var state = { address: null, cartKey: null };
        function text(value, min, max) {
            return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max && !/[<>\x00-\x1f\x7f]/.test(value);
        }
        state.validAddress = function(a) {
            return !!a && /^[a-z]{2}$/.test(a.countryCode) && text(a.country, 1, 100) &&
                text(a.city, 1, 100) && Number.isSafeInteger(a.cityId) && a.cityId > 0 && a.cityId <= 1e12 &&
                text(a.street, 3, 160) && text(a.flat, 1, 40) && text(a.postalCode || '', 0, 20);
        };
        state.key = function(cart) {
            if (!cart || !Array.isArray(cart.items)) return '';
            // Ignore Angular's $$hashKey and serialize only actual order fields.
            return JSON.stringify({total: cart.total, tax: cart.tax, items: cart.items.map(function(item) {
                return {sku: item.sku, name: item.name, qty: item.qty, price: item.price, subtotal: item.subtotal};
            })});
        };
        state.ready = function(cart) {
            return state.validAddress(state.address) && state.cartKey === state.key(cart) &&
                cart && cart.items && cart.items.some(function(item) { return item.sku === 'SHIP'; });
        };
        state.clear = function() { state.address = null; state.cartKey = null; };
        return state;
    });
}(window.angular));
