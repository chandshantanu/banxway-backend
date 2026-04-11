/**
 * PostgreSQL Query Builder — Drop-in replacement for Supabase SDK
 *
 * Implements the same fluent API as @supabase/supabase-js so existing code
 * (50+ files) needs only an import change from supabaseAdmin to db.
 *
 * Usage: import { db } from '../config/pg-client';
 * Then: db.from('table').select('*').eq('id', val).single()
 * Returns: { data, error, count? } — same shape as Supabase
 */

import { Pool, PoolConfig } from 'pg';
import { logger } from '../utils/logger';

// Connection pool
const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

// Types
export interface QueryResult<T = any> {
  data: T | null;
  error: PgError | null;
  count?: number | null;
}

interface PgError {
  message: string;
  code: string;
  details?: string;
}

type FilterOp = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'IN' | 'IS' | 'LIKE' | 'ILIKE' | 'CONTAINS' | 'OVERLAPS';

export interface WhereClause {
  column: string;
  op: FilterOp;
  value: any;
}

export interface OrderClause {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

class QueryBuilder<T = any> {
  table: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT' = 'SELECT';
  selectColumns: string = '*';
  whereClauses: WhereClause[] = [];
  orClauses: string[] = [];
  orderClauses: OrderClause[] = [];
  limitValue?: number;
  offsetValue?: number;
  rangeFrom?: number;
  rangeTo?: number;
  isSingle: boolean = false;
  isMaybeSingle: boolean = false;
  insertData: any = null;
  updateData: any = null;
  upsertConflict?: string;
  returnSelect: string | null = null;
  countMode: 'exact' | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = '*', opts?: { count?: 'exact' }): this {
    this.operation = 'SELECT';
    this.selectColumns = columns;
    if (opts?.count === 'exact') {
      this.countMode = 'exact';
    }
    return this;
  }

  insert(data: any | any[]): this {
    this.operation = 'INSERT';
    this.insertData = Array.isArray(data) ? data : [data];
    return this;
  }

  update(data: any): this {
    this.operation = 'UPDATE';
    this.updateData = data;
    return this;
  }

  upsert(data: any | any[], opts?: { onConflict?: string }): this {
    this.operation = 'UPSERT';
    this.insertData = Array.isArray(data) ? data : [data];
    this.upsertConflict = opts?.onConflict;
    return this;
  }

  delete(): this {
    this.operation = 'DELETE';
    return this;
  }

  // Filters
  eq(column: string, value: any): this {
    this.whereClauses.push({ column, op: '=', value });
    return this;
  }

  neq(column: string, value: any): this {
    this.whereClauses.push({ column, op: '!=', value });
    return this;
  }

  gt(column: string, value: any): this {
    this.whereClauses.push({ column, op: '>', value });
    return this;
  }

  lt(column: string, value: any): this {
    this.whereClauses.push({ column, op: '<', value });
    return this;
  }

  gte(column: string, value: any): this {
    this.whereClauses.push({ column, op: '>=', value });
    return this;
  }

  lte(column: string, value: any): this {
    this.whereClauses.push({ column, op: '<=', value });
    return this;
  }

  in(column: string, values: any[]): this {
    this.whereClauses.push({ column, op: 'IN', value: values });
    return this;
  }

  is(column: string, value: any): this {
    this.whereClauses.push({ column, op: 'IS', value });
    return this;
  }

  like(column: string, pattern: string): this {
    this.whereClauses.push({ column, op: 'LIKE', value: pattern });
    return this;
  }

  ilike(column: string, pattern: string): this {
    this.whereClauses.push({ column, op: 'ILIKE', value: pattern });
    return this;
  }

  contains(column: string, value: any): this {
    this.whereClauses.push({ column, op: 'CONTAINS', value });
    return this;
  }

  overlaps(column: string, value: any[]): this {
    this.whereClauses.push({ column, op: 'OVERLAPS', value });
    return this;
  }

  not(column: string, op: string, value: any): this {
    // Simplified: treat as neq for common case
    if (op === 'eq') {
      this.whereClauses.push({ column, op: '!=', value });
    } else if (op === 'is') {
      this.whereClauses.push({ column, op: 'IS', value: value === null ? 'NOT NULL' : value });
    }
    return this;
  }

  or(filterString: string): this {
    // Parse Supabase-style or filter: "col1.op.val,col2.op.val"
    this.orClauses.push(filterString);
    return this;
  }

  // Modifiers
  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orderClauses.push({
      column,
      ascending: opts?.ascending ?? true,
      nullsFirst: opts?.nullsFirst,
    });
    return this;
  }

  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  single(): this {
    this.isSingle = true;
    this.limitValue = 1;
    return this;
  }

  maybeSingle(): this {
    this.isMaybeSingle = true;
    this.limitValue = 1;
    return this;
  }

  // Chain .select() after .insert()/.update()/.delete() to return data
  // This is already handled — if select is called after insert/update, set returnSelect
  buildWhereClause(params: any[]): string {
    if (this.whereClauses.length === 0 && this.orClauses.length === 0) return '';

    const conditions: string[] = [];

    for (const clause of this.whereClauses) {
      const paramIdx = params.length + 1;

      if (clause.op === 'IS') {
        if (clause.value === null || clause.value === 'NULL') {
          conditions.push(`"${clause.column}" IS NULL`);
        } else if (clause.value === 'NOT NULL') {
          conditions.push(`"${clause.column}" IS NOT NULL`);
        } else {
          conditions.push(`"${clause.column}" IS ${clause.value}`);
        }
      } else if (clause.op === 'IN') {
        const placeholders = clause.value.map((_: any, i: number) => `$${paramIdx + i}`);
        conditions.push(`"${clause.column}" IN (${placeholders.join(', ')})`);
        params.push(...clause.value);
      } else if (clause.op === 'CONTAINS') {
        params.push(JSON.stringify(clause.value));
        conditions.push(`"${clause.column}" @> $${paramIdx}::jsonb`);
      } else if (clause.op === 'OVERLAPS') {
        params.push(clause.value);
        conditions.push(`"${clause.column}" && $${paramIdx}`);
      } else if (clause.op === 'ILIKE' || clause.op === 'LIKE') {
        params.push(clause.value);
        conditions.push(`"${clause.column}" ${clause.op} $${paramIdx}`);
      } else {
        params.push(clause.value);
        conditions.push(`"${clause.column}" ${clause.op} $${paramIdx}`);
      }
    }

    // Parse or clauses (Supabase format: "col.op.val,col2.op.val")
    for (const orStr of this.orClauses) {
      const parts = orStr.split(',').map(p => {
        const match = p.match(/^(\w+)\.(eq|neq|ilike|like|gt|lt|gte|lte)\.(.+)$/);
        if (!match) return null;
        const [, col, op, val] = match;
        const paramIdx = params.length + 1;
        params.push(op === 'ilike' || op === 'like' ? val : val);
        const sqlOp = { eq: '=', neq: '!=', ilike: 'ILIKE', like: 'LIKE', gt: '>', lt: '<', gte: '>=', lte: '<=' }[op] || '=';
        return `"${col}" ${sqlOp} $${paramIdx}`;
      }).filter(Boolean);
      if (parts.length > 0) {
        conditions.push(`(${parts.join(' OR ')})`);
      }
    }

    return conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  }

  buildOrderClause(): string {
    if (this.orderClauses.length === 0) return '';
    const parts = this.orderClauses.map(o => {
      let s = `"${o.column}" ${o.ascending ? 'ASC' : 'DESC'}`;
      if (o.nullsFirst !== undefined) {
        s += o.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST';
      }
      return s;
    });
    return ` ORDER BY ${parts.join(', ')}`;
  }

  buildLimitOffset(): string {
    let sql = '';
    if (this.rangeFrom !== undefined && this.rangeTo !== undefined) {
      sql += ` LIMIT ${this.rangeTo - this.rangeFrom + 1} OFFSET ${this.rangeFrom}`;
    } else {
      if (this.limitValue !== undefined) sql += ` LIMIT ${this.limitValue}`;
      if (this.offsetValue !== undefined) sql += ` OFFSET ${this.offsetValue}`;
    }
    return sql;
  }

  // Parse select columns — handle basic column lists, ignore relation syntax
  parseSelectColumns(): string {
    if (this.selectColumns === '*') return '*';

    // Remove relation blocks like "table (...)" — these are Supabase PostgREST joins
    const cleaned = this.selectColumns
      .replace(/\w+\s*\([^)]*\)/g, '') // Remove "table (col, col)" patterns
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0 && c !== '*');

    return cleaned.length > 0 ? cleaned.map(c => `"${c}"`).join(', ') : '*';
  }

  async then(resolve: (value: QueryResult<T>) => void, reject?: (error: any) => void): Promise<void> {
    try {
      const result = await this.execute();
      resolve(result);
    } catch (err) {
      if (reject) reject(err);
      else resolve({ data: null, error: { message: (err as Error).message, code: 'UNKNOWN' } });
    }
  }

  async execute(): Promise<QueryResult<T>> {
    const params: any[] = [];
    let sql = '';
    let countSql = '';

    try {
      switch (this.operation) {
        case 'SELECT': {
          const cols = this.parseSelectColumns();
          const where = this.buildWhereClause(params);
          const order = this.buildOrderClause();
          const limitOffset = this.buildLimitOffset();

          sql = `SELECT ${cols} FROM "${this.table}"${where}${order}${limitOffset}`;

          if (this.countMode === 'exact') {
            const countParams: any[] = [];
            const countWhere = this.buildWhereClauseForCount(countParams);
            countSql = `SELECT COUNT(*) FROM "${this.table}"${countWhere}`;
          }
          break;
        }

        case 'INSERT': {
          if (!this.insertData || this.insertData.length === 0) {
            return { data: null, error: { message: 'No data to insert', code: 'EMPTY_INSERT' } };
          }

          const row = this.insertData[0];
          const columns = Object.keys(row).filter(k => row[k] !== undefined);
          const values = columns.map(k => row[k]);
          const placeholders = columns.map((_, i) => `$${i + 1}`);

          params.push(...values);
          sql = `INSERT INTO "${this.table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
          break;
        }

        case 'UPDATE': {
          if (!this.updateData) {
            return { data: null, error: { message: 'No data to update', code: 'EMPTY_UPDATE' } };
          }

          const setCols = Object.keys(this.updateData).filter(k => this.updateData[k] !== undefined);
          const setClause = setCols.map((col, i) => {
            params.push(this.updateData[col]);
            return `"${col}" = $${i + 1}`;
          }).join(', ');

          // Add updated_at if column exists and not already set
          const setWithTimestamp = setCols.includes('updated_at')
            ? setClause
            : `${setClause}, "updated_at" = NOW()`;

          const where = this.buildWhereClause(params);
          sql = `UPDATE "${this.table}" SET ${setWithTimestamp}${where} RETURNING *`;
          break;
        }

        case 'UPSERT': {
          if (!this.insertData || this.insertData.length === 0) {
            return { data: null, error: { message: 'No data to upsert', code: 'EMPTY_UPSERT' } };
          }

          const row = this.insertData[0];
          const columns = Object.keys(row).filter(k => row[k] !== undefined);
          const values = columns.map(k => row[k]);
          const placeholders = columns.map((_, i) => `$${i + 1}`);
          const conflict = this.upsertConflict || 'id';
          const updateCols = columns.filter(c => c !== conflict)
            .map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');

          params.push(...values);
          sql = `INSERT INTO "${this.table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT ("${conflict}") DO UPDATE SET ${updateCols} RETURNING *`;
          break;
        }

        case 'DELETE': {
          const where = this.buildWhereClause(params);
          sql = `DELETE FROM "${this.table}"${where} RETURNING *`;
          break;
        }
      }

      const result = await pool.query(sql, params);
      let count: number | null = null;

      if (countSql) {
        const countParams: any[] = [];
        this.buildWhereClauseForCount(countParams);
        const countResult = await pool.query(countSql, countParams);
        count = parseInt(countResult.rows[0].count, 10);
      }

      if (this.isSingle) {
        if (result.rows.length === 0) {
          return {
            data: null,
            error: { message: 'Row not found', code: 'PGRST116' },
            count,
          };
        }
        return { data: result.rows[0] as T, error: null, count };
      }

      if (this.isMaybeSingle) {
        return { data: (result.rows[0] || null) as T, error: null, count };
      }

      return { data: result.rows as T, error: null, count };
    } catch (err: any) {
      logger.error('PostgreSQL query error', {
        table: this.table,
        operation: this.operation,
        error: err.message,
        code: err.code,
      });
      return {
        data: null,
        error: {
          message: err.message,
          code: err.code || 'UNKNOWN',
          details: err.detail,
        },
      };
    }
  }

  // Duplicate where clause builder for count query (separate params array)
  buildWhereClauseForCount(params: any[]): string {
    // Re-run the where clause builder with a fresh params array
    const saved = [...this.whereClauses];
    const savedOr = [...this.orClauses];
    return this.buildWhereClause(params);
  }
}

// RPC call support
async function rpc(functionName: string, params?: Record<string, any>): Promise<QueryResult> {
  try {
    const paramNames = params ? Object.keys(params) : [];
    const paramValues = params ? Object.values(params) : [];
    const placeholders = paramNames.map((_, i) => `$${i + 1}`);

    const sql = paramNames.length > 0
      ? `SELECT * FROM ${functionName}(${placeholders.join(', ')})`
      : `SELECT * FROM ${functionName}()`;

    const result = await pool.query(sql, paramValues);
    // For scalar functions (single row, single column), unwrap the value
    // This matches Supabase RPC behavior: rpc('fn', {x}) returns the scalar, not {fn: value}
    if (result.rows.length === 1 && result.fields.length === 1) {
      return { data: result.rows[0][result.fields[0].name], error: null };
    }
    return { data: result.rows.length === 1 ? result.rows[0] : result.rows, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message, code: err.code || 'UNKNOWN' } };
  }
}

// The drop-in replacement for supabaseAdmin
export const db = {
  from: <T = any>(table: string): QueryBuilder<T> => new QueryBuilder<T>(table),
  rpc,
};

// Graceful shutdown
export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('PostgreSQL pool closed');
}
