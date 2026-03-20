import { pino } from "pino";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { initializeDatabase, closeDatabase } from "./database.ts";
import { startWhatsAppConnection, type WhatsAppSocket } from "./whatsapp.ts";
import { startMcpServer } from "./mcp.ts";

const logDir = process.env.WHATSAPP_MCP_DATA_DIR || path.join(os.homedir(), ".local", "share", "whatsapp-mcp-ts", "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const waLogger = pino(
  {
    level: process.env.LOG_LEVEL || "warn",
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: ['qrCodeData', 'qr'],
  },
  pino.destination(path.join(logDir, "wa-logs.txt"))
);

const mcpLogger = pino(
  {
    level: process.env.LOG_LEVEL || "warn",
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination(path.join(logDir, "mcp-logs.txt"))
);

async function main() {
  mcpLogger.info("Starting WhatsApp MCP Server...");

  let whatsappSocket: WhatsAppSocket | null = null;

  try {
    mcpLogger.info("Initializing database...");
    initializeDatabase(waLogger);
    mcpLogger.info("Database initialized successfully.");

    mcpLogger.info("Attempting to connect to WhatsApp...");
    whatsappSocket = await startWhatsAppConnection(waLogger);
    mcpLogger.info("WhatsApp connection process initiated.");
  } catch (error: any) {
    mcpLogger.fatal(
      { err: error },
      "Failed during initialization or WhatsApp connection attempt"
    );

    process.exit(1);
  }

  try {
    mcpLogger.info("Starting MCP server...");
    await startMcpServer(whatsappSocket, mcpLogger, waLogger);
    mcpLogger.info("MCP Server started and listening.");
  } catch (error: any) {
    mcpLogger.fatal({ err: error }, "Failed to start MCP server");
    process.exit(1);
  }

  mcpLogger.info("Application setup complete. Running...");
}

async function shutdown(signal: string) {
  mcpLogger.info(`Received ${signal}. Shutting down gracefully...`);

  closeDatabase();

  waLogger.flush();
  mcpLogger.flush();

  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((error) => {
  mcpLogger.fatal({ err: error }, "Unhandled error during application startup");
  waLogger.flush();
  mcpLogger.flush();
  process.exit(1);
});
