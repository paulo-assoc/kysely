import type { SelectQueryBuilder } from '../query-builder/select-query-builder.js'
import type {
  ExtractPropertyPathType,
  ShallowRecord,
} from '../util/type-utils.js'
import type {
  ExtractTableAlias,
  From,
  FromTables,
  TableExpressionOrList,
} from './table-parser.js'

export type SelectFrom<
  DB,
  TB extends keyof DB,
  TE extends TableExpressionOrList<DB, TB>,
> = TE extends keyof DB & string
  ? // This branch creates a good-looking type for the most common case:
    // selectFrom('person') --> SelectQueryBuilder<DB, 'person', {}>.
    // ExtractTableAlias is needed for the case where DB == any. Without it:
    // selectFrom('person as p') --> SelectQueryBuilder<DB, 'person as p', {}>
    SelectQueryBuilder<DB, TB | ExtractTableAlias<DB, TE>, {}>
  : // This branch creates a good-looking type for common aliased case:
    // selectFrom('person as p') --> SelectQueryBuilder<DB & { p: Person }, 'p', {}>.
    TE extends `${infer T} as ${infer A}`
    ? SelectQueryBuilder<
        DB & ShallowRecord<A, NonNullable<ExtractPropertyPathType<DB, T>>>,
        TB | A,
        {}
      >
    : TE extends ReadonlyArray<infer T>
      ? SelectQueryBuilder<From<DB, T>, FromTables<DB, TB, T>, {}>
      : SelectQueryBuilder<From<DB, TE>, FromTables<DB, TB, TE>, {}>
