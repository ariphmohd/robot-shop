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
        var savedTheme = 'light';
        try {
            savedTheme = $window.localStorage.getItem(themeKey) || 'light';
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
            var target = angular.element(e.target);
            if (!target.closest('.theme-switch-container').length) {
                if ($rootScope.themeMenuOpen) {
                    $rootScope.$apply(function() {
                        $rootScope.themeMenuOpen = false;
                    });
                }
            }
            if (!target.closest('.search-container').length) {
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
            }).catch(function(e) {
                console.log('Error adding to cart', e);
            });
        };

        // ---------------------------------------------------------------------
        // Data Loaders
        // ---------------------------------------------------------------------
        function getCategories() {
            $http.get('/api/catalogue/categories').then(function(res) {
                $scope.data.categories = res.data || [];
            }).catch(function(e) {});
        }

        function loadAllProducts() {
            $http.get('/api/catalogue/products').then(function(res) {
                $scope.data.allProducts = res.data || [];
            }).catch(function(e) {});
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
        $scope.data.rating = { avg_rating: 4.5, rating_count: 18 };
        $scope.data.quantity = 1;

        $scope.activeImage = '';
        $scope.activeTab = 'specifications';
        $scope.relatedProducts = [];

        // Delivery Estimator
        $scope.deliveryPincode = '';
        $scope.pincodeStatus = '';

        $scope.checkDeliveryPincode = function() {
            var pin = ($scope.deliveryPincode || '').trim();
            if (pin.length >= 3) {
                $scope.pincodeStatus = 'Delivery by Tomorrow, 5:00 PM | Free Express Freight';
            } else {
                $scope.pincodeStatus = 'Please enter a valid postal code or area.';
            }
        };

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
                $scope.data.message = 'Error adding to cart: ' + e;
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
                $location.url('/cart');
            });
        };

        $scope.rateProduct = function(score) {
            var url = '/api/ratings/api/rate/' + $scope.data.product.sku + '/' + score;
            $http.put(url).then(function(res) {
                $scope.data.message = 'Thank you! Your verified ' + score + '★ rating has been recorded.';
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

        function loadProduct(sku) {
            $http.get('/api/catalogue/product/' + sku).then(function(res) {
                $scope.data.product = res.data;
                $scope.activeImage = '/images/' + res.data.sku + '.png';
                if (res.data.categories && res.data.categories.length > 0) {
                    loadRelatedProducts(res.data.categories[0], res.data.sku);
                }
            }).catch(function(e) {
                console.log('Error loading product', e);
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
    robotshop.controller('shipform', ['$scope', '$rootScope', '$http', '$location', 'currentUser', function($scope, $rootScope, $http, $location, currentUser) {
        $scope.data = {};
        $scope.data.countries = [];
        $scope.data.selectedCountry = '';
        $scope.data.selectedLocation = '';
        $scope.data.disableCity = true;
        $scope.data.disableCalc = true;
        $scope.data.shipping = '';
        $scope.data.cart = currentUser.cart;

        var autoLocation;
        var uuid;

        $scope.calcShipping = function() {
            $http.get('/api/shipping/calc/' + uuid).then(function(res) {
                $scope.data.shipping = res.data;
                $scope.data.shipping.location = $scope.data.selectedCountry.name + ' ' + autoLocation;
            }).catch(function(e) {
                console.log('Error calculating shipping', e);
            });
        };

        $scope.confirmShipping = function() {
            $http.post('/api/shipping/confirm/' + currentUser.uniqueid, $scope.data.shipping).then(function(res) {
                currentUser.cart = res.data;
                currentUser.save();
                $location.url('/payment');
            }).catch(function(e) {
                console.log('Error confirming shipping', e);
            });
        };

        $scope.countryChanged = function() {
            if ($scope.data.selectedCountry) {
                $scope.data.disableCity = false;
            }
            $scope.data.selectedLocation = '';
            $scope.data.disableCalc = true;
            $scope.data.shipping = '';
        };

        function loadCodes() {
            $http.get('/api/shipping/codes').then(function(res) {
                $scope.data.countries = res.data;
            }).catch(function(e) {});
        }

        function buildauto() {
            var ac = new autoComplete({
                selector: '#location',
                minChars: 3,
                source: function(term, suggest) {
                    $http.get('/api/shipping/match/' + $scope.data.selectedCountry.code + '/' + term).then(function(res) {
                        suggest(res.data);
                    });
                },
                renderItem: function(item, search) {
                    return '<div class="autocomplete-suggestion" data-name="' + item.name + '" data-uuid="' + item.uuid + '">' + item.name + '</div>';
                },
                onSelect: function(e, term, item) {
                    autoLocation = item.getAttribute('data-name');
                    uuid = item.getAttribute('data-uuid');
                    $scope.data.disableCalc = false;
                    $scope.$apply();
                }
            });
        }

        loadCodes();
        buildauto();
    }]);

    // =========================================================================
    // 9. Paymentform Controller (AMQP Queue Settlement)
    // =========================================================================
    robotshop.controller('paymentform', ['$scope', '$rootScope', '$http', 'currentUser', function($scope, $rootScope, $http, currentUser) {
        $scope.data = {};
        $scope.data.message = '';
        $scope.data.buttonDisabled = false;
        $scope.data.cont = false;
        $scope.data.uniqueid = currentUser.uniqueid;
        $scope.data.cart = currentUser.cart;
        $scope.data.paymentMethod = 'card';

        $scope.pay = function() {
            $scope.data.buttonDisabled = true;
            $http.post('/api/payment/pay/' + $scope.data.uniqueid, $scope.data.cart).then(function(res) {
                $scope.data.orderid = res.data.orderid;
                $scope.data.message = 'Payment Verified & Order Dispatched: ' + res.data.orderid;
                $scope.data.cart = { total: 0, items: [] };
                currentUser.cart = $scope.data.cart;
                currentUser.save();
                $scope.data.cont = true;
            }).catch(function(e) {
                $scope.data.message = 'Error processing payment settlement. Please try again.';
                $scope.data.buttonDisabled = false;
            });
        };
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
