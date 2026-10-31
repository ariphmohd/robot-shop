/* A shared display preference; never changes API request amounts or identity. */
(function(angular, currency) {
    'use strict';
    angular.module('robotshop').run(['$rootScope', '$http', '$window', function($rootScope, $http, $window) {
        var storage;
        try { storage = $window.localStorage; } catch (error) { storage = null; }
        var preferredId = currency.readPreference(storage);
        var snapshot = null;
        var state = $rootScope.regionState = {
            // AngularJS ngOptions annotates objects with $$hashKey; give it view copies.
            options: currency.regions.map(function(region) { return { id: region.id, label: region.label }; }), selectedId: preferredId,
            current: currency.regionFor(preferredId), loading: true,
            available: false, failed: false, stale: false, asOf: '', storageUnavailable: false
        };
        $rootScope.money = function(value, fixedCurrency) {
            var code = fixedCurrency || state.current.currency;
            if (state.loading && code !== 'EUR') return '…';
            return currency.format(value, code, snapshot);
        };
        $rootScope.changeRegion = function() {
            var selected = currency.regionFor(state.selectedId);
            if (!state.available && selected.currency !== 'EUR') selected = currency.regionFor('EURO');
            state.current = selected;
            state.selectedId = selected.id;
            preferredId = selected.id;
            state.storageUnavailable = !currency.savePreference(storage, selected.id);
        };
        $rootScope.retryCurrencyRates = function() {
            if (state.loading && state.requestStarted) return;
            state.loading = true;
            state.requestStarted = true;
            state.failed = false;
            // Same-origin bundled data; no browser request to an exchange-rate provider.
            return $http.get('/data/currency-rates.json', { cache: false, timeout: 8000 }).then(function(response) {
                snapshot = currency.validateSnapshot(response.data);
                state.available = true;
                state.asOf = snapshot.asOf;
                state.stale = Date.now() - snapshot.timestamp > 7 * 24 * 60 * 60 * 1000;
                state.current = currency.regionFor(preferredId);
                state.selectedId = state.current.id;
            }).catch(function() {
                snapshot = null;
                state.available = false;
                state.failed = true;
                state.current = currency.regionFor('EURO');
                state.selectedId = 'EURO';
            }).finally(function() { state.loading = false; });
        };
        $rootScope.retryCurrencyRates();
    }]);
}(window.angular, window.RobotShopCurrency));
