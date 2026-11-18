FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS core-builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git build-essential autoconf automake libtool pkg-config python3 bsdextrautils \
    libssl-dev libevent-dev libboost-system-dev libboost-filesystem-dev \
    libboost-chrono-dev libboost-program-options-dev libboost-test-dev libboost-thread-dev \
    && rm -rf /var/lib/apt/lists/*
COPY core-source/ /build-input/
RUN sh /build-input/build-core.sh

FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
ARG BUILD_ARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates ffmpeg espeak-ng libssl3 \
    libevent-2.1-7 libevent-pthreads-2.1-7 libboost-system1.74.0 libboost-filesystem1.74.0 \
    libboost-chrono1.74.0 libboost-program-options1.74.0 libboost-thread1.74.0 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=core-builder /out/bin/ /usr/local/bin/
COPY --from=core-builder /out/source/ /usr/share/doodleverse-source/
COPY --from=core-builder /out/validation/ /usr/share/doodleverse-validation/
COPY --from=core-builder /out/SHA256SUMS /usr/share/doodleverse-validation/PACKAGE-SHA256SUMS
WORKDIR /opt/doodletick
COPY keeper/ ./keeper/
RUN npm ci --prefix keeper/jazz-stream-deps --omit=dev --ignore-scripts --include=optional --no-audit --no-fund \
    && npm cache clean --force
COPY gateway.mjs main.mjs migration.mjs mozcorp-options.mjs core-options.mjs core-process.mjs jazz-options.mjs ./
COPY core-source/chain-manifest.json ./core-source/chain-manifest.json
COPY public/ ./public/
LABEL io.hass.name="Doodle Tick Keeper" io.hass.description="Private Doodleverse Keeper" \
      io.hass.type="addon" io.hass.version="0.18b" io.hass.arch="${BUILD_ARCH}"
LABEL org.opencontainers.image.source="https://github.com/moswald14/doodletick"
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:8099/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "main.mjs"]
