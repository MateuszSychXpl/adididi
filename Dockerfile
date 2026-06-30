# Adididi vs Koszty Azure — zero-zależnościowy serwer Node.
FROM node:20-alpine

WORKDIR /app

# Brak zależności — kopiujemy tylko to, co potrzebne do uruchomienia.
COPY package.json ./
COPY server.js ./
COPY public ./public

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
