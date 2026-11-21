ARG BUILD_ARCH=aarch64
FROM ghcr.io/moswald14/doodletick-aarch64@sha256:03b3faa272e4dc80cf80a6b6276e76a284c46a2d4d76a1a7b1f4031f90b533a7 AS keeper-aarch64
FROM ghcr.io/moswald14/doodletick-amd64@sha256:c62f703d5fb062527b9d926b7c56775a943abf957099df3a1693ab67955cf843 AS keeper-amd64
FROM keeper-${BUILD_ARCH}
ARG BUILD_ARCH
WORKDIR /opt/doodletick
COPY keeper/ ./keeper/
COPY gateway.mjs dating-relay.mjs main.mjs migration.mjs mozcorp-options.mjs core-options.mjs core-process.mjs jazz-options.mjs ./
COPY core-source/chain-manifest.json ./core-source/chain-manifest.json
COPY public/ ./public/
LABEL io.hass.name="Doodle Tick Keeper" io.hass.description="Private Doodleverse Keeper" \
      io.hass.type="addon" io.hass.version="0.19.3b" io.hass.arch="${BUILD_ARCH}"
LABEL org.opencontainers.image.source="https://github.com/moswald14/doodletick"
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:8099/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "main.mjs"]
