#!/usr/bin/env python3
"""Inspect a mysqldump stream without retaining its SQL or row values."""

import argparse
import gzip
import hashlib
import json
import os
import re
import sys

IDENTIFIER = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")
MAX_TAIL = 8192


class Inspector:
    def __init__(self) -> None:
        self.tables: dict[str, int] = {}
        self.total = 0
        self.statement = bytearray()
        self.mode = "normal"
        self.quote = 0
        self.escape = False
        self.line_comment = False
        self.block_comment = False
        self.delimiter = b";"
        self.parens = 0
        self.insert_table: str | None = None
        self.insert_values = False
        self.row_depth = 0
        self.row_open = False
        self.declaration_parsed = False

    @staticmethod
    def name(raw: bytes) -> str:
        text = raw.decode("ascii", "strict").strip().strip("`").lower()
        if not IDENTIFIER.fullmatch(text):
            raise ValueError("unsafe SQL identifier")
        return text

    def begin_statement(self) -> None:
        prefix = bytes(self.statement).strip()
        upper = prefix.upper()
        if upper.startswith(b"CREATE TABLE") and not self.declaration_parsed:
            match = re.match(rb"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(`[^`]+`|[A-Za-z_][A-Za-z0-9_]*)\s*\(", prefix, re.I)
            if not match:
                return
            table = self.name(match.group(1))
            if table in self.tables:
                raise ValueError("duplicate table declaration")
            self.tables[table] = 0
            self.declaration_parsed = True
        elif upper.startswith(b"INSERT"):
            match = re.match(rb"INSERT\s+INTO\s+(`[^`]+`|[A-Za-z_][A-Za-z0-9_]*)(?=\s|\(|$)", prefix, re.I)
            if not match:
                return
            self.insert_table = self.name(match.group(1))
            if self.insert_table not in self.tables:
                raise ValueError("insert into undeclared table")
            self.insert_values = bool(re.search(rb"\bVALUES\s*$", prefix, re.I))
        elif re.match(rb"(?:REPLACE|LOAD\s+DATA)\b", prefix, re.I):
            raise ValueError("unsupported data statement")

    def finish_statement(self) -> None:
        prefix = bytes(self.statement).strip()
        if prefix.upper().startswith(b"DELIMITER"):
            parts = prefix.split()
            if len(parts) != 2 or len(parts[1]) > 16:
                raise ValueError("invalid delimiter")
            self.delimiter = parts[1]
        self.statement.clear()
        self.insert_table = None
        self.insert_values = False
        self.row_depth = 0
        self.row_open = False
        self.declaration_parsed = False

    def feed(self, data: bytes) -> None:
        for char in data:
            if self.line_comment:
                if char in (10, 13): self.line_comment = False
                continue
            if self.block_comment:
                self.statement.append(char)
                if len(self.statement) >= 2 and self.statement[-2:] == b"*/": self.block_comment = False
                continue
            if self.quote:
                if self.escape: self.escape = False
                elif char == 92: self.escape = True
                elif char == self.quote: self.quote = 0
                continue
            if char in (39, 34):
                self.quote = char; continue
            if char == 35:
                self.line_comment = True; continue
            if char == 45 and self.statement.endswith(b"-"):
                self.statement.pop(); self.line_comment = True; continue
            if char == 42 and self.statement.endswith(b"/"):
                self.statement.pop()
                self.block_comment = True; continue
            if not self.insert_values:
                self.statement.append(char)
            if not self.insert_table and len(self.statement) < 1024:
                self.begin_statement()
            if self.insert_table and not self.insert_values and re.search(rb"\bVALUES\s*$", self.statement, re.I):
                self.insert_values = True
                # Values may be arbitrarily large. The prefix has already
                # established the target table, so retaining it is needless.
                self.statement.clear()
            if self.insert_values:
                if char == 40:
                    self.row_depth += 1
                    if self.row_depth == 1: self.row_open = True
                elif char == 41 and self.row_depth:
                    self.row_depth -= 1
                    if self.row_depth == 0 and self.row_open:
                        self.tables[self.insert_table] += 1; self.total += 1; self.row_open = False
            ends_statement = (self.insert_values and self.row_depth == 0 and self.delimiter == bytes([char])) or self.statement.endswith(self.delimiter)
            if ends_statement:
                if not self.insert_values:
                    self.statement = self.statement[:-len(self.delimiter)]
                self.finish_statement()

    def finish(self) -> dict:
        if self.quote or self.block_comment or self.parens or self.statement.strip():
            raise ValueError("unterminated SQL statement")
        if not self.tables:
            raise ValueError("dump has no base tables")
        return {"tables": dict(sorted(self.tables.items())), "totalRows": self.total}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fd", type=int, required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    compressed_hash = hashlib.sha256(); compressed_size = 0; uncompressed_size = 0; tail = bytearray(); inspector = Inspector()
    try:
        with os.fdopen(os.dup(args.fd), "rb", closefd=True) as raw:
            class HashingReader:
                def read(self, size=-1):
                    nonlocal compressed_size
                    chunk = raw.read(size)
                    compressed_hash.update(chunk); compressed_size += len(chunk)
                    return chunk
            with gzip.GzipFile(fileobj=HashingReader(), mode="rb") as source:
                while chunk := source.read(65536):
                    uncompressed_size += len(chunk); tail.extend(chunk); del tail[:-MAX_TAIL]
                    inspector.feed(chunk)
        if b"-- Dump completed" not in tail:
            raise ValueError("missing dump completion footer")
        result = inspector.finish() | {"schemaVersion": "1.0", "compressedSize": compressed_size, "sha256": compressed_hash.hexdigest(), "uncompressedSize": uncompressed_size}
        with open(args.output, "x", encoding="utf-8") as out:
            json.dump(result, out, separators=(",", ":"), sort_keys=True)
        return 0
    except (OSError, EOFError, gzip.BadGzipFile, ValueError, UnicodeError) as error:
        print(f"dump inspection failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
