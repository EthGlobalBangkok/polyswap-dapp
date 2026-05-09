FROM node:24.14-alpine

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@11.0.0 --activate

COPY . .

# tree-sitter (transitive via swagger-ui-react) ships C source and runs
# node-gyp during install — needs Python + a C++ toolchain on Alpine.
# Drop the toolchain again after install to keep the runtime image lean.
RUN source .env \
    && apk add --no-cache --virtual .build-deps python3 make g++ \
    && pnpm install --frozen-lockfile \
    && apk del .build-deps

# Run the listener using the script defined in package.json
# It uses tsx so it should work fine with types
CMD ["pnpm", "start:listener"]
