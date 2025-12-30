FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache bash

EXPOSE 3000

CMD ["npm", "run", "dev"]
