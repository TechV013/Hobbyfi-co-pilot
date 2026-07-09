import type { OpenAPIV3 } from "openapi-types";

export const apiSpec: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: {
    title: "HobbyFi Copilot API",
    version: "1.0.0",
    description: "AI-powered vendor copilot for member management, revenue insights, and notifications.",
  },
  servers: [{ url: "http://localhost:4000", description: "Local development" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      RevenueQueryInput: {
        type: "object",
        properties: {
          range: { type: "string", enum: ["today", "yesterday", "this_week", "this_month", "custom"] },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
        },
        required: ["range"],
      },
      UserSearchInput: {
        type: "object",
        properties: {
          sport: { type: "string" },
          membershipType: { type: "string" },
          trialOnly: { type: "boolean" },
          expiringWithinDays: { type: "integer", minimum: 1 },
          nameOrPhoneQuery: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        },
      },
      ChatRequest: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string", description: "Natural language query" },
          conversationId: { type: "string", description: "Session identifier (auto-generated if omitted)" },
        },
      },
      ChatResponse: {
        type: "object",
        properties: {
          reply: { type: "string" },
          pendingApproval: {
            type: "object",
            properties: {
              previewId: { type: "string" },
              toolName: { type: "string" },
              diff: {
                type: "object",
                properties: {
                  currentValue: { type: "object" },
                  proposedValue: { type: "object" },
                },
              },
              expiresAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
      ApproveRequest: {
        type: "object",
        required: ["previewId", "decision"],
        properties: {
          previewId: { type: "string", description: "ID from pendingApproval" },
          decision: { type: "string", enum: ["approve", "reject"] },
        },
      },
      DemoLoginRequest: {
        type: "object",
        required: ["vendorId"],
        properties: {
          vendorId: { type: "string", description: "Vendor UUID" },
        },
      },
      DemoLoginResponse: {
        type: "object",
        properties: {
          token: { type: "string" },
          vendorId: { type: "string" },
          vendorName: { type: "string" },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        tags: ["System"],
        responses: {
          "200": {
            description: "Service healthy",
            content: { "application/json": { schema: { type: "object" } } },
          },
          "503": {
            description: "Service unhealthy",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
    "/api/auth/demo-login": {
      post: {
        summary: "Demo login (bypasses real auth)",
        tags: ["Auth"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/DemoLoginRequest" } } },
        },
        responses: {
          "200": {
            description: "Login successful",
            content: { "application/json": { schema: { $ref: "#/components/schemas/DemoLoginResponse" } } },
          },
          "401": {
            description: "Invalid vendor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/copilot/chat": {
      post: {
        summary: "Send a natural language query to the copilot",
        tags: ["Copilot"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ChatRequest" } } },
        },
        responses: {
          "200": {
            description: "Copilot reply",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ChatResponse" } } },
          },
          "429": {
            description: "Rate limited",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/copilot/approve": {
      post: {
        summary: "Approve or reject a pending change",
        tags: ["Copilot"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            schema: { type: "string" },
            description: "Optional idempotency key to prevent duplicate processing",
          },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApproveRequest" } } },
        },
        responses: {
          "200": {
            description: "Decision processed",
            content: {
              "application/json": {
                schema: { type: "object", properties: { reply: { type: "string" }, status: { type: "string" } } },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
  },
};
