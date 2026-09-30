# Build the small practice film once. No render tools or voice engine enter runtime.
FROM node:22-bookworm-slim AS rehearsal-media
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pil ffmpeg espeak-ng fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY scripts/build_rehearsal.py scripts/build_rehearsal.py
COPY apps/web/public/rehearsal/episode.json apps/web/public/rehearsal/episode.json
COPY apps/web/public/bg-media/bourbon-games.png apps/web/public/bg-media/bourbon-games.png
COPY apps/web/public/bg-media/mixx-tank.png apps/web/public/bg-media/mixx-tank.png
RUN python3 scripts/build_rehearsal.py

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DB_PATH=/app/data/mixxpro.sqlite
COPY --chown=node:node package.json ./
COPY --chown=node:node apps ./apps
COPY --from=rehearsal-media --chown=node:node /build/apps/web/public/rehearsal/ ./apps/web/public/rehearsal/
COPY --chown=node:node packages ./packages
COPY --chown=node:node scripts ./scripts
RUN mkdir /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","--experimental-sqlite","apps/server/main.mjs"]
