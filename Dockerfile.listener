FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

# Run the listener using the script defined in package.json
# It uses tsx so it should work fine with types
CMD ["pnpm", "start:listener"]
