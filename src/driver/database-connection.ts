import { FeedResponse, type FeedOptions } from '@azure/cosmos'
import { CompiledQuery } from '../query-compiler/compiled-query.js'
import { Simplify } from '../util/type-utils.js'

/**
 * A single connection to the database engine.
 *
 * These are created by an instance of {@link Driver}.
 */
export interface DatabaseConnection {
  executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>>

  executeQueryFeed<R>(
    compiledQuery: CompiledQuery,
    pageSize: number,
    continuationToken?: string,
  ): Promise<FeedResult<R>>

  streamQuery<R>(
    compiledQuery: CompiledQuery,
    chunkSize?: number,
  ): AsyncIterableIterator<QueryResult<R>>
}

export interface QueryResult<O> {
  /**
   * This is defined for insert, update, delete and merge queries and contains
   * the number of rows the query inserted/updated/deleted.
   */
  readonly numAffectedRows?: bigint

  /**
   * This is defined for update queries and contains the number of rows
   * the query changed.
   *
   * This is **optional** and only provided in dialects such as MySQL.
   * You would probably use {@link numAffectedRows} in most cases.
   */
  readonly numChangedRows?: bigint

  /**
   * This is defined for insert queries on dialects that return
   * the auto incrementing primary key from an insert.
   */
  readonly insertId?: bigint

  /**
   * The rows returned by the query. This is always defined and is
   * empty if the query returned no rows.
   */
  readonly rows: O[]
}

export class FeedResult<O> extends FeedResponse<Simplify<O>> {
  /**
   * This is defined for insert, update, delete and merge queries and contains
   * the number of rows the query inserted/updated/deleted.
   */
  // readonly numAffectedRows?: bigint
  // /**
  //  * This is defined for update queries and contains the number of rows
  //  * the query changed.
  //  *
  //  * This is **optional** and only provided in dialects such as MySQL.
  //  * You would probably use {@link numAffectedRows} in most cases.
  //  */
  // readonly numChangedRows?: bigint
  // /**
  //  * This is defined for insert queries on dialects that return
  //  * the auto incrementing primary key from an insert.
  //  */
  // readonly insertId?: bigint
  // /**
  //  * The rows returned by the query. This is always defined and is
  //  * empty if the query returned no rows.
  //  */
  // readonly rows: O[]
}
