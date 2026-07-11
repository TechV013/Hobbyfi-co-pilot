export function validateEnv(): void {
  const required = ["DATABASE_URL", "JWT_SECRET"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  if (
    process.env.JWT_SECRET === "hobbyfi-dev-jwt-secret-change-in-production" &&
    process.env.NODE_ENV === "production"
  ) {
    console.error("FATAL: JWT_SECRET must be changed in production");
    process.exit(1);
  }

  if (!process.env.PORT) {
    process.env.PORT = "4000";
  }
}
