import { db } from "@/lib/db";

const SESSION_KEY = "chat_session_active";

export function initSessionCleanup() {
  if (typeof window === "undefined") return;

  // Mark session active
  sessionStorage.setItem(SESSION_KEY, "true");

  const clearDatabase = async () => {
    try {
      console.log("Clearing Dexie session database...");
      await db.delete();
      console.log("Dexie database cleared");
    } catch (err) {
      console.error("Failed clearing DB:", err);
    }
  };

  // Browser/tab closed
  window.addEventListener("beforeunload", () => {
    sessionStorage.removeItem(SESSION_KEY);
  });

  // Fresh tab opened after old session died
  window.addEventListener("load", async () => {
    const active = sessionStorage.getItem(SESSION_KEY);

    if (!active) {
      await clearDatabase();
      sessionStorage.setItem(SESSION_KEY, "true");
    }
  });

  return clearDatabase;
}
