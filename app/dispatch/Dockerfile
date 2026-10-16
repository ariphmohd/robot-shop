# syntax=docker/dockerfile:1

# Build the statically linked Go binary separately so the Go compiler, module
# cache, and build tools are never included in the runtime image.
FROM golang:1.24-bookworm AS build

WORKDIR /src

COPY go.mod ./
COPY *.go ./

# The repository currently has no go.sum. `go mod tidy` creates the dependency
# checksums during the build; the resulting binary is then stripped of debug
# symbols to keep the production layer small.
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
      -trimpath -ldflags='-s -w' -o /out/dispatch .

# Distroless contains only the minimal runtime files (including CA
# certificates) and runs as an unprivileged user by default.
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /out/dispatch /app/dispatch

USER nonroot:nonroot
ENTRYPOINT ["/app/dispatch"]
