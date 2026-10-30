# Delivery address and demo order confirmation

Implemented on `features`, pending review and deployment. Canary remains deferred.

## Customer flow

1. **Add to cart** adds the chosen quantity and keeps the customer on the product
   page. Open the cart and choose **Buy & choose delivery**.
2. Select a country and type at least three city characters. Choose one of the
   matching city buttons. Shipping is calculated automatically.
3. Enter a street address and flat/house number. Postal code is optional.
4. **Continue to review** confirms shipping and shows the address and EUR order
   total. **Place demo order** submits once and waits for the payment service.
5. A successful response shows the order reference, address and estimated arrival
   dates/time window. The cart is cleared only after an order ID is returned.

The shopping-region currency selector is independent of the delivery country.
Checkout remains EUR; browse/cart conversions remain estimates.

## Validation and failure behavior

- Country changes clear the city and shipping quote. Editing a selected city also
  invalidates its quote. Late search/quote responses cannot restore stale data.
- City suggestions use Angular text bindings instead of constructing HTML from
  database values. Lookup and quote failures have visible retry paths.
- Street and flat are required, length-limited, and checked in the UI and payment
  service. Country code and city ID have strict types and formats. Markup/control
  characters are rejected. This is format validation, not postal verification.
- The address is bound to the confirmed cart. A changed or unverified cart requires
  delivery review again. Refreshing the review page clears the in-memory address,
  so the customer must re-enter delivery details.
- Duplicate button clicks do not create duplicate requests. Ambiguous payment
  failures keep submission locked and direct the customer to check order history.
  This is not server-side idempotency; durable idempotency remains future work.

## Delivery estimate and address handling

The payment service produces a **demo estimate of 3–5 weekdays** after the UTC
order date, excluding weekends. The displayed time window is 09:00–18:00 in the
recipient's local time. Holidays, courier capacity and actual transit time are
not modeled. The UI explicitly states that no physical shipment is booked.

Street/flat/postal details are held in page memory and sent to the payment API
for validation. They are returned for the immediate confirmation screen, then
removed from shared checkout state. They are not written to localStorage, Redis,
Atlas order history, AMQP messages, or application body logs. Only the nonsensitive
delivery estimate is added to the existing saved-order/message data.

This limits collection while the demo's existing user-history access lacks
production authentication/authorization. Real fulfillment will require protected
address storage and access controls, along with the broader security work in the
[deferred blueprint](region-currency-canary-blueprint.md). The address form does
not make the existing demo a production payment system.

## Local preview

The old GET-only preview rejected shipping/payment POSTs. Its replacement serves
the actual storefront files and provides an isolated, in-memory demo checkout:

```bash
cd /home/mohd/projects/robot-shop
python3 scripts/dev/preview-storefront.py
```

Open `http://localhost:18090/`. The Kind app at `http://localhost/` must be running
for catalogue and city/shipping reads. The preview does not forward cart changes,
order writes, login, or rating writes to Kind. Its banner identifies the preview,
and order references start with `PREVIEW-`. No preview orders are saved in Atlas.
Sessions use an HttpOnly, SameSite cookie and expire after 12 hours or when the
process stops. The preview binds to loopback and uses only Python's standard
library. Restart it with the command above after restarting WSL.

## Checks and release

```bash
node --test app/web/tests/*.test.cjs
python3 -m unittest discover -s tests -p test_kind_cd.py -v
```

Payment tests use a Python environment with `app/payment/tests/requirements.txt`
installed, then `python3 -m unittest discover -s app/payment/tests -v`. CI runs
these checks. The real Flask route is tested with external HTTP and AMQP mocked;
local verification also runs it in the existing payment image with networking
blocked and source mounted read-only.

Browser verification covers product add, cart, required fields, India/Delhi city
selection, street/flat entry, shipping quote, review, successful confirmation,
cleared cart, absence of stored street details, duplicate-click protection and
320/390/1440-pixel layouts.

The feature changes **web and payment**. Both images must be published and rolled
out before testing the deployed checkout. The updated payment API requires a
`deliveryAddress`; older clients without it receive HTTP 400. The earlier API
returns no delivery estimate, so publishing only the web image is insufficient.
The existing GitHub Actions/Argo CD path handles both after merge into
`codex/kind-test`. No Kubernetes configuration or canary routing is added.
