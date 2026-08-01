FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates curl git openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY package*.json ./
RUN npm install \
    && npm install --global eas-cli@latest \
    && npm install --global supabase@latest

COPY . .
RUN chmod +x docker/*.sh

ENTRYPOINT ["bash", "docker/entrypoint.sh"]
CMD ["help"]
