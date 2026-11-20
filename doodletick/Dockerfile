ARG BUILD_ARCH=aarch64
FROM ghcr.io/moswald14/doodletick-aarch64@sha256:8e4d71a4d96c62d191555724ced2ff1ed00fba34b93729b9c0040dd97cf78672 AS keeper-aarch64
FROM ghcr.io/moswald14/doodletick-amd64@sha256:74964d67705fed0b21a35849fcfc9d81f16684ef39fe925353682621a56cefd7 AS keeper-amd64
FROM keeper-${BUILD_ARCH}
ARG BUILD_ARCH
WORKDIR /opt/doodletick
COPY keeper/ ./keeper/
COPY gateway.mjs dating-relay.mjs main.mjs migration.mjs mozcorp-options.mjs core-options.mjs core-process.mjs jazz-options.mjs ./
COPY core-source/chain-manifest.json ./core-source/chain-manifest.json
COPY public/ ./public/
LABEL io.hass.name="Doodle Tick Keeper" io.hass.description="Private Doodleverse Keeper" \
      io.hass.type="addon" io.hass.version="0.19.1b" io.hass.arch="${BUILD_ARCH}"
LABEL org.opencontainers.image.source="https://github.com/moswald14/doodletick"
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:8099/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "main.mjs"]
