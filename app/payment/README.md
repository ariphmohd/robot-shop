# Payment Microservice

The **Payment** microservice coordinates the checkout workflow. It verifies customer validity, inspects cart contents, interacts with a payment gateway, persists order history, empties the customer's cart, and publishes an order event to RabbitMQ for asynchronous fulfillment. It is written in **Python 3.9 (Flask)** and runs on **uWSGI**.

---

## Architecture & Service Connections

The Payment service is in the Application Tier (Tier 2). It orchestrates multiple microservices during the final checkout transaction.

```mermaid
flowchart LR
    Web["web (/api/payment/*)"]
    Payment["payment service (:8080)<br/>Python / Flask / uWSGI"]
    User["user service (:8080)"]
    Cart["cart service (:8080)"]
    RabbitMQ[("RabbitMQ (:5672)<br/>exchange: robot-shop<br/>queue: orders")]
    Gateway(["Payment Gateway<br/>(e.g., PayPal)"])
    Prometheus["Prometheus Scraper"]

    Web -->|POST /pay/:id| Payment
    Prometheus -->|GET /metrics| Payment

    Payment -->|GET /check/:id<br/>POST /order/:id| User
    Payment -->|DELETE /cart/:id| Cart
    Payment -->|HTTP GET / (charge simulation)| Gateway
    Payment -->|AMQP publish order JSON| RabbitMQ
```

---

## Upstream & Downstream Dependencies

| Connection | Direction | Protocol | Description |
| :--- | :--- | :--- | :--- |
| **`web`** | Inbound | HTTP / REST | Receives checkout payload from customer |
| **`user`** | Outbound | HTTP / REST | Validates user existence and appends completed order to user history |
| **`cart`** | Outbound | HTTP / REST | Deletes cart contents upon successful payment |
| **`rabbitmq`** | Outbound | AMQP 0-9-1 | Publishes order event to `orders` queue for downstream dispatch processing |
| **`Payment Gateway`** | Outbound | HTTP / HTTPS | External payment gateway API verification |

---

## Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `AMQP_HOST` | `rabbitmq` | Hostname/DNS of the RabbitMQ broker |
| `USER_HOST` | `user` | Hostname/DNS of the User service |
| `CART_HOST` | `cart` | Hostname/DNS of the Cart service |
| `PAYMENT_GATEWAY` | `https://paypal.com/` | Payment gateway URL to simulate payment processing |
| `SHOP_PAYMENT_PORT` | `8080` | Port for the service to bind to |
| `PAYMENT_DELAY_MS` | `0` | Artificial delay (ms) for demonstration profiling |

---

## How to Run Locally

### 1. Start Backing Message Broker (RabbitMQ)
```bash
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3.8-management-alpine
```

### 2. Option A: Run Natively with Python
*Requirements: Python 3.9+ and pip*

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run with Python directly
AMQP_HOST=localhost USER_HOST=localhost CART_HOST=localhost python payment.py
```

### 3. Option B: Run with Docker
```bash
# 1. Build Docker image
docker build -t rs-payment .

# 2. Run container
docker run -d --name payment -p 8080:8080 \
  -e AMQP_HOST=host.docker.internal \
  -e USER_HOST=host.docker.internal \
  -e CART_HOST=host.docker.internal \
  rs-payment
```

---

## How to Test & Verify

1. **Health Check Endpoint**:
   ```bash
   curl -s http://localhost:8080/health
   ```
   **Expected Output:** `OK`

2. **Prometheus Metrics**:
   ```bash
   curl -s http://localhost:8080/metrics
   ```
   **Expected Output:** Prometheus metrics including `sold_count`, `units_sold`, and `cart_value`.

3. **Process a Test Payment**:
   *(Requires user, cart, and rabbitmq running)*
   ```bash
   curl -s -X POST http://localhost:8080/pay/user \
     -H "Content-Type: application/json" \
     -d '{
       "total": 2423.5,
       "tax": 400.2,
       "items": [
         {"sku": "Watson", "name": "Watson", "price": 2001, "qty": 1},
         {"sku": "SHIP", "name": "Shipping", "price": 422.5, "qty": 1}
       ]
     }'
   ```
   **Expected Output:**
   ```json
   {"orderid": "01234567-89ab-cdef-0123-456789abcdef"}
   ```
