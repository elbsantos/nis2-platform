import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const dbUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
if (!dbUrl) throw new Error("DATABASE_URL or MYSQL_URL is required");

export default defineConfig({
  schema: "./database/schema.ts",
  out: "./database/migrations",
  dialect: "mysql",
  dbCredentials: {
    url: dbUrl,
  },
  verbose: true,
  strict: true,
});
