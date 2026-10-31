(function(angular) {
    'use strict';

    var robotshop = angular.module('robotshop', ['ngRoute']);

    // =========================================================================
    // 1. Session & User State (Persistent in localStorage)
    // =========================================================================
    robotshop.factory('currentUser', ['$window', function($window) {
        var storageKey = 'robotshop_session';
        var data = {
            uniqueid: '',
            user: {},
            cart: {
                total: 0,
                items: []
            }
        };

        try {
            var saved = $window.localStorage.getItem(storageKey);
            if (saved) {
                var parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') {
                    data.uniqueid = parsed.uniqueid || '';
                    data.user = parsed.user || {};
                    data.cart = parsed.cart || { total: 0, items: [] };
                }
            }
        } catch (e) {
            console.warn('Could not read session from localStorage', e);
        }

        data.save = function() {
            try {
                $window.localStorage.setItem(storageKey, JSON.stringify({
                    uniqueid: data.uniqueid,
                    user: data.user,
                    cart: data.cart
                }));
            } catch (e) {
                console.warn('Could not write session to localStorage', e);
            }
        };

        data.logout = function() {
            data.user = {};
            data.uniqueid = '';
            data.cart = { total: 0, items: [] };
            try {
                $window.localStorage.removeItem(storageKey);
            } catch (e) {
                console.warn('Could not clear session from localStorage', e);
            }
        };

        return data;
    }]);

    // =========================================================================
    // 2. Application Routes Configuration
    // =========================================================================
    robotshop.config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
        $routeProvider.when('/', {
            templateUrl: 'splash.html',
            controller: 'shopform'
        }).when('/search/:text', {
            templateUrl: 'search.html',
            controller: 'searchform'
        }).when('/search', {
            templateUrl: 'search.html',
            controller: 'searchform'
        }).when('/product/:sku', {
            templateUrl: 'product.html',
            controller: 'productform'
        }).when('/login', {
            templateUrl: 'login.html',
            controller: 'loginform'
        }).when('/cart', {
            templateUrl: 'cart.html',
            controller: 'cartform'
        }).when('/shipping', {
            templateUrl: 'shipping.html',
            controller: 'shipform'
        }).when('/payment', {
            templateUrl: 'payment.html',
            controller: 'paymentform'
        }).otherwise({
            redirectTo: '/'
        });

        $locationProvider.html5Mode(true);
    }]);

    // =========================================================================
    // 3. Application Run: Theme, Wishlist, Compare & Global Helpers
    // =========================================================================
    robotshop.run(['$rootScope', '$window', '$templateCache', '$http', function($rootScope, $window, $templateCache, $http) {
        $rootScope.$on('$viewContentLoaded', function() {
            $templateCache.removeAll();
        });

        // Instana EUM Integration
        $rootScope.$on('$routeChangeSuccess', function(event, next, current) {
            if (typeof ineum !== 'undefined' && next && next.loadedTemplateUrl) {
                ineum('page', next.loadedTemplateUrl);
            }
        });

        // ---------------------------------------------------------------------
        // Theme Management: Light / Dark / System
        // ---------------------------------------------------------------------
        var themeKey = 'robotshop_theme';
        var savedTheme = 'dark';
        try {
            savedTheme = $window.localStorage.getItem(themeKey) || 'dark';
        } catch (e) {}

        $rootScope.currentTheme = savedTheme;
        $rootScope.themeMenuOpen = false;

        function applyEffectiveTheme() {
            var isDark = false;
            if ($rootScope.currentTheme === 'dark') {
                isDark = true;
            } else if ($rootScope.currentTheme === 'light') {
                isDark = false;
            } else {
                if ($window.matchMedia && $window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    isDark = true;
                }
            }
            $rootScope.effectiveTheme = isDark ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', $rootScope.effectiveTheme);
        }

        applyEffectiveTheme();

        if ($window.matchMedia) {
            var mediaQuery = $window.matchMedia('(prefers-color-scheme: dark)');
            if (mediaQuery.addEventListener) {
                mediaQuery.addEventListener('change', function() {
                    if ($rootScope.currentTheme === 'system') {
                        $rootScope.$apply(function() {
                            applyEffectiveTheme();
                        });
                    }
                });
            }
        }

        $rootScope.toggleThemeMenu = function() {
            $rootScope.themeMenuOpen = !$rootScope.themeMenuOpen;
        };

        $rootScope.setTheme = function(themeName) {
            $rootScope.currentTheme = themeName;
            $rootScope.themeMenuOpen = false;
            try {
                $window.localStorage.setItem(themeKey, themeName);
            } catch (e) {}
            applyEffectiveTheme();
        };

        // ---------------------------------------------------------------------
        // Wishlist System (localStorage persistence)
        // ---------------------------------------------------------------------
        var wishlistKey = 'robotshop_wishlist';
        $rootScope.wishlist = [];
        try {
            var savedWish = $window.localStorage.getItem(wishlistKey);
            if (savedWish) {
                $rootScope.wishlist = JSON.parse(savedWish) || [];
            }
        } catch (e) {
            $rootScope.wishlist = [];
        }

        $rootScope.saveWishlist = function() {
            try {
                $window.localStorage.setItem(wishlistKey, JSON.stringify($rootScope.wishlist));
            } catch (e) {}
        };

        $rootScope.isInWishlist = function(sku) {
            if (!sku || !$rootScope.wishlist) return false;
            return $rootScope.wishlist.some(function(item) {
                return (typeof item === 'string' ? item : item.sku) === sku;
            });
        };

        $rootScope.toggleWishlist = function(prod, event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
            if (!prod || !prod.sku) return;
            var idx = -1;
            for (var i = 0; i < $rootScope.wishlist.length; i++) {
                var itemSku = typeof $rootScope.wishlist[i] === 'string' ? $rootScope.wishlist[i] : $rootScope.wishlist[i].sku;
                if (itemSku === prod.sku) {
                    idx = i;
                    break;
                }
            }

            if (idx !== -1) {
                $rootScope.wishlist.splice(idx, 1);
            } else {
                $rootScope.wishlist.push({
                    sku: prod.sku,
                    name: prod.name,
                    price: prod.price,
                    description: prod.description,
                    instock: prod.instock
                });
            }
            $rootScope.saveWishlist();
        };

        // ---------------------------------------------------------------------
        // Product Comparison System (up to 4 items)
        // ---------------------------------------------------------------------
        var compareKey = 'robotshop_compare';
        $rootScope.compareList = [];
        $rootScope.showCompareModal = false;

        try {
            var savedComp = $window.localStorage.getItem(compareKey);
            if (savedComp) {
                $rootScope.compareList = JSON.parse(savedComp) || [];
            }
        } catch (e) {
            $rootScope.compareList = [];
        }

        $rootScope.saveCompare = function() {
            try {
                $window.localStorage.setItem(compareKey, JSON.stringify($rootScope.compareList));
            } catch (e) {}
        };

        $rootScope.isCompared = function(sku) {
            if (!sku || !$rootScope.compareList) return false;
            return $rootScope.compareList.some(function(item) {
                return item.sku === sku;
            });
        };

        $rootScope.toggleCompare = function(prod, event) {
            if (event) {
                event.stopPropagation();
            }
            if (!prod || !prod.sku) return;
            var idx = -1;
            for (var i = 0; i < $rootScope.compareList.length; i++) {
                if ($rootScope.compareList[i].sku === prod.sku) {
                    idx = i;
                    break;
                }
            }

            if (idx !== -1) {
                $rootScope.compareList.splice(idx, 1);
            } else {
                if ($rootScope.compareList.length >= 4) {
                    alert('You can compare a maximum of 4 robots side-by-side.');
                    return;
                }
                $rootScope.compareList.push(prod);
            }
            $rootScope.saveCompare();
        };

        $rootScope.removeFromCompare = function(sku) {
            $rootScope.compareList = $rootScope.compareList.filter(function(p) {
                return p.sku !== sku;
            });
            $rootScope.saveCompare();
            if ($rootScope.compareList.length === 0) {
                $rootScope.showCompareModal = false;
            }
        };

        $rootScope.clearCompare = function() {
            $rootScope.compareList = [];
            $rootScope.saveCompare();
            $rootScope.showCompareModal = false;
        };

        $rootScope.openCompareModal = function() {
            if ($rootScope.compareList.length > 0) {
                $rootScope.showCompareModal = true;
            }
        };

        $rootScope.closeCompareModal = function() {
            $rootScope.showCompareModal = false;
        };

        // ---------------------------------------------------------------------
        // Specifications Mapping Dictionary for Comparison & PDP
        // ---------------------------------------------------------------------
        $rootScope.getSpecs = function(sku) {
            var specsMap = {
                'Watson': { processor: 'Neural Matrix V8 (120 TOPS)', battery: '48V Solid-State Li-Ion (36h)', payload: '15 kg Precision Manipulator', rating: 'IP65 Laboratory Clean', connectivity: '5G Mesh + LEO Satellite', warranty: '24 Months On-site' },
                'Ewooid': { processor: 'Cognitive Core Dual-64', battery: 'Inductive Resonant (24h)', payload: '5 kg Interactive Grip', rating: 'IP54 Clinical/Office', connectivity: 'Wi-Fi 6E + UWB', warranty: '24 Months Replacement' },
                'HPTD': { processor: 'Hardened Astro-Nav ASIC', battery: 'Auxiliary Thermoelectric', payload: '80 kg High-Torque Base', rating: 'Space Radiation-Hardened', connectivity: 'Deep-Space Microwave RF', warranty: '36 Months Mission' },
                'UHJ': { processor: 'Multispectral Harvest-Core', battery: 'High-Density 96V Pack (40h)', payload: '850 kg Heavy Ag-Bin', rating: 'IP68 Mud/Submersible', connectivity: 'Direct Telemetry Mesh', warranty: '24 Months Heavy-Duty' },
                'EPE': { processor: 'Quantum Probe Emulation', battery: '12h Internal / DC Bus', payload: 'Modular Signal Penetrator', rating: 'EMI Shielded Class IV', connectivity: 'CAN / High-Speed Optical', warranty: '24 Months Enterprise' },
                'EMM': { processor: 'Sub-Millimeter Tremor-Null CPU', battery: 'Triple-Redundant Battery', payload: 'Sterile Micro-Arm (0.5kg)', rating: 'Class 100 Cleanroom', connectivity: 'Optically Isolated Fiber', warranty: '24 Months Clinical' },
                'SHCE': { processor: 'Multi-Lingual Protocol Matrix', battery: '24h Lithium Polymer', payload: '10 kg Diplomatic Assistance', rating: 'IP52 Executive Finish', connectivity: 'Encrypted Cellular + BLE', warranty: '24 Months Global' },
                'RED': { processor: 'Threat Assessment DSP Array', battery: '72h Tactical Dual-Cell', payload: '200 kg Patrol Chassis', rating: 'IP67 Ballistic Composite', connectivity: 'Encrypted Military-Band', warranty: '24 Months Field' },
                'RMC': { processor: 'Subterranean Inertial Guidance', battery: 'Hydraulic Induction Pack', payload: '1,200 kg Bore & Minerals', rating: 'ATEX Zone 0 Underground', connectivity: 'VLF Through-Rock Radio', warranty: '24 Months Heavy-Duty' },
                'STAN-1': { processor: 'Observability Metric Core', battery: 'Continuous Cloud Powered', payload: 'Distributed Trace Engine', rating: 'Universal Cloud Native', connectivity: 'Distributed Cloud Mesh', warranty: 'Lifetime Observability' },
                'CNA': { processor: 'Atmospheric Scrubber Controller', battery: 'Electrostatic Ionizer Cell', payload: '30 kg HEPA/Carbon Core', rating: 'Hermetic Spacecraft Grade', connectivity: 'Cabin Bus Telemetry', warranty: '24 Months Air-Quality' }
            };
            return specsMap[sku] || { processor: 'Autonomous Edge CPU', battery: '24h Li-Ion Pack', payload: '25 kg Universal Load', rating: 'IP65 Certified', connectivity: '5G Cloud Telemetry', warranty: '24 Months Manufacturer' };
        };

        // Global Cart Helpers
        $rootScope.getCartCount = function(cart) {
            if (!cart || !cart.items || !Array.isArray(cart.items)) return 0;
            var count = 0;
            for (var i = 0; i < cart.items.length; i++) {
                if (cart.items[i].sku !== 'SHIP') {
                    count += (cart.items[i].qty || 1);
                }
            }
            return count;
        };

        // Close dropdowns on outside click
        angular.element($window).on('click', function(e) {
            // AngularJS jqLite has no closest(); use the native DOM element.
            var target = e.target && (e.target.nodeType === 1 ? e.target : e.target.parentElement);
            if (!target || typeof target.closest !== 'function') return;
            if (!target.closest('.theme-switch-container')) {
                if ($rootScope.themeMenuOpen) {
                    $rootScope.$apply(function() {
                        $rootScope.themeMenuOpen = false;
                    });
                }
            }
            if (!target.closest('.search-container')) {
                if ($rootScope.showSearchSuggest) {
                    $rootScope.$apply(function() {
                        $rootScope.showSearchSuggest = false;
                    });
                }
            }
        });

        // Smooth Scroll to Top helper for footer
        $rootScope.scrollToTop = function() {
            $window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        $rootScope.cartDrawerOpen = false;
        $rootScope.openCartDrawer = function() { $rootScope.cartDrawerOpen = true; };
        $rootScope.closeCartDrawer = function() { $rootScope.cartDrawerOpen = false; };
    }]);

    // =========================================================================
    // 4. Shopform Controller (Homepage & Global Marketplace)
    // =========================================================================
    robotshop.controller('shopform', ['$scope', '$rootScope', '$http', '$location', '$interval', 'currentUser', function($scope, $rootScope, $http, $location, $interval, currentUser) {
        $scope.data = {};
        $scope.data.uniqueid = currentUser.uniqueid || '';
        $scope.data.user = currentUser.user || {};
        $scope.data.categories = [];
        $scope.data.products = {};
        $scope.data.allProducts = [];
        $scope.data.searchText = '';
        $scope.data.cart = currentUser.cart || { total: 0, items: [] };

        $scope.selectedCategory = 'All';
        $scope.categoryFilter = function() { return true; };
        $scope.searchSuggestions = [];
        $rootScope.showSearchSuggest = false;

        // ---------------------------------------------------------------------
        // Flipkart-style Promotional Carousel State
        // ---------------------------------------------------------------------
        $scope.currentSlide = 0;
        $scope.slides = [
            {
                badge: '⚡ FLAGSHIP COGNITIVE AI',
                title: 'Watson Autonomous Droid',
                subtitle: 'Engineered with Neural Matrix V8, 120 TOPS inference, and 36-hour solid-state power. The gold standard in cognitive research.',
                price: '€2,001.00',
                sku: 'Watson',
                image: '/images/Watson.png',
                offer: 'Special Launch Offer &bull; Free Express Delivery',
                link: '/product/Watson'
            },
            {
                badge: '🌾 HEAVY-DUTY INDUSTRIAL',
                title: 'UHJ Multispectral Harvester',
                subtitle: 'Built for demanding terrain with an 850kg payload bin, IP68 submersion sealing, and automated multispectral crop gathering.',
                price: '€5,000.00',
                sku: 'UHJ',
                image: '/images/UHJ.png',
                offer: 'Guaranteed 24-Month Heavy Duty Warranty',
                link: '/product/UHJ'
            },
            {
                badge: '🏥 PRECISION SURGICAL DROID',
                title: 'EMM Cleanroom Assistant',
                subtitle: 'Sub-millimeter tremor cancellation, optically isolated fiber data link, and Class 100 sterile cleanroom certification.',
                price: '€1,024.00',
                sku: 'EMM',
                image: '/images/EMM.png',
                offer: 'Clinical Leasing Options Available',
                link: '/product/EMM'
            }
        ];

        $scope.nextSlide = function() {
            $scope.currentSlide = ($scope.currentSlide + 1) % $scope.slides.length;
        };

        $scope.prevSlide = function() {
            $scope.currentSlide = ($scope.currentSlide - 1 + $scope.slides.length) % $scope.slides.length;
        };

        $scope.goToSlide = function(index) {
            $scope.currentSlide = index;
        };

        var slideTimer = $interval(function() {
            $scope.nextSlide();
        }, 5500);

        $scope.$on('$destroy', function() {
            if (slideTimer) $interval.cancel(slideTimer);
        });

        // ---------------------------------------------------------------------
        // Search & Autocomplete
        // ---------------------------------------------------------------------
        $scope.onSearchInput = function() {
            var q = ($scope.data.searchText || '').trim().toLowerCase();
            if (q.length > 0) {
                var matches = [];
                for (var i = 0; i < $scope.data.allProducts.length; i++) {
                    var p = $scope.data.allProducts[i];
                    if (p.name.toLowerCase().indexOf(q) !== -1 || p.description.toLowerCase().indexOf(q) !== -1 || p.sku.toLowerCase().indexOf(q) !== -1) {
                        matches.push({ name: p.name, sku: p.sku, price: p.price, type: 'Product' });
                    }
                }
                for (var j = 0; j < $scope.data.categories.length; j++) {
                    var c = $scope.data.categories[j];
                    if (c.toLowerCase().indexOf(q) !== -1) {
                        matches.push({ name: c + ' Robots', category: c, type: 'Category' });
                    }
                }
                $scope.searchSuggestions = matches.slice(0, 6);
                $rootScope.showSearchSuggest = true;
            } else {
                $scope.searchSuggestions = [];
                $rootScope.showSearchSuggest = false;
            }
        };

        $scope.selectSuggestion = function(sug) {
            $rootScope.showSearchSuggest = false;
            if (sug.sku) {
                $location.url('/product/' + sug.sku);
            } else if (sug.category) {
                $location.url('/search/' + encodeURIComponent(sug.category));
            } else {
                $scope.data.searchText = sug.name;
                $scope.search();
            }
        };

        $scope.search = function() {
            $rootScope.showSearchSuggest = false;
            if ($scope.data.searchText && $scope.data.searchText.trim() !== '') {
                $location.url('/search/' + encodeURIComponent($scope.data.searchText.trim()));
            }
        };

        // ---------------------------------------------------------------------
        // Quick Add to Cart
        // ---------------------------------------------------------------------
        $scope.quickAddToCart = function(prod, event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
            if (prod.instock === 0) return;
            var url = '/api/cart/add/' + currentUser.uniqueid + '/' + prod.sku + '/1';
            $http.get(url).then(function(res) {
                currentUser.cart = res.data;
                currentUser.save();
                $scope.data.cart = res.data;
                $rootScope.openCartDrawer();
            }).catch(function(e) {
                console.log('Error adding to cart', e);
            });
        };

        $scope.filterCategory = function(category) {
            $scope.selectedCategory = category;
            if (category === 'All') {
                $scope.categoryFilter = function() { return true; };
                return;
            }
            $scope.categoryFilter = function(product) {
                var text = ((product.name || '') + ' ' + (product.description || '') + ' ' + (product.categories || []).join(' ')).toLowerCase();
                var terms = {
                    'Home Companions': ['ai', 'watson', 'stan'],
                    'Field Robotics': ['robot', 'harvester', 'field', 'uhj'],
                    'AI Modules': ['ai', 'watson', 'cognitive'],
                    'Accessories': ['accessory', 'telemetry']
                };
                return (terms[category] || []).some(function(term) { return text.indexOf(term) !== -1; });
            };
        };

        // ---------------------------------------------------------------------
        // Data Loaders
        // ---------------------------------------------------------------------
        function getCategories() {
            $http.get('/api/catalogue/categories').then(function(res) {
                $scope.data.categories = res.data || [];
            }).catch(function(e) {});
        }

        $scope.catalogueLoading = true;
        $scope.catalogueError = false;
        $scope.retryCatalogue = loadAllProducts;

        function loadAllProducts() {
            $scope.catalogueLoading = true;
            $scope.catalogueError = false;
            return $http.get('/api/catalogue/products').then(function(res) {
                $scope.data.allProducts = res.data || [];
            }).catch(function() {
                $scope.catalogueError = true;
            }).finally(function() {
                $scope.catalogueLoading = false;
            });
        }

        function getUniqueid() {
            return new Promise(function(resolve, reject) {
                $http.get('/api/user/uniqueid').then(function(res) {
                    resolve(res.data.uuid);
                }).catch(function(e) {
                    reject(e);
                });
            });
        }

        function loadUserCart(id) {
            if (!id) return;
            $http.get('/api/cart/cart/' + id).then(function(res) {
                if (res.data && res.data.items) {
                    currentUser.cart = res.data;
                    currentUser.save();
                    $scope.data.cart = res.data;
                }
            }).catch(function(e) {});
        }

        // Initialize shopform
        getCategories();
        loadAllProducts();

        if (!currentUser.uniqueid) {
            getUniqueid().then(function(id) {
                $scope.data.uniqueid = id;
                currentUser.uniqueid = id;
                currentUser.save();
                if (typeof ineum !== 'undefined') {
                    ineum('user', id);
                    ineum('meta', 'environment', 'production');
                    ineum('meta', 'variant', 'marketplace');
                }
            }).catch(function(e) {});
        } else {
            $scope.data.uniqueid = currentUser.uniqueid;
            $scope.data.user = currentUser.user;
            loadUserCart(currentUser.uniqueid);
            if (typeof ineum !== 'undefined') {
                if (currentUser.user && currentUser.user.name) {
                    ineum('user', currentUser.uniqueid, currentUser.user.name, currentUser.user.email);
                } else {
                    ineum('user', currentUser.uniqueid);
                }
            }
        }

        // Watchers
        $scope.$watch(function() { return currentUser.uniqueid; }, function(newVal, oldVal) {
            if (newVal !== oldVal) {
                $scope.data.uniqueid = currentUser.uniqueid;
                $scope.data.user = currentUser.user;
            }
        });

        $scope.$watch(function() { return currentUser.user; }, function(newVal, oldVal) {
            $scope.data.user = currentUser.user;
        }, true);

        $scope.$watch(function() { return currentUser.cart; }, function(newVal, oldVal) {
            $scope.data.cart = currentUser.cart;
        }, true);
    }]);

    // =========================================================================
    // 5. Searchform Controller (Filtering, Sorting & Facets)
    // =========================================================================
    robotshop.controller('searchform', ['$scope', '$rootScope', '$http', '$routeParams', '$location', 'currentUser', function($scope, $rootScope, $http, $routeParams, $location, currentUser) {
        $scope.data = {};
        $scope.data.searchResults = [];
        $scope.data.rawResults = [];
        $scope.data.categories = [];
        $scope.searchTerm = $routeParams.text || '';

        // Filters State
        $scope.filters = {
            category: 'All',
            priceRange: 'all',
            minRating: 0,
            inStockOnly: false
        };

        // Sort State (relevance, price_asc, price_desc, rating_desc, name_asc)
        $scope.sortBy = 'relevance';

        // Load Categories for Filter Sidebar
        $http.get('/api/catalogue/categories').then(function(res) {
            $scope.data.categories = res.data || [];
        }).catch(function(e) {});

        function executeSearch(query) {
            if (query && query.trim() !== '') {
                $http.get('/api/catalogue/search/' + encodeURIComponent(query.trim())).then(function(res) {
                    $scope.data.rawResults = res.data || [];
                    applyFiltersAndSort();
                }).catch(function(e) {
                    console.log('ERROR searching', e);
                });
            } else {
                $http.get('/api/catalogue/products').then(function(res) {
                    $scope.data.rawResults = res.data || [];
                    applyFiltersAndSort();
                }).catch(function(e) {});
            }
        }

        function applyFiltersAndSort() {
            var list = $scope.data.rawResults.slice();

            // 1. Category Filter
            if ($scope.filters.category && $scope.filters.category !== 'All') {
                list = list.filter(function(item) {
                    return item.categories && item.categories.indexOf($scope.filters.category) !== -1;
                });
            }

            // 2. Price Range Filter
            if ($scope.filters.priceRange === 'under500') {
                list = list.filter(function(item) { return item.price < 500; });
            } else if ($scope.filters.priceRange === '500to1500') {
                list = list.filter(function(item) { return item.price >= 500 && item.price <= 1500; });
            } else if ($scope.filters.priceRange === '1500to3000') {
                list = list.filter(function(item) { return item.price > 1500 && item.price <= 3000; });
            } else if ($scope.filters.priceRange === 'above3000') {
                list = list.filter(function(item) { return item.price > 3000; });
            }

            // 3. In Stock Only
            if ($scope.filters.inStockOnly) {
                list = list.filter(function(item) { return item.instock > 0; });
            }

            // 4. Sorting
            if ($scope.sortBy === 'price_asc') {
                list.sort(function(a, b) { return a.price - b.price; });
            } else if ($scope.sortBy === 'price_desc') {
                list.sort(function(a, b) { return b.price - a.price; });
            } else if ($scope.sortBy === 'name_asc') {
                list.sort(function(a, b) { return a.name.localeCompare(b.name); });
            }

            $scope.data.searchResults = list;
        }

        $scope.setSort = function(sortKey) {
            $scope.sortBy = sortKey;
            applyFiltersAndSort();
        };

        $scope.setCategoryFilter = function(cat) {
            $scope.filters.category = cat;
            applyFiltersAndSort();
        };

        $scope.setPriceFilter = function(priceRange) {
            $scope.filters.priceRange = priceRange;
            applyFiltersAndSort();
        };

        $scope.toggleInStockFilter = function() {
            $scope.filters.inStockOnly = !$scope.filters.inStockOnly;
            applyFiltersAndSort();
        };

        $scope.clearFilters = function() {
            $scope.filters = {
                category: 'All',
                priceRange: 'all',
                minRating: 0,
                inStockOnly: false
            };
            $scope.sortBy = 'relevance';
            applyFiltersAndSort();
        };

        $scope.quickAddToCart = function(prod, event) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
            if (prod.instock === 0) return;
            var url = '/api/cart/add/' + currentUser.uniqueid + '/' + prod.sku + '/1';
            $http.get(url).then(function(res) {
                currentUser.cart = res.data;
                currentUser.save();
            }).catch(function(e) {});
        };

        executeSearch($scope.searchTerm);
    }]);

    // =========================================================================
    // 6. Productform Controller (PDP, Zoom, Ratings, Pincode & Offers)
    // =========================================================================
    robotshop.controller('productform', ['$scope', '$rootScope', '$http', '$routeParams', '$location', '$timeout', 'currentUser', function($scope, $rootScope, $http, $routeParams, $location, $timeout, currentUser) {
        $scope.data = {};
        $scope.data.message = '';
        $scope.data.product = {};
        $scope.data.rating = { avg_rating: 0, rating_count: 0 };
        $scope.data.productLoading = true;
        $scope.data.productError = false;
        $scope.data.quantity = 1;

        $scope.activeImage = '';
        $scope.activeTab = 'specifications';
        $scope.relatedProducts = [];

        $scope.setImage = function(imagePath) {
            $scope.activeImage = imagePath;
        };

        $scope.setTab = function(tabName) {
            $scope.activeTab = tabName;
        };

        $scope.addToCart = function() {
            var url = '/api/cart/add/' + currentUser.uniqueid + '/' + $scope.data.product.sku + '/' + $scope.data.quantity;
            $http.get(url).then(function(res) {
                currentUser.cart = res.data;
                currentUser.save();
                $scope.data.message = 'Added ' + $scope.data.quantity + 'x ' + $scope.data.product.name + ' to your cart!';
                $timeout(clearMessage, 4000);
            }).catch(function(e) {
                $scope.data.message = 'Could not add this robot. Please try again.';
                $timeout(clearMessage, 4000);
            });
        };

        $scope.buyNow = function() {
            var url = '/api/cart/add/' + currentUser.uniqueid + '/' + $scope.data.product.sku + '/' + $scope.data.quantity;
            $http.get(url).then(function(res) {
                currentUser.cart = res.data;
                currentUser.save();
                $location.url('/cart');
            }).catch(function(e) {
                $scope.data.message = 'Could not add this robot. Please try again.';
            });
        };

        $scope.rateProduct = function(score) {
            var url = '/api/ratings/api/rate/' + $scope.data.product.sku + '/' + score;
            $http.put(url).then(function(res) {
                $scope.data.message = 'Thank you! Your ' + score + '★ rating has been recorded.';
                $timeout(clearMessage, 3000);
                loadRating($scope.data.product.sku);
            }).catch(function(e) {
                console.log('Error rating product', e);
            });
        };

        function loadRelatedProducts(category, currentSku) {
            $http.get('/api/catalogue/products/' + category).then(function(res) {
                if (res.data && Array.isArray(res.data)) {
                    $scope.relatedProducts = res.data.filter(function(p) {
                        return p.sku !== currentSku;
                    }).slice(0, 4);
                }
            }).catch(function(e) {});
        }

        $scope.retryProduct = function() { loadProduct($routeParams.sku); };

        function loadProduct(sku) {
            $scope.data.productLoading = true;
            $scope.data.productError = false;
            return $http.get('/api/catalogue/product/' + sku).then(function(res) {
                $scope.data.product = res.data;
                $scope.activeImage = '/images/' + res.data.sku + '.png';
                if (res.data.categories && res.data.categories.length > 0) {
                    loadRelatedProducts(res.data.categories[0], res.data.sku);
                }
            }).catch(function(e) {
                $scope.data.productError = true;
            }).finally(function() {
                $scope.data.productLoading = false;
            });
        }

        function loadRating(sku) {
            $http.get('/api/ratings/api/fetch/' + sku).then(function(res) {
                if (res.data && res.data.avg_rating) {
                    $scope.data.rating = res.data;
                }
            }).catch(function(e) {});
        }

        function clearMessage() {
            $scope.data.message = '';
        }

        loadProduct($routeParams.sku);
        loadRating($routeParams.sku);
    }]);

    // =========================================================================
    // 7. Cartform Controller (Flipkart-Style Steppers & Summary)
    // =========================================================================
    robotshop.controller('cartform', ['$scope', '$rootScope', '$http', '$location', 'currentUser', function($scope, $rootScope, $http, $location, currentUser) {
        $scope.data = {};
        $scope.data.cart = currentUser.cart || { total: 0, items: [] };
        $scope.data.uniqueid = currentUser.uniqueid;

        $scope.buy = function() {
            $location.url('/shipping');
        };

        $scope.change = function(sku, qty) {
            if (qty < 0) qty = 0;
            var url = '/api/cart/update/' + $scope.data.uniqueid + '/' + sku + '/' + qty;
            $http.get(url).then(function(res) {
                $scope.data.cart = res.data;
                currentUser.cart = res.data;
                currentUser.save();
            }).catch(function(e) {
                console.log('Error changing quantity', e);
            });
        };

        $scope.incrementQty = function(item) {
            $scope.change(item.sku, (item.qty || 1) + 1);
        };

        $scope.decrementQty = function(item) {
            if (item.qty > 1) {
                $scope.change(item.sku, item.qty - 1);
            } else {
                $scope.removeItem(item);
            }
        };

        $scope.removeItem = function(item) {
            $scope.change(item.sku, 0);
        };

        $scope.saveForLater = function(item) {
            $rootScope.toggleWishlist(item);
            $scope.removeItem(item);
        };

        $scope.getOriginalTotal = function() {
            if (!$scope.data.cart || !$scope.data.cart.items) return 0;
            var orig = 0;
            for (var i = 0; i < $scope.data.cart.items.length; i++) {
                var it = $scope.data.cart.items[i];
                if (it.sku !== 'SHIP') {
                    orig += (it.price * 1.15) * (it.qty || 1);
                }
            }
            return orig;
        };

        function loadCart(id) {
            if (!id) return;
            $http.get('/api/cart/cart/' + id).then(function(res) {
                var cart = res.data;
                if (cart && cart.items && cart.items.length > 0 && cart.items[cart.items.length - 1].sku === 'SHIP') {
                    $http.get('/api/cart/update/' + id + '/SHIP/0').then(function(upRes) {
                        currentUser.cart = upRes.data;
                        currentUser.save();
                        $scope.data.cart = upRes.data;
                    }).catch(function(e) {});
                } else {
                    $scope.data.cart = cart;
                    currentUser.cart = cart;
                    currentUser.save();
                }
            }).catch(function(e) {});
        }

        loadCart($scope.data.uniqueid);
    }]);

    // =========================================================================
    // 8. Shipform Controller (Distance & Freight Routing)
    // =========================================================================
    robotshop.controller('shipform', ['$scope', '$rootScope', '$http', '$location', '$timeout', 'currentUser', 'checkoutState', function($scope, $rootScope, $http, $location, $timeout, currentUser, checkoutState) {
        var version = 0, timer, destroyed = false;
        $scope.data = { countries: [], country: null, cityName: '', city: null, cities: [],
            street: '', flat: '', postalCode: '', cart: currentUser.cart, shipping: null,
            loadingCountries: true, findingCities: false, calculating: false, busy: false, message: '' };
        var data = $scope.data;
        // Revisiting delivery requires a fresh quote; no address is persisted to storage.
        checkoutState.clear();
        $scope.loadCountries = function() {
            data.loadingCountries = true; data.message = '';
            return $http.get('/api/shipping/codes', {timeout: 10000}).then(function(res) {
                data.countries = Array.isArray(res.data) ? res.data : [];
                if (!data.countries.length) data.message = 'Countries could not be loaded. Please try again.';
            }).catch(function() {
                data.message = 'Countries could not be loaded. Please try again.';
            }).finally(function() { data.loadingCountries = false; });
        };
        function invalidateCity() {
            version++; $timeout.cancel(timer);
            data.city = null; data.cities = []; data.shipping = null;
            data.findingCities = false; data.calculating = false; data.message = ''; data.searched = false;
        }
        $scope.countryChanged = function() { invalidateCity(); data.cityName = ''; };
        $scope.cityChanged = function() {
            invalidateCity();
            var term = (data.cityName || '').trim(), requestVersion = version;
            if (!data.country || term.length < 3) return;
            data.findingCities = true;
            timer = $timeout(function() {
                $http.get('/api/shipping/match/' + encodeURIComponent(data.country.code) + '/' + encodeURIComponent(term), {timeout: 10000}).then(function(res) {
                    if (destroyed || requestVersion !== version) return;
                    data.cities = (Array.isArray(res.data) ? res.data : []).filter(function(city) {
                        return city && Number.isSafeInteger(city.uuid) && city.uuid > 0 && typeof city.name === 'string' && city.code === data.country.code;
                    });
                    data.searched = true;
                }).catch(function() {
                    if (!destroyed && requestVersion === version) data.message = 'City lookup failed. Edit the city name to try again.';
                }).finally(function() {
                    if (!destroyed && requestVersion === version) data.findingCities = false;
                });
            }, 300);
        };
        $scope.selectCity = function(city) {
            invalidateCity(); data.city = city; data.cityName = city.name;
            $scope.calcShipping();
        };
        $scope.calcShipping = function() {
            if (!data.city || data.calculating) return;
            var requestVersion = version;
            data.calculating = true; data.message = '';
            return $http.get('/api/shipping/calc/' + data.city.uuid, {timeout: 10000}).then(function(res) {
                if (destroyed || requestVersion !== version) return;
                if (!res.data || !Number.isFinite(res.data.cost) || res.data.cost < 0 || !Number.isFinite(res.data.distance) || res.data.distance < 0) throw new Error('Invalid quote');
                data.shipping = { cost: res.data.cost, distance: res.data.distance,
                    location: data.country.name + ' ' + data.city.name };
            }).catch(function() {
                if (!destroyed && requestVersion === version) data.message = 'Shipping could not be calculated. Please try again.';
            }).finally(function() {
                if (!destroyed && requestVersion === version) data.calculating = false;
            });
        };
        $scope.productTotal = function() {
            return ((data.cart && data.cart.items) || []).reduce(function(sum, item) {
                return sum + (item.sku === 'SHIP' ? 0 : item.subtotal);
            }, 0);
        };
        $scope.confirmShipping = function(form) {
            if (data.busy) return;
            if (form) form.$setSubmitted();
            var address = {countryCode: data.country && data.country.code, country: data.country && data.country.name,
                cityId: data.city && data.city.uuid, city: data.city && data.city.name,
                street: (data.street || '').trim(), flat: (data.flat || '').trim(), postalCode: (data.postalCode || '').trim()};
            if ((form && form.$invalid) || !checkoutState.validAddress(address) || !data.shipping || !currentUser.uniqueid) {
                data.message = 'Choose a city from the suggestions and enter your street and flat / house number.'; return;
            }
            data.busy = true; data.message = '';
            return $http.post('/api/shipping/confirm/' + encodeURIComponent(currentUser.uniqueid), data.shipping, {timeout: 15000}).then(function(res) {
                if (!res.data || !Array.isArray(res.data.items) || !res.data.items.some(function(item) { return item.sku === 'SHIP'; })) throw new Error('Invalid cart');
                currentUser.cart = res.data; currentUser.save();
                checkoutState.address = address; checkoutState.cartKey = checkoutState.key(res.data);
                $location.url('/payment');
            }).catch(function() {
                data.message = 'Delivery could not be confirmed. Your order has not been placed. Please try again.';
            }).finally(function() { data.busy = false; });
        };
        $scope.$on('$destroy', function() { destroyed = true; version++; $timeout.cancel(timer); });
        $scope.loadCountries();
    }]);

    // =========================================================================
    // 9. Review and demo order confirmation
    // =========================================================================
    robotshop.controller('paymentform', ['$scope', '$rootScope', '$http', 'currentUser', 'checkoutState', function($scope, $rootScope, $http, currentUser, checkoutState) {
        var data = $scope.data = { message: '', buttonDisabled: false, cont: false,
            cart: currentUser.cart, address: angular.copy(checkoutState.address), checkingCart: true };
        $scope.canPlaceOrder = function() { return !data.cartError && !data.checkingCart && !data.buttonDisabled && checkoutState.ready(data.cart); };
        $scope.deliveryDate = function(value) {
            if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
            var date = new Date(value + 'T12:00:00Z');
            return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).format(date) : '';
        };
        $scope.loadReviewCart = function() {
            data.checkingCart = true; data.cartError = false;
            return $http.get('/api/cart/cart/' + encodeURIComponent(currentUser.uniqueid), {timeout: 10000}).then(function(res) {
                data.cart = res.data; currentUser.cart = res.data; currentUser.save();
            }).catch(function() {
                data.cartError = true; data.message = 'Your cart could not be verified. Please try again.';
            }).finally(function() { data.checkingCart = false; });
        };
        $scope.pay = function() {
            if (data.cartError || !$scope.canPlaceOrder()) return;
            data.buttonDisabled = true; data.message = '';
            var payload = angular.copy(data.cart);
            payload.deliveryAddress = angular.copy(checkoutState.address);
            return $http.post('/api/payment/pay/' + encodeURIComponent(currentUser.uniqueid), payload, {timeout: 60000}).then(function(res) {
                if (!res.data || typeof res.data.orderid !== 'string' || !res.data.orderid) {
                    data.message = 'The order response was incomplete. Check your order history before trying again.';
                    return; // An ambiguous response must not invite a duplicate submission.
                }
                data.orderid = res.data.orderid;
                data.estimate = res.data.delivery && res.data.delivery.estimate;
                data.receiptTotal = data.cart.total;
                data.cart = {total: 0, tax: 0, items: []};
                currentUser.cart = data.cart; currentUser.save(); checkoutState.clear();
                data.cont = true;
            }).catch(function(error) {
                data.message = error.status === 400 ? 'Check your delivery details and cart before trying again.' :
                    'We could not confirm the order. Check your order history before trying again.';
                // A 4xx validation rejection is safe to retry; ambiguous failures stay locked.
                if (error.status >= 400 && error.status < 500) data.buttonDisabled = false;
            });
        };
        $scope.loadReviewCart();
    }]);

    // =========================================================================
    // 10. Loginform Controller (User Identity & Order Archives)
    // =========================================================================
    robotshop.controller('loginform', ['$scope', '$rootScope', '$http', 'currentUser', function($scope, $rootScope, $http, currentUser) {
        $scope.data = {};
        $scope.data.loginName = '';
        $scope.data.loginPassword = '';
        $scope.data.regName = '';
        $scope.data.regEmail = '';
        $scope.data.regPassword = '';
        $scope.data.regPassword2 = '';
        $scope.data.message = '';
        $scope.data.user = currentUser.user || {};
        $scope.data.orderHistory = [];
        $scope.activeAuthTab = 'login';

        function refreshCart(id) {
            $http.get('/api/cart/cart/' + id).then(function(res) {
                if (res.data) {
                    currentUser.cart = res.data;
                    currentUser.save();
                }
            }).catch(function(e) {});
        }

        $scope.setAuthTab = function(tab) {
            $scope.activeAuthTab = tab;
            $scope.data.message = '';
        };

        $scope.login = function() {
            $scope.data.message = '';
            if (!$scope.data.loginName || !$scope.data.loginPassword) {
                $scope.data.message = 'Please provide username/email and password';
                return;
            }
            $http.post('/api/user/login', {
                name: $scope.data.loginName,
                password: $scope.data.loginPassword
            }).then(function(res) {
                var oldId = currentUser.uniqueid;
                $scope.data.user = res.data;
                $scope.data.user.password = '';
                $scope.data.loginPassword = '';
                currentUser.user = $scope.data.user;
                currentUser.uniqueid = $scope.data.user.name;
                currentUser.save();

                if (oldId && oldId !== $scope.data.user.name) {
                    $http.get('/api/cart/rename/' + oldId + '/' + $scope.data.user.name).then(function(renRes) {
                        refreshCart(currentUser.uniqueid);
                    }).catch(function(e) {});
                } else {
                    refreshCart(currentUser.uniqueid);
                }
                loadHistory(currentUser.user.name);
            }).catch(function(e) {
                var errDetail = e.data || 'Invalid credentials. Please verify your login details.';
                $scope.data.message = 'Authentication Error: ' + errDetail;
                $scope.data.loginPassword = '';
            });
        };

        $scope.register = function() {
            $scope.data.message = '';
            var name = ($scope.data.regName || '').trim();
            var email = ($scope.data.regEmail || '').trim();
            var password = ($scope.data.regPassword || '').trim();
            var password2 = ($scope.data.regPassword2 || '').trim();

            if (!name || !email || !password || !password2) {
                $scope.data.message = 'Please complete all required registration fields.';
                return;
            }

            if (password !== password2) {
                $scope.data.message = 'Passwords do not match.';
                $scope.data.regPassword = $scope.data.regPassword2 = '';
                return;
            }

            $http.post('/api/user/register', {
                name: name,
                email: email,
                password: password
            }).then(function(res) {
                var oldId = currentUser.uniqueid;
                $scope.data.user = { name: name, email: email };
                $scope.data.regPassword = $scope.data.regPassword2 = '';
                currentUser.user = $scope.data.user;
                currentUser.uniqueid = name;
                currentUser.save();

                if (oldId && oldId !== name) {
                    $http.get('/api/cart/rename/' + oldId + '/' + name).then(function() {
                        refreshCart(currentUser.uniqueid);
                    }).catch(function() {});
                }
                loadHistory(name);
            }).catch(function(e) {
                var errDetail = e.data || 'Registration failed. The username or email might already be registered.';
                $scope.data.message = 'Registration Error: ' + errDetail;
                $scope.data.regPassword = $scope.data.regPassword2 = '';
            });
        };

        $scope.logout = function() {
            currentUser.logout();
            $scope.data.user = {};
            $scope.data.orderHistory = [];
            $scope.data.loginName = '';
            $scope.data.loginPassword = '';
            $scope.data.message = 'You have logged out successfully.';
            $http.get('/api/user/uniqueid').then(function(res) {
                currentUser.uniqueid = res.data.uuid;
                currentUser.save();
            }).catch(function(e) {});
        };

        function loadHistory(id) {
            $http.get('/api/user/history/' + id).then(function(res) {
                $scope.data.orderHistory = res.data.history || [];
            }).catch(function(e) {});
        }

        if (currentUser.user && currentUser.user.name) {
            $scope.data.user = currentUser.user;
            loadHistory(currentUser.user.name);
        }
    }]);

})(window.angular);
