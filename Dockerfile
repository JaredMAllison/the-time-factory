FROM node:20-slim
WORKDIR /app
COPY . /app
RUN npm ci --only=production
EXPOSE 8000
CMD ["node", "server.js"]