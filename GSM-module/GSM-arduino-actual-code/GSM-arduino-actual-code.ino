/**
 * SAPOT GSM Bridge Firmware — FIXED NETWORK REGISTRATION
 * Stable for SIM800L + Arduino Uno/Nano
 *
 * FIXES APPLIED:
 * 1. Removed destructive serial flushes
 * 2. Removed re-init loop on "SMS Ready"/"Call Ready"
 * 3. Simplified registration polling
 * 4. Reduced SoftwareSerial overload
 * 5. Increased modem settle delays
 * 6. Reduced unnecessary logging during registration
 */

#include <SoftwareSerial.h>

// ── Version (tracked by GSM-module/scripts/set_version.py, tag gsm/vX.Y.Z) ────
#define FIRMWARE_VERSION "0.1.1"

// ── Pins / baud ───────────────────────────────────────────────────────────────
#define GSM_RX_PIN   2
#define GSM_TX_PIN   3
#define GSM_RST_PIN  4
#define GSM_BAUD     9600
#define PC_BAUD      9600

// ── Timing ────────────────────────────────────────────────────────────────────
#define POLL_MS       5000UL
#define HB_MS        20000UL
#define SMS_TIMEOUT  15000UL
#define MAX_RESETS       5

// ── Buffers ───────────────────────────────────────────────────────────────────
#define GSM_BUF  128
#define PC_BUF   200
#define NUM_BUF   20

SoftwareSerial gsm(GSM_RX_PIN, GSM_TX_PIN);

// ── State ─────────────────────────────────────────────────────────────────────
static bool registered = false;
static bool ready      = false;
static bool regOnce    = false;
static bool inBody     = false;
static int8_t cmgrIdx = -1;

static uint8_t resets = 0;
static bool needsInit  = false;

static unsigned long lastPoll = 0;
static unsigned long lastHB   = 0;

// ── Buffers ───────────────────────────────────────────────────────────────────
static char gsmBuf[GSM_BUF];
static uint8_t gsmLen = 0;

static char pcBuf[PC_BUF];
static uint8_t pcLen = 0;

static char sender[NUM_BUF];

// =============================================================================
// HELPERS
// =============================================================================

static void emitRaw(const char* s) {
  Serial.println(s);
}

static void emitLog(const __FlashStringHelper* s) {
  Serial.print(F("LOG|"));
  Serial.println(s);
}

static void sendAT(const __FlashStringHelper* cmd, uint16_t waitMs = 500) {
  gsm.println(cmd);
  delay(waitMs);
}

// IMPORTANT:
// NO MORE FLUSHING GSM BUFFER
static bool sendATExpect(
  const __FlashStringHelper* cmd,
  const char* expected,
  uint16_t timeoutMs = 3000
) {

  gsm.println(cmd);

  char resp[80];
  uint8_t len = 0;

  uint32_t start = millis();

  while (millis() - start < timeoutMs) {

    while (gsm.available()) {

      char c = gsm.read();

      if (c == '\r') continue;

      if (len < sizeof(resp) - 1) {
        resp[len++] = c;
      }

      resp[len] = '\0';

      if (strstr(resp, expected)) {
        return true;
      }

      if (strstr(resp, "ERROR")) {
        return false;
      }
    }
  }

  return false;
}

// =============================================================================
// FORWARD DECLARATIONS
// =============================================================================

static void initModem();
static void pollReg();
static void processGSMLine();
static void processPCLine();
static void onRegistered();
static void applySettings();
static void hardReset();
static void doSendSMS(const char* num, const char* body);
static void heartbeat();

// =============================================================================
// SETUP
// =============================================================================

void setup() {

  Serial.begin(PC_BAUD);
  gsm.begin(GSM_BAUD);

  pinMode(GSM_RST_PIN, OUTPUT);
  digitalWrite(GSM_RST_PIN, HIGH);

  delay(5000);

  emitLog(F("SAPOT bridge starting"));

  initModem();
}

// =============================================================================
// LOOP
// =============================================================================

void loop() {

  if (needsInit) {
    needsInit = false;
    initModem();
    return;
  }

  // ── Read GSM serial ──────────────────────────────────────────────────────
  while (gsm.available()) {

    char c = gsm.read();

    if (c == '\r') continue;

    if (c == '\n') {

      while (gsmLen > 0 && gsmBuf[gsmLen - 1] == ' ') {
        gsmLen--;
      }

      gsmBuf[gsmLen] = '\0';

      if (gsmLen > 0) {
        processGSMLine();
      }

      gsmLen = 0;
    }
    else if (gsmLen < GSM_BUF - 1) {
      gsmBuf[gsmLen++] = c;
    }
  }

  // ── Registration gate ────────────────────────────────────────────────────
  if (!registered) {

    if (millis() - lastPoll >= POLL_MS) {

      lastPoll = millis();

      pollReg();
    }

    while (Serial.available()) {
      Serial.read();
    }

    return;
  }

  // ── Read PC serial ───────────────────────────────────────────────────────
  while (Serial.available()) {

    char c = Serial.read();

    if (c == '\r') continue;

    if (c == '\n') {

      pcBuf[pcLen] = '\0';

      if (pcLen > 0) {
        processPCLine();
      }

      pcLen = 0;
    }
    else if (pcLen < PC_BUF - 1) {
      pcBuf[pcLen++] = c;
    }
  }

  // ── Heartbeat ────────────────────────────────────────────────────────────
  if (ready && millis() - lastHB >= HB_MS) {

    lastHB = millis();

    heartbeat();
  }
}

// =============================================================================
// INIT
// =============================================================================

static void initModem() {

  registered = false;
  ready      = false;
  regOnce    = false;

  emitLog(F("INIT handshake"));

  if (!sendATExpect(F("AT"), "OK", 5000)) {

    emitLog(F("INIT no modem response"));

    hardReset();

    return;
  }

  sendAT(F("ATE0"));

  emitLog(F("INIT radio cycle"));

  // LONGER DELAYS
  sendAT(F("AT+CFUN=0"), 10000);
  sendAT(F("AT+CFUN=1"), 10000);

  // Re-apply after CFUN soft reset (modem defaults echo back on)
  sendAT(F("ATE0"));

  emitLog(F("INIT SIM"));

  if (!sendATExpect(F("AT+CPIN?"), "READY", 5000)) {

    emitRaw("SIM_MISSING");

    hardReset();

    return;
  }

  // Apply text mode early so any SMS stored before registration uses text format
  sendAT(F("AT+CMGF=1"));
  sendAT(F("AT+CSCS=\"GSM\""));
  sendAT(F("AT+CREG=1"));

  emitLog(F("INIT waiting network"));

  lastPoll = millis() - POLL_MS;
}

// =============================================================================
// POLL
// =============================================================================

// IMPORTANT:
// REMOVED AT+COPS?
// REMOVED AT+CSQ DURING REGISTRATION
static void pollReg() {

  gsm.println(F("AT+CREG?"));

  delay(500);
}

// =============================================================================
// REGISTERED
// =============================================================================

static void onRegistered() {

  if (regOnce) return;

  regOnce = true;

  emitLog(F("NET registered"));

  applySettings();

  ready  = true;
  resets = 0;

  emitRaw("GSM_READY");
  emitRaw("NETWORK_OK");
}

static void applySettings() {

  sendAT(F("ATE0"));
  sendAT(F("AT+CMGF=1"));
  sendAT(F("AT+CNMI=2,2,0,0,0"));

  sendAT(F("AT+CMGDA=\"DEL ALL\""), 5000);
}

// =============================================================================
// HARD RESET
// =============================================================================

static void hardReset() {

  registered = false;
  ready      = false;

  resets++;

  if (resets > MAX_RESETS) {

    emitLog(F("HALT max resets"));

    while (true) {
      delay(60000);
    }
  }

  Serial.print(F("LOG|RST "));
  Serial.println(resets);

  digitalWrite(GSM_RST_PIN, LOW);
  delay(1000);

  digitalWrite(GSM_RST_PIN, HIGH);
  delay(8000);

  needsInit = true;
}

// =============================================================================
// GSM PARSER
// =============================================================================

static void processGSMLine() {

  const char* line = gsmBuf;

  // DEBUG
  // Serial.print(F("LOG|RAW "));
  // Serial.println(line);

  // IMPORTANT:
  // DO NOT REINIT HERE
  if (
    strcmp(line, "SMS Ready") == 0 ||
    strcmp(line, "Call Ready") == 0
  ) {
    emitLog(F("MODEM READY"));
    return;
  }

  // ── REGISTRATION ─────────────────────────────────────────────────────────
  if (strncmp(line, "+CREG:", 6) == 0) {

    const char* p = strchr(line, ',');

    int stat = p
      ? atoi(p + 1)
      : atoi(line + 7);

    switch (stat) {

      case 1:
      case 5:

        if (!registered) {

          registered = true;

          emitLog(
            stat == 1
              ? F("NET HOME")
              : F("NET ROAMING")
          );

          onRegistered();
        }

        break;

      case 0:

        registered = false;
        ready      = false;
        regOnce    = false;

        emitLog(F("NET IDLE"));

        break;

      case 2:

        emitLog(F("NET SEARCH"));

        break;

      case 3:

        regOnce = false;

        emitLog(F("NET DENIED"));

        break;
    }

    return;
  }

  // ── SIGNAL ───────────────────────────────────────────────────────────────
  if (strncmp(line, "+CSQ:", 5) == 0) {

    int rssi = atoi(line + 5);

    Serial.print(F("LOG|SIG "));
    Serial.println(rssi);

    return;
  }

  // ── SMS HEADER (direct delivery) ─────────────────────────────────────────
  if (strncmp(line, "+CMT:", 5) == 0) {

    const char* q1 = strchr(line, '"');
    const char* q2 = q1 ? strchr(q1 + 1, '"') : nullptr;

    if (q1 && q2) {

      uint8_t len = q2 - q1 - 1;

      if (len >= NUM_BUF) {
        len = NUM_BUF - 1;
      }

      memcpy(sender, q1 + 1, len);
      sender[len] = '\0';
      inBody = true;
    }
    // malformed +CMT: — do not set inBody to avoid treating next line as SMS body

    return;
  }

  // ── SMS STORED IN SIM (+CMTI) ─────────────────────────────────────────────
  if (strncmp(line, "+CMTI:", 6) == 0) {

    const char* p = strrchr(line, ',');

    if (p) {
      cmgrIdx = (int8_t)atoi(p + 1);
      gsm.print(F("AT+CMGR="));
      gsm.println(cmgrIdx);
    }

    return;
  }

  // ── READ STORED SMS HEADER (+CMGR response) ───────────────────────────────
  if (strncmp(line, "+CMGR:", 6) == 0) {

    // Format: +CMGR: "REC UNREAD","+63917...",,...
    // Sender is the 2nd quoted string (after status field)
    const char* q1 = strchr(line, '"');
    const char* q2 = q1 ? strchr(q1 + 1, '"') : nullptr;   // end of status
    const char* q3 = q2 ? strchr(q2 + 1, '"') : nullptr;   // start of number
    const char* q4 = q3 ? strchr(q3 + 1, '"') : nullptr;   // end of number

    if (q3 && q4) {
      uint8_t len = (uint8_t)(q4 - q3 - 1);
      if (len >= NUM_BUF) len = NUM_BUF - 1;
      memcpy(sender, q3 + 1, len);
      sender[len] = '\0';
    }
    else {
      sender[0] = '\0';
    }

    inBody = true;   // body follows on next line — reuse existing read path

    return;
  }

  // ── SMS BODY ─────────────────────────────────────────────────────────────
  if (inBody) {

    inBody = false;

    for (char* p = gsmBuf; *p; p++) {
      if (*p == '|') *p = '/';
    }

    Serial.print(F("SMS_RECEIVED|"));
    Serial.print(sender);
    Serial.print('|');
    Serial.println(gsmBuf);

    if (cmgrIdx >= 0) {
      gsm.print(F("AT+CMGD="));
      gsm.println(cmgrIdx);
      cmgrIdx = -1;
    }

    return;
  }

  // ── ERRORS ───────────────────────────────────────────────────────────────
  if (
    strcmp(line, "ERROR") == 0 ||
    strncmp(line, "+CMS ERROR", 10) == 0 ||
    strncmp(line, "+CME ERROR", 10) == 0
  ) {

    Serial.print(F("LOG|ERR "));
    Serial.println(line);

    return;
  }

  // ── SUPPRESS OK ──────────────────────────────────────────────────────────
  if (strcmp(line, "OK") == 0) {
    return;
  }

  // ── PASSTHROUGH ──────────────────────────────────────────────────────────
  Serial.print(F("LOG|SIM "));
  Serial.println(line);
}

// =============================================================================
// PC COMMANDS
// =============================================================================

static void processPCLine() {

  if (strncmp(pcBuf, "SEND_SMS|", 9) != 0) {

    emitLog(F("CMD unknown"));

    return;
  }

  char* sep1 = strchr(pcBuf + 9, '|');

  if (!sep1) {

    emitLog(F("CMD malformed"));

    return;
  }

  *sep1 = '\0';

  const char* num  = pcBuf + 9;
  const char* body = sep1 + 1;

  doSendSMS(num, body);
}

// =============================================================================
// SEND SMS
// =============================================================================

static void doSendSMS(const char* num, const char* body) {

  Serial.print(F("LOG|TX "));
  Serial.println(num);

  gsm.print(F("AT+CMGS=\""));
  gsm.print(num);
  gsm.println('"');

  uint32_t start = millis();

  bool gotPrompt = false;

  while (millis() - start < 5000) {

    if (gsm.available()) {

      if (gsm.read() == '>') {

        gotPrompt = true;

        break;
      }
    }
  }

  if (!gotPrompt) {

    Serial.print(F("SMS_FAILED|"));
    Serial.print(num);
    Serial.println(F("|NO_PROMPT"));

    return;
  }

  delay(100);

  gsm.print(body);

  delay(100);

  gsm.write(26);

  char resp[48];
  uint8_t len = 0;

  start = millis();

  bool sent = false;

  while (millis() - start < SMS_TIMEOUT) {

    while (gsm.available()) {

      char c = gsm.read();

      if (c == '\r') continue;

      if (len < sizeof(resp) - 1) {
        resp[len++] = c;
      }

      resp[len] = '\0';

      if (strstr(resp, "+CMGS:")) {

        sent = true;

        break;
      }

      if (strstr(resp, "ERROR")) {
        break;
      }
    }

    if (sent) break;
  }

  if (sent) {

    Serial.print(F("SMS_SENT|"));
    Serial.println(num);
  }
  else {

    Serial.print(F("SMS_FAILED|"));
    Serial.print(num);
    Serial.println(F("|TIMEOUT"));
  }
}

// =============================================================================
// HEARTBEAT
// =============================================================================

static void heartbeat() {

  gsm.println(F("AT+CREG?"));
  gsm.println(F("AT+CSQ"));
}