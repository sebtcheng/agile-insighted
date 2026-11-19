# Duplicated JSON payload check (database `agile_local`, read-only)

Schema: `../../../Users/user/AppData/Local/Temp/schema.backup.ts` (0 JSON/JSONB columns, 0 payload-style). Sizes are bytes from `pg_column_size` on 1000+ row tables; overlap is by key name only. Row contents are never printed or saved.

| table.column | verdict | rows | avg / max col bytes | avg rest-of-row | payload % of row | heap / TOAST / total MB | typed-column overlap | EXPLAIN read payload vs baseline (ms, shared read; first N rows, N in json) | reason |
|---|---|---|---|---|---|---|---|---|---|

0 small array/scalar JSON columns (days, *_programs, reasons, ...) were checked and set aside as not payloads.

Dup keys (examples) and payload-only keys per column are in `payload-columns.json`.

_Reading the column is what EXPLAIN shows; each insert or update must also write those same bytes (heap/TOAST plus WAL). The write cost is therefore estimated from the average column bytes, not timed._
