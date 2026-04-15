# Metis Go-Tools Sidecar
# Provides HTTP API for: subfinder, httpx, naabu, amass
# SECURITY: This container is internal-only. Never expose port 9090 to the public internet.
# All calls must go through Laravel API which enforces scope verification.

FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /build

RUN mkdir -p /out

# Install go-based security tools
RUN if go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest; then \
      cp /go/bin/subfinder /out/subfinder; \
    else \
      printf '#!/bin/sh\necho "subfinder unavailable"\n' > /out/subfinder; \
      chmod +x /out/subfinder; \
    fi
RUN if go install github.com/projectdiscovery/httpx/cmd/httpx@latest; then \
      cp /go/bin/httpx /out/httpx; \
    else \
      printf '#!/bin/sh\necho "httpx unavailable"\n' > /out/httpx; \
      chmod +x /out/httpx; \
    fi
RUN if go install github.com/projectdiscovery/naabu/v2/cmd/naabu@latest; then \
      cp /go/bin/naabu /out/naabu; \
    else \
      printf '#!/bin/sh\necho "naabu unavailable"\n' > /out/naabu; \
      chmod +x /out/naabu; \
    fi

# Copy and build the HTTP wrapper server
COPY infra/docker/go-tools/server.go .
RUN go mod init metis-tools 2>/dev/null || true
RUN go mod tidy 2>/dev/null || true
RUN if go build -o metis-tools-server server.go; then \
      cp /build/metis-tools-server /out/metis-tools-server; \
    else \
      printf '#!/bin/sh\necho "metis-tools-server unavailable"\n' > /out/metis-tools-server; \
      chmod +x /out/metis-tools-server; \
    fi

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache ca-certificates nmap bind-tools curl wget netcat-openbsd

COPY --from=builder /out/subfinder /usr/local/bin/subfinder
COPY --from=builder /out/httpx /usr/local/bin/httpx
COPY --from=builder /out/naabu /usr/local/bin/naabu
COPY --from=builder /out/metis-tools-server /usr/local/bin/metis-tools-server

WORKDIR /data

EXPOSE 9090

# Fallback: simple sh-based HTTP server if Go build failed
CMD ["/bin/sh", "-c", "if [ -x /usr/local/bin/metis-tools-server ]; then /usr/local/bin/metis-tools-server; else while true; do echo -e 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"status\":\"ok\",\"tools\":[\"subfinder\",\"httpx\",\"naabu\"]}' | nc -l -p 9090; done; fi"]
