#include <SoftwareSerial.h>

SoftwareSerial sim800(2, 3); // RX, TX

const char ussdCode[] = "*143#";

String incomingBuffer    = "";
String serialInputBuffer = "";
bool expectingSMSBody    = false;
bool isRegistered        = false; // ← gate flag

// ----------------------------
// SEND AT COMMAND HELPER
// ----------------------------
void sendAT(const char* cmd, int waitMs = 500) {
  sim800.println(cmd);
  delay(waitMs);
}

// ----------------------------
// INIT MODEM
// ----------------------------
void initModem() {
  Serial.println("[INFO] Resetting modem radio...");
  sendAT("AT+CFUN=0", 7000); // full radio off
  sendAT("AT+CFUN=1", 3000); // full radio on — forces fresh network search
  sendAT("AT");
  sendAT("ATE0");               // disable echo
  sendAT("AT+CMGF=1");          // text mode SMS
  sendAT("AT+CNMI=2,2,0,0,0"); // route incoming SMS to serial
  sendAT("AT+CSCS=\"GSM\"");    // GSM character set
  sendAT("AT+CREG=1");          // enable unsolicited +CREG reports
}

// ----------------------------
// POLL REGISTRATION
// Actively asks for status and prints details
// ----------------------------
void pollRegistration() {
  Serial.println("\n[INFO] Checking registration...");
  sendAT("AT+CREG?", 300);
  sendAT("AT+CSQ",   300);
  sendAT("AT+COPS?", 300);
}

// ----------------------------
// SETUP
// ----------------------------
void setup() {
  Serial.begin(9600);
  sim800.begin(9600);

  delay(3000);

  Serial.println("=================================");
  Serial.println("     SIM800L Serial Debugger     ");
  Serial.println("=================================");

  initModem();

  Serial.println("[INFO] Waiting for network registration...");
  Serial.println("[INFO] All commands locked until registered.\n");
}

// ----------------------------
// LOOP
// ----------------------------

unsigned long lastPollTime = 0;
const unsigned long POLL_INTERVAL = 5000; // poll every 5 seconds until registered

void loop() {

  // READ FROM SIM800L
  while (sim800.available()) {
    char c = sim800.read();
    incomingBuffer += c;
    if (c == '\n') {
      parseSIMResponse(incomingBuffer);
      incomingBuffer = "";
    }
  }

  // ── REGISTRATION GATE ──────────────────────────────────────────────
  // If not registered yet, poll every 5s and block all user commands
  if (!isRegistered) {
    if (millis() - lastPollTime >= POLL_INTERVAL) {
      lastPollTime = millis();
      pollRegistration();
    }
    // Drain serial input but do nothing with it
    while (Serial.available()) {
      Serial.read();
    }
    return; // ← skip everything below until registered
  }
  // ──────────────────────────────────────────────────────────────────

  // READ FROM SERIAL MONITOR (only runs after registered)
  while (Serial.available()) {
    char c = Serial.read();
    Serial.write(c);
    serialInputBuffer += c;

    if (c == '\n') {
      serialInputBuffer.trim();

      if (serialInputBuffer.length() == 0) {
        serialInputBuffer = "";
        return;
      }

      Serial.println();

      if      (serialInputBuffer == "S") sendSMS();
      else if (serialInputBuffer == "B") checkBalance();
      else if (serialInputBuffer == "C") checkSignal();
      else {
        Serial.println("[TX] " + serialInputBuffer);
        sim800.println(serialInputBuffer);
      }

      serialInputBuffer = "";
    }
  }
}

// ----------------------------
// PARSER
// ----------------------------
void parseSIMResponse(String data) {
  data.trim();
  if (data.length() == 0) return;

  // READY signals — re-init radio
  if (data == "SMS Ready" || data == "Call Ready") {
    Serial.println("\n[INFO] Modem ready signal — reinitializing...");
    isRegistered = false; // ← drop back to gate until re-registered
    delay(500);
    initModem();
    return;
  }

  // NETWORK REGISTRATION ← most important parser block
  if (data.startsWith("+CREG:")) {
    int comma = data.indexOf(',');
    int stat  = (comma != -1)
                ? data.substring(comma + 1).toInt()
                : data.substring(7).toInt();

    Serial.print("\n[Network] ");
    switch (stat) {
      case 0:
        Serial.println("Not registered — idle");
        isRegistered = false;
        break;
      case 1:
        Serial.println("Registered (home) ✔");
        isRegistered = true;
        onRegistered();  // ← fires once when we get in
        break;
      case 2:
        Serial.println("Searching for network...");
        isRegistered = false;
        break;
      case 3:
        Serial.println("Registration denied ✘");
        isRegistered = false;
        break;
      case 5:
        Serial.println("Registered (roaming) ✔");
        isRegistered = true;
        onRegistered();
        break;
      default:
        Serial.println(data);
        isRegistered = false;
    }
    return;
  }

  // SIGNAL
  if (data.startsWith("+CSQ:")) {
    int comma = data.indexOf(',');
    int rssi  = data.substring(6, comma).toInt();

    Serial.print("[Signal] RSSI: ");
    Serial.print(rssi);

    if (rssi == 0 || rssi == 99) {
      Serial.println(" — No signal");
    } else {
      int dBm = -113 + (rssi * 2);
      Serial.print(" → ");
      Serial.print(dBm);
      Serial.println(" dBm");
    }
    return;
  }

  // CARRIER
  if (data.startsWith("+COPS:")) {
    int q1 = data.indexOf('"');
    int q2 = data.indexOf('"', q1 + 1);

    Serial.print("[Carrier] ");
    if (q1 != -1 && q2 != -1)
      Serial.println(data.substring(q1 + 1, q2));
    else
      Serial.println("Not locked yet");
    return;
  }

  // SIM PIN STATUS
  if (data.startsWith("+CPIN:")) {
    Serial.print("[SIM] ");
    Serial.println(data.substring(7));
    return;
  }

  // USSD
  if (data.startsWith("+CUSD:")) {
    int q1 = data.indexOf('"');
    int q2 = data.indexOf('"', q1 + 1);

    Serial.println("\n[USSD]");
    if (q1 != -1 && q2 != -1)
      Serial.println(data.substring(q1 + 1, q2));
    else
      Serial.println(data);
    return;
  }

  // SMS HEADER
  if (data.startsWith("+CMT:")) {
    Serial.println("\n===== NEW SMS =====");

    int q1 = data.indexOf('"');
    int q2 = data.indexOf('"', q1 + 1);

    if (q1 != -1 && q2 != -1) {
      Serial.print("From: ");
      Serial.println(data.substring(q1 + 1, q2));
    }

    expectingSMSBody = true;
    return;
  }

  // SMS BODY
  if (expectingSMSBody) {
    Serial.print("Msg : ");
    Serial.println(data);
    Serial.println("===================\n");
    expectingSMSBody = false;
    return;
  }

  // OK — suppress during registration polling to keep output clean
  if (data == "OK") return;

  // ERRORS
  if (data == "ERROR" ||
      data.startsWith("+CMS ERROR") ||
      data.startsWith("+CME ERROR")) {
    Serial.println("[ERROR] " + data);
    return;
  }

  // DEFAULT
  Serial.println("[SIM] " + data);
}

// ----------------------------
// FIRES ONCE ON REGISTRATION
// ----------------------------
void onRegistered() {
  // Prevent firing repeatedly if +CREG: 1 keeps coming in
  static bool announced = false;
  if (announced) return;
  announced = true;

  Serial.println("\n=================================");
  Serial.println("   ✔ Network registered!");
  Serial.println("   Commands are now unlocked.");
  Serial.println("=================================");
  Serial.println("S - Send SMS");
  Serial.println("B - Check balance");
  Serial.println("C - Check signal");
  Serial.println("(or type any AT command)");
  Serial.println("---------------------------------\n");

  // Re-apply full settings now that we're on network
  sendAT("AT+CMGF=1");
  sendAT("AT+CNMI=2,2,0,0,0");
}

// ----------------------------
// SEND SMS
// ----------------------------
void sendSMS() {
  Serial.println("\n--- Sending SMS ---");

  sim800.println("AT+CMGF=1");
  delay(500);

  sim800.println("AT+CMGS=\"+639165635674\"");

  long start     = millis();
  bool gotPrompt = false;

  while (millis() - start < 5000) {
    if (sim800.available()) {
      char c = sim800.read();
      Serial.write(c);
      if (c == '>') {
        gotPrompt = true;
        break;
      }
    }
  }

  if (!gotPrompt) {
    Serial.println("\n[ERROR] No '>' prompt");
    return;
  }

  delay(100);
  sim800.print("This is my replyyy");
  delay(100);
  sim800.write(26); // CTRL+Z

  Serial.println("\n[INFO] SMS sent command issued");
}

// ----------------------------
// BALANCE
// ----------------------------
void checkBalance() {
  Serial.println("\n--- USSD ---");
  sim800.print("AT+CUSD=1,\"");
  sim800.print(ussdCode);
  sim800.println("\",15");
}

// ----------------------------
// SIGNAL
// ----------------------------
void checkSignal() {
  Serial.println("\n--- Signal ---");
  sim800.println("AT+CSQ");
}