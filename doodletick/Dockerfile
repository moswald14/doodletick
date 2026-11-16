FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
ARG BUILD_ARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/doodletick
COPY keeper/ ./keeper/
COPY gateway.mjs main.mjs migration.mjs ./
COPY public/ ./public/
LABEL io.hass.name="Doodle Tick Keeper" io.hass.description="Private Doodleverse Keeper" \
      io.hass.type="addon" io.hass.version="0.7b" io.hass.arch="${BUILD_ARCH}"
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:8099/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "main.mjs"]
