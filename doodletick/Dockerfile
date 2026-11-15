FROM tailscale/tailscale:v1.104.7@sha256:72c1e19e0aedca96b8533bbb0b4368564410ff20b17e53b804eb6c1f04a31be4 AS vpn
FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
ARG BUILD_ARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates iptables iproute2 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=vpn /usr/local/bin/tailscale /usr/local/bin/tailscale
COPY --from=vpn /usr/local/bin/tailscaled /usr/local/bin/tailscaled
WORKDIR /opt/doodletick
COPY keeper/ ./keeper/
COPY gateway.mjs main.mjs tailscale.mjs ./
COPY public/ ./public/
LABEL io.hass.name="Doodle Tick Keeper" io.hass.description="Private Doodleverse Keeper" \
      io.hass.type="addon" io.hass.version="0.1b" io.hass.arch="${BUILD_ARCH}"
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:8099/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "main.mjs"]
