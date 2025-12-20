import { createSwaggerSpec } from "next-swagger-doc";

export const getApiDocs = () => {
  const spec = createSwaggerSpec({
    apiFolder: "src/app/api",
    definition: {
      openapi: "3.0.0",
      info: {
        title: "Polyswap API",
        version: "1.0.0",
        description:
          "API for Polyswap - Decentralized prediction market order management with CoW Protocol integration",
      },
      servers: [
        {
          url: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
          description: "API Server",
        },
      ],
      tags: [
        { name: "Health", description: "Health check endpoints" },
        { name: "Markets", description: "Polymarket markets data" },
        { name: "Orders", description: "Polyswap order management" },
        { name: "Quote", description: "CoW Protocol swap quotes" },
        { name: "Tokens", description: "Token information and prices" },
      ],
      components: {
        schemas: {
          Market: {
            type: "object",
            properties: {
              condition_id: { type: "string" },
              question: { type: "string" },
              slug: { type: "string" },
              category: { type: "string" },
              volume: { type: "number" },
              liquidity: { type: "number" },
              clob_token_ids: { type: "array", items: { type: "string" } },
              options: { type: "array", items: { type: "string" } },
              image: { type: "string" },
              end_date_iso: { type: "string", format: "date-time" },
            },
          },
          Order: {
            type: "object",
            properties: {
              id: { type: "integer" },
              order_hash: { type: "string" },
              owner: { type: "string" },
              status: {
                type: "string",
                enum: ["pending", "active", "filled", "cancelled", "expired"],
              },
              created_at: { type: "string", format: "date-time" },
              side: { type: "string", enum: ["buy", "sell"] },
              outcome: { type: "string" },
              amount: { type: "string" },
              price: { type: "number" },
            },
          },
          Error: {
            type: "object",
            properties: {
              success: { type: "boolean", example: false },
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
  });
  return spec;
};
