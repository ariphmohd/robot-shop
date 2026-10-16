# Install PHP dependencies outside the runtime image so Composer and its cache
# are not shipped to production.
FROM composer:2 AS vendor

WORKDIR /app
COPY html/composer.json ./
RUN composer install --no-interaction --no-ansi --no-progress --prefer-dist \
    --no-dev --optimize-autoloader

FROM php:8.3-apache-bookworm

RUN apt-get update \
    && apt-get install -yqq --no-install-recommends \
        unzip \
        libzip-dev \
    && docker-php-ext-install pdo_mysql opcache zip \
    && rm -rf /var/lib/apt/lists/*

# Enable AutoProfile for PHP which is currently opt-in beta
RUN echo "instana.enable_auto_profile=1" > "/usr/local/etc/php/conf.d/zzz-instana-extras.ini"

# relax permissions on status
COPY status.conf /etc/apache2/mods-available/status.conf
# Enable Apache mod_rewrite and status
RUN a2enmod rewrite && a2enmod status

WORKDIR /var/www/html

COPY --chown=www-data:www-data html/ /var/www/html

COPY --from=vendor --chown=www-data:www-data /app/vendor /var/www/html/vendor

# Symfony needs write permissions for its cache and logs.  Do not make the
# entire web root world-writable.
RUN mkdir -p /var/www/html/var \
    && chown -R www-data:www-data /var/www
