# WhatsApp MCP Server (TypeScript/Baileys) — Forked

A fork of [jlucaso1/whatsapp-mcp-ts](https://github.com/jlucaso1/whatsapp-mcp-ts) with critical bug fixes for group messages, WhatsApp LID format support, and improved message parsing.

For full setup instructions, architecture, and general usage, see the [upstream README](https://github.com/jlucaso1/whatsapp-mcp-ts/blob/main/README.md). This fork is a drop-in replacement — same setup, same tools, fewer bugs.

## Quick Start

```bash
git clone https://github.com/psufka/whatsapp-mcp-ts-forked.git
cd whatsapp-mcp-ts-forked
npm install
node src/main.ts  # Scan QR code with WhatsApp on first run
```

**Node.js 23.10+** required (built-in TypeScript and SQLite support).

**Claude Code / Claude Desktop config** (`~/.claude.json` or `claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["/absolute/path/to/whatsapp-mcp-ts-forked/src/main.ts"]
    }
  }
}
```

## What's Fixed

### 1. Group messages enabled
The upstream code had `shouldIgnoreJid: (jid) => isJidGroup(jid)` which silently filtered out **all** group messages. Disabled to allow group chat syncing.

### 2. `storeChat` stores "undefined" string ([upstream #14](https://github.com/jlucaso1/whatsapp-mcp-ts/issues/14))
When `conversationTimestamp` was missing, `String(undefined)` produced the literal string `"undefined"` in the database — corrupting ~45% of chat records and breaking sort order. Non-Date values now coerce to `NULL`. An idempotent migration cleans existing corrupted data on startup.

### 3. WhatsApp LID format support ([upstream #15](https://github.com/jlucaso1/whatsapp-mcp-ts/issues/15))
Recent WhatsApp versions assign Linked IDs (`xxxxx@lid`) instead of phone JIDs (`number@s.whatsapp.net`). Contacts arrive as phone JIDs but chats are stored under LIDs, breaking all lookups.

**Fix:** New `jid_mapping` table maps phone JIDs ↔ LIDs. Mappings captured from history sync, `chats.phoneNumberShare` events, and contact updates. All MCP tools resolve JIDs through the mapping before querying.

### 4. Message parser fallback
The original parser handled only 9 message types (text, image, video, doc, audio, sticker, location, contact, poll). Everything else — reactions, group invites, buttons, edits, forwards — was silently dropped.

**Fix:** Unhandled types are now stored as `[typeName]` (e.g., `[reactionMessage]`, `[groupInviteMessage]`). Protocol/signal messages with no user-facing content are still filtered.

### 5. Logging — `console` replaced with pino ([upstream #10](https://github.com/jlucaso1/whatsapp-mcp-ts/pull/10))
`console.error()` in `database.ts` could corrupt the MCP JSON-RPC stream on stdout. All console calls replaced with structured pino logging via dependency injection.

### 6. JID normalization in MCP tools
`list_messages`, `get_chat`, `get_message_context`, and `search_messages` now normalize input JIDs before querying. Previously only `send_message` normalized.

### 7. Real-time contact sync
Contacts previously only synced during the initial history scan. Added `contacts.upsert` and `contacts.update` event handlers for real-time updates. LID mappings are also captured from contact events.

### 8. WAL checkpoint on shutdown
SQLite WAL wasn't checkpointed on shutdown, causing data loss when the process was killed. `closeDatabase()` now runs `PRAGMA wal_checkpoint(TRUNCATE)` before closing.

### 9. Updated `db_schema` resource
The MCP schema resource now includes all tables (`chats`, `messages`, `contacts`, `jid_mapping`).

### 10. Own messages recognized via LID matching
Messages sent from the phone app in group chats showed `is_from_me: false` because the sender LID didn't match the authenticated user's phone JID. Now captures the user's phone JID + LID on connection open and checks sender against both when determining `is_from_me`.

### 11. Security: QR code data no longer sent to third-party services
The upstream code sends WhatsApp pairing QR data to `quickchart.io` as a GET parameter (`open(\`https://quickchart.io/qr?text=...\`)`). This leaks cryptographic handshake material (Noise protocol keys, identity keys) to a third-party server's access logs during every pairing attempt.

**Fix:** Replaced with `qrcode-terminal` — QR codes render locally in the terminal with zero network calls. The `open` package (which launched browsers) has been removed entirely.

### 12. Security: credentials and data stored outside cloud-synced directories
Auth credentials (`auth_info/`) and message database (`data/`) default to `~/.local/share/whatsapp-mcp-ts/` instead of relative to the repo directory. This prevents accidental sync of WhatsApp session keys and plaintext messages to Dropbox, iCloud, or other cloud storage.

Configurable via environment variables: `WHATSAPP_AUTH_DIR`, `WHATSAPP_DATA_DIR`.

### 13. Security: log files moved and sensitive fields redacted
Log files now write to `~/.local/share/whatsapp-mcp-ts/logs/` (not the working directory). Default log level changed from `info` to `warn`. QR code data fields are redacted via pino's `redact` option even at verbose log levels.

## Database Schema

```
TABLE chats (jid TEXT PK, name TEXT, last_message_time TIMESTAMP)
TABLE messages (id TEXT, chat_jid TEXT, sender TEXT, content TEXT, timestamp TIMESTAMP, is_from_me BOOLEAN, PK(id, chat_jid))
TABLE contacts (jid TEXT PK, name TEXT, notify TEXT, phone_number TEXT)
TABLE jid_mapping (phone_jid TEXT, lid_jid TEXT, updated_at TIMESTAMP, PK(phone_jid, lid_jid))
```

## MCP Tools

Same as upstream — `search_contacts`, `list_messages`, `list_chats`, `get_chat`, `get_message_context`, `send_message`, `search_messages`.

## Credits

- Upstream: [jlucaso1/whatsapp-mcp-ts](https://github.com/jlucaso1/whatsapp-mcp-ts)
- Issues [#14](https://github.com/jlucaso1/whatsapp-mcp-ts/issues/14) and [#15](https://github.com/jlucaso1/whatsapp-mcp-ts/issues/15) reported by [@theflysurfer](https://github.com/theflysurfer)
- Logging fix approach from [PR #10](https://github.com/jlucaso1/whatsapp-mcp-ts/pull/10) by [@Kekius18](https://github.com/Kekius18)
- Go + Python alternative: [lharries/whatsapp-mcp](https://github.com/lharries/whatsapp-mcp)

## License

ISC (same as upstream).
