import { toAppError } from "@/features/shared/core/errors";
import { database as sharedDatabase } from "@/features/shared/core/database";
import { dbLog } from "@/features/shared/core/utils/logger";
import { Q } from "@nozbe/watermelondb";
import type { Database, Model } from "@nozbe/watermelondb";

export interface DebugTableSummary {
  name: string;
  rowCount: number;
}

export interface DebugTableRow {
  id: string;
  fields: Record<string, unknown>;
}

export interface GetRowsOptions {
  limit?: number;
  offset?: number;
}

interface DebugDatabaseExport {
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

const SEED_PEER_COUNT = 5;

export class DebugDbService {
  constructor(private readonly db: Database) {}

  listTableNames(): string[] {
    return Object.keys(this.db.schema.tables);
  }

  getTableColumns(tableName: string): string[] {
    const table = this.db.schema.tables[tableName];
    return table ? Object.keys(table.columns) : [];
  }

  async getTableSummaries(): Promise<DebugTableSummary[]> {
    return Promise.all(
      this.listTableNames().map(async (name) => ({
        name,
        rowCount: await this.db.get(name).query().fetchCount(),
      }))
    );
  }

  async getRows(
    tableName: string,
    options: GetRowsOptions = {}
  ): Promise<DebugTableRow[]> {
    const clauses = [];
    if (options.offset !== undefined) clauses.push(Q.skip(options.offset));
    if (options.limit !== undefined) clauses.push(Q.take(options.limit));

    const records = await this.db.get(tableName).query(...clauses).fetch();
    return records.map((record: Model) => ({
      id: record.id,
      fields: record._raw as unknown as Record<string, unknown>,
    }));
  }

  async deleteRow(tableName: string, id: string): Promise<void> {
    try {
      await this.db.write(async () => {
        const records = await this.db
          .get(tableName)
          .query(Q.where("id", id))
          .fetch();
        const record = records[0];
        if (!record) return;
        await this.db.batch(record.prepareDestroyPermanently());
      });
      dbLog.info("debug-db › row deleted", { tableName, id });
    } catch (error) {
      const appErr = toAppError(error, "database");
      dbLog.error("debug-db › row delete failed", appErr);
      throw appErr;
    }
  }

  async resetDatabase(): Promise<void> {
    try {
      dbLog.warn("debug-db › reset requested");
      await this.db.write(async () => {
        await this.db.unsafeResetDatabase();
      });
      dbLog.info("debug-db › reset complete");
    } catch (error) {
      const appErr = toAppError(error, "database");
      dbLog.error("debug-db › reset failed", appErr);
      throw appErr;
    }
  }

  async seedPeers(count: number = SEED_PEER_COUNT): Promise<void> {
    try {
      await this.db.write(async () => {
        const ops = Array.from({ length: count }, (_, index) => {
          const suffix = `${Date.now()}-${index}`;
          return this.db.get("peers").prepareCreate((peer: Model) => {
            const raw = peer as unknown as Record<string, unknown>;
            raw.username = `debug-peer-${suffix}`;
            raw.firstName = "Debug";
            raw.lastName = `Peer ${suffix}`;
            raw.isOnline = false;
            raw.isGuest = false;
          });
        });
        await this.db.batch(...ops);
      });
      dbLog.info("debug-db › seed complete", { count });
    } catch (error) {
      const appErr = toAppError(error, "database");
      dbLog.error("debug-db › seed failed", appErr);
      throw appErr;
    }
  }

  async exportToJson(): Promise<string> {
    const tableNames = this.listTableNames();
    const tables: Record<string, Record<string, unknown>[]> = {};
    for (const name of tableNames) {
      const rows = await this.getRows(name);
      tables[name] = rows.map((row) => row.fields);
    }
    const payload: DebugDatabaseExport = {
      exportedAt: new Date().toISOString(),
      tables,
    };
    dbLog.info("debug-db › export complete", { tableCount: tableNames.length });
    return JSON.stringify(payload, null, 2);
  }

  async importFromJson(json: string): Promise<void> {
    let payload: DebugDatabaseExport;
    try {
      payload = JSON.parse(json);
    } catch (error) {
      const appErr = toAppError(error, "database");
      dbLog.error("debug-db › import parse failed", appErr);
      throw appErr;
    }

    try {
      await this.db.write(async () => {
        for (const [tableName, rows] of Object.entries(payload.tables ?? {})) {
          const ops = rows.map((row) =>
            this.db.get(tableName).prepareCreate((record: Model) => {
              Object.assign(record._raw, row);
            })
          );
          if (ops.length > 0) await this.db.batch(...ops);
        }
      });
      dbLog.info("debug-db › import complete", {
        tableCount: Object.keys(payload.tables ?? {}).length,
      });
    } catch (error) {
      const appErr = toAppError(error, "database");
      dbLog.error("debug-db › import failed", appErr);
      throw appErr;
    }
  }
}

export const debugDbService = new DebugDbService(sharedDatabase);
