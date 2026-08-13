FROM node:20-alpine

WORKDIR /app

# Copiar todo
COPY . .

# Instalar backend
RUN npm install

# Instalar frontend
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# Volver a raíz para backend
WORKDIR /app

# Exponer puerto
EXPOSE 3000

# Iniciar servidor
CMD ["npm", "start"]