FROM node:20-bookworm-slim

WORKDIR /app

# dépendances système nécessaires à bcrypt
RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# ⬇️ bcrypt est compilé ICI pour la bonne arch
RUN npm ci

COPY . .

EXPOSE 2111
CMD ["npm", "run", "dev"]
