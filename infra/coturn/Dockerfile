# Coturn TURN/STUN Server Dockerfile
# Based on coturn official image with custom configuration

FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install coturn
RUN apt-get update && apt-get install -y \
    coturn \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Create coturn user
RUN useradd -m -s /bin/false coturn

# Copy configuration
COPY coturn.conf /etc/coturn/coturn.conf
COPY generate-secrets.sh /opt/generate-secrets.sh
RUN chmod +x /opt/generate-secrets.sh

# Create directories for logs and state
RUN mkdir -p /var/log/coturn /var/lib/coturn && \
    chown -R coturn:coturn /var/log/coturn /var/lib/coturn

# Expose TURN ports
# 3478: Default TURN port (TCP/UDP)
# 5349: TURN over TLS (TCP)
# 49152-65535: Ephemeral UDP relay ports
EXPOSE 3478/tcp 3478/udp 5349/tcp

# Run coturn as non-root user
USER coturn

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD coturnctl health-check || exit 1

# Start coturn server
CMD ["coturn", "--config", "/etc/coturn/coturn.conf", "-v"]