// Database initialization script
// Usage: npm run db:init
// Or with Neon MCP: Run the SQL from scripts/init-db.sql

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { join } from "path";

async function initDb() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not set in environment");
    console.log("\nTo initialize the database:");
    console.log("1. Add DATABASE_URL to your .env file");
    console.log("2. Or use Neon MCP to run the SQL from scripts/init-db.sql");
    console.log("\nGet your connection string from: https://console.neon.tech");
    process.exit(1);
  }

  console.log("🔄 Initializing database schema...\n");

  try {
    const sql = neon(databaseUrl);
    
    // Read and execute the SQL file
    const sqlFile = readFileSync(
      join(process.cwd(), "scripts", "init-db.sql"),
      "utf-8"
    );

    // Split SQL into statements (simple split by semicolon)
    const statements = sqlFile
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--"));

    for (const statement of statements) {
      const cleanStatement = statement.replace(/\n/g, " ").trim();
      if (cleanStatement) {
        console.log(`  → ${cleanStatement.substring(0, 60)}...`);
        await sql`${cleanStatement}`;
      }
    }

    console.log("\n✅ Database initialized successfully!");
    console.log("\nTables created:");
    console.log("  • candidate_match_analyses");
    console.log("  • candidate_match_requirements");
    console.log("  • candidate_match_audit_logs");
    console.log("\nIndexes created for common queries.");
    
  } catch (error) {
    console.error("\n❌ Failed to initialize database:");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

initDb();
