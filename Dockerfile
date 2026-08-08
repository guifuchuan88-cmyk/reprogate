FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY index.html ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY scripts/serve.mjs ./scripts/serve.mjs
ENV PORT=8080
ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["npm", "run", "start"]
