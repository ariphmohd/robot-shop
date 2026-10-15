# Dispatch Microservice

The **Dispatch** microservice is a headless, asynchronous worker written in **Go (Golang)**. It consumes placed order messages from RabbitMQ, simulates warehouse packaging and shipping logistics, and records distributed tracing spans.

---

## Architecture & Service Connections

The Dispatch service is an asynchronous background worker in the Application Tier (Tier 2). It does not expose HTTP endpoints; it connects to RabbitMQ as an AMQP message consumer.

```mermaid
flowchart LR
    Payment["payment service"]
    RabbitMQ[("RabbitMQ (:5672)<br/>exchange: robot-shop<br/>queue: orders")]
    Dispatch["dispatch worker<br/>(Golang Consumer)"]
    Logistics(["Warehouse Fulfillment / ERP"])

    Payment -->|Publish order message| RabbitMQ
    RabbitMQ -->|Consume order stream| Dispatch
    Dispatch -->|Simulate processing & dispatch| Logistics
```

---

## Upstream & Downstream Dependencies

| Connection | Direction | Protocol | Description |
| :--- | :--- | :--- | :--- |
| **`rabbitmq`** | Inbound / Outbound | AMQP 0-9-1 | Subscribes to the `orders` queue bound to the `robot-shop` direct exchange |
| **`payment`** | Indirect Upstream | Message Payload | Payment publishes the order JSON consumed by Dispatch |

---

## Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `AMQP_HOST` | `rabbitmq` | Hostname/DNS of the RabbitMQ message broker |
| `DISPATCH_ERROR_PERCENT` | `0` | Percentage (0-100) of simulated fulfillment errors for testing |

---

## How to Run Locally

### 1. Start Backing Message Broker (RabbitMQ)
```bash
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3.8-management-alpine
```

### 2. Option A: Run Natively with Go
*Requirements: Go 1.20+*

```bash
# 1. Initialize and download dependencies
go mod init dispatch 2>/dev/null || true
go get
go build -o dispatch main.go

# 2. Run the executable
AMQP_HOST=localhost ./dispatch
```

### 3. Option B: Run with Docker
```bash
# 1. Build Docker image
docker build -t rs-dispatch .

# 2. Run container
docker run -d --name dispatch \
  -e AMQP_HOST=host.docker.internal \
  rs-dispatch
```

---

## How to Test & Verify

Because Dispatch is a message consumer, verification is done by checking container logs after publishing a message to RabbitMQ:

1. **Verify Connection in Container Logs**:
   ```bash
   docker logs -f dispatch
   ```
   **Expected Output:**
   ```text
   Connecting to amqp://guest:guest@host.docker.internal:5672/
   Rabbit MQ ready true
   Waiting for messages
   ```

2. **Publish a Test Order to RabbitMQ**:
   You can push an order message via the Payment service or directly via RabbitMQ's Management API:
   ```bash
   curl -i -u guest:guest -H "content-type:application/json" \
     -X POST http://localhost:15672/api/exchanges/%2f/robot-shop/publish \
     -d'{"properties":{"headers":{}},"routing_key":"orders","payload":"{\"orderid\":\"test-101\",\"user\":\"stan\"}","payload_encoding":"string"}'
   ```

3. **Check Dispatch Logs**:
   Dispatch should log:
   ```text
   Order {"orderid":"test-101","user":"stan"}
   order test-101
   Order sent for processing
   ```
