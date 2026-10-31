# syntax=docker/dockerfile:1

# Build on the CI runner's native CPU, then cross-compile the small static
# binary for the platform requested by Buildx.  This avoids hard-coding amd64
# and avoids emulating the Go compiler for the ARM64 variant.
FROM --platform=$BUILDPLATFORM golang:1.24-bookworm AS build

ARG TARGETOS
ARG TARGETARCH

WORKDIR /src

COPY go.mod ./
COPY *.go ./

# The repository currently has no go.sum. `go mod tidy` creates the dependency
# checksums during the build; the resulting binary is then stripped of debug
# symbols to keep the production layer small.
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build \
      -trimpath -ldflags='-s -w' -o /out/dispatch .

# Distroless contains only the minimal runtime files (including CA
# certificates) and runs as an unprivileged user by default.
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /out/dispatch /app/dispatch

USER nonroot:nonroot
ENTRYPOINT ["/app/dispatch"]
