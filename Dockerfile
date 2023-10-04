FROM node:18.12.1
WORKDIR /app
ENV PORT 8081
COPY . .
RUN npm install
EXPOSE 8081
CMD [ "npm", "run", "start"]