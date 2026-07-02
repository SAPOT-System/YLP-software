# dev-logging

## Description

Reference for working with the Sapot development logging system. Covers how to access the daily log file on-device, how to clear it, and how to use the dev laptop log collector during active development. This is a debugging and developer-experience reference — it does not affect how production code should be written.

## Usage

Invoke this skill when:
- The user wants to read or retrieve the app's log output
- The user asks how to stream logs to their laptop during development
- The user asks how to clear logs or find the log file path
- Debugging a problem that requires reading raw log output from a device

Do **not** use this skill to decide how to add logging to new code — that is covered by the Logging section of CLAUDE.md (`features/shared/utils/logger.ts`, named scopes, `EXPO_PUBLIC_ENABLED_LOG_MODULES`).

## Log File (On-Device)

The app writes a daily log file named `sapot-{date-today}.log` inside the app's document directory.

**Always on in production.** In development, opt in via:

```bash
EXPO_PUBLIC_LOG_TO_FILE=1
```

### Accessing the log file from code

```typescript
import { getLogFilePath, clearLogFile } from '@/features/shared/utils/logger'

// Get the absolute path to today's log file
const path = getLogFilePath()

// Clear today's log file
await clearLogFile()
```

### Retrieving the file from a device

Use the path returned by `getLogFilePath()` with `expo-file-system` or share it via `expo-sharing`. Example:

```typescript
import * as Sharing from 'expo-sharing'
import { getLogFilePath } from '@/features/shared/utils/logger'

await Sharing.shareAsync(getLogFilePath())
```

## Dev Laptop Collector

During development, the app can stream logs in real time to a collector running on the connected laptop. Each Metro dev client (by port) gets its own log file.

**Start the collector on the laptop:**

```bash
npm run log-server
```

Log files are written to:

```
dev-logs/dev-<metroPort>.log
```

**On by default in development.** Disable via:

```bash
EXPO_PUBLIC_LOG_TO_LAPTOP=0
```

Full environment variable documentation: `docs/ENV_CONFIG.md`.

## Expected Output

When the user asks "how do I see the app logs on my laptop?":
→ Tell them to run `npm run log-server` on the laptop, then start the app. Logs appear in `dev-logs/dev-<metroPort>.log`.

When the user asks "how do I get the log file off the device?":
→ Call `getLogFilePath()` from `features/shared/utils/logger.ts` to get the path, then use `expo-sharing` or `expo-file-system` to retrieve it.

When the user asks "how do I clear the logs?":
→ Call `clearLogFile()` from the same logger module.
