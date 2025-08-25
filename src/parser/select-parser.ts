import { isFunction, isReadonlyArray, isString } from '../util/object-utils.js'
import { AliasedSelectQueryBuilder } from '../query-builder/select-query-builder.js'
import { SelectionNode } from '../operation-node/selection-node.js'
import {
  AnyAliasedColumnWithTable,
  AnyAliasedPropertyPath,
  AnyAliasedPropertyPathWithTable,
  AnyArrayPropertyPathWithTable,
  AnyColumn,
  AnyColumnWithTable,
  AnyPropertyPathWithTable,
  DrainOuterGeneric,
  ExtractColumnType,
  ExtractPropertyPathType,
} from '../util/type-utils.js'
import {
  parseAliasedStringReference,
  parseStringReference,
} from './reference-parser.js'
import {
  DynamicReferenceBuilder,
  isDynamicReferenceBuilder,
} from '../dynamic/dynamic-reference-builder.js'
import {
  AliasedExpressionOrFactory,
  parseAliasedExpression,
} from './expression-parser.js'
import { SelectType } from '../util/column-type.js'
import { parseTable } from './table-parser.js'
import { AliasedExpression } from '../expression/expression.js'
import {
  expressionBuilder,
  ExpressionBuilder,
} from '../expression/expression-builder.js'

export type SelectExpression<DB, TB extends keyof DB> =
  | AnyAliasedColumnWithTable<DB, TB>
  // | AnyAliasedColumn<DB, TB> // not needed?
  | AnyColumnWithTable<DB, TB>
  // | AnyColumn<DB, TB> // not needed?
  | AnyAliasedPropertyPath<DB, TB>
  | AnyPropertyPathWithTable<DB, TB>
  | AnyAliasedPropertyPathWithTable<DB, TB>
  | AnyArrayPropertyPathWithTable<DB, TB> // redundant?; subset of AnyPropertyPathWithTable?
  | DynamicReferenceBuilder<any>
  | AliasedExpressionOrFactory<DB, TB>

export type SelectCallback<DB, TB extends keyof DB> = (
  eb: ExpressionBuilder<DB, TB>,
) => ReadonlyArray<SelectExpression<DB, TB>>

/**
 * Turns a SelectExpression or a union of them into a selection object.
 */
export type Selection<DB, TB extends keyof DB, SE> = {
  [E in FlattenSelectExpression<SE> as ExtractAliasFromSelectExpression<E>]: SelectType<
    ExtractTypeFromSelectExpression<DB, TB, E>
  >
}

/**
 * Turns a SelectCallback into a selection object.
 */
export type CallbackSelection<DB, TB extends keyof DB, CB> = CB extends (
  eb: any,
) => ReadonlyArray<infer SE>
  ? Selection<DB, TB, SE>
  : never

export type SelectArg<
  DB,
  TB extends keyof DB,
  SE extends SelectExpression<DB, TB>,
> =
  | SE
  | ReadonlyArray<SE>
  | ((eb: ExpressionBuilder<DB, TB>) => ReadonlyArray<SE>)

type FlattenSelectExpression<SE> =
  SE extends DynamicReferenceBuilder<infer RA>
    ? { [R in RA]: DynamicReferenceBuilder<R> }[RA]
    : SE

type ExtractAliasFromSelectExpression<SE> = SE extends string
  ? ExtractAliasFromStringSelectExpression<SE>
  : SE extends AliasedExpression<any, infer EA>
    ? EA
    : SE extends (qb: any) => AliasedExpression<any, infer EA>
      ? EA
      : SE extends DynamicReferenceBuilder<infer RA>
        ? ExtractAliasFromStringSelectExpression<RA>
        : never

type ExtractAliasFromStringSelectExpression<SE extends string> =
  SE extends `${string} as ${infer A}`
    ? A
    : SE extends `${string}.${infer C}`
      ? C extends `${string}[${number}].${infer Rest}`
        ? Rest extends `${string}.${infer Last}`
          ? Last
          : Rest
        : C
      : SE

export type ExtractTypeFromSelectExpression<
  DB,
  TB extends keyof DB,
  SE,
> = SE extends string
  ? ExtractTypeFromStringSelectExpression<DB, TB, SE>
  : SE extends AliasedSelectQueryBuilder<infer O, any>
    ? O[keyof O] | null
    : SE extends (eb: any) => AliasedSelectQueryBuilder<infer O, any>
      ? O[keyof O] | null
      : SE extends AliasedExpression<infer O, any>
        ? O
        : SE extends (eb: any) => AliasedExpression<infer O, any>
          ? O
          : SE extends DynamicReferenceBuilder<infer RA>
            ? ExtractTypeFromStringSelectExpression<DB, TB, RA> | undefined
            : never

export type ExtractTypeFromStringSelectExpression<
  DB,
  TB extends keyof DB,
  SE extends string,
> = SE extends `${infer T}.${infer P} as ${string}`
  ? T extends TB
    ? ExtractPropertyPathType<DB[T], P>
    : T extends keyof DB
      ? ExtractPropertyPathType<DB[T], P>
      : never
  : SE extends `${infer T}.${infer P}`
    ? T extends TB
      ? ExtractPropertyPathType<DB[T], P>
      : T extends keyof DB
        ? ExtractPropertyPathType<DB[T], P>
        : never
    : SE extends AnyColumn<DB, TB>
      ? ExtractColumnType<DB, TB, SE>
      : never

interface User {
  name: string
  details: {
    age: number
    hobbies: string[]
    colors: string[][]
    addresses: {
      street: string
      city: string
      zip: string
      villa: {
        name: string
        year: number
        old: boolean
      }
    }[]
  }
  friends: { id: number; name: string }[]

  settings: {
    theme: 'light' | 'dark'
  }[]
}

export type AllSelection<DB, TB extends keyof DB> = DrainOuterGeneric<{
  [C in AnyColumn<DB, TB>]: {
    [T in TB]: SelectType<C extends keyof DB[T] ? DB[T][C] : never>
  }[TB]
}>

export function parseSelectArg(
  selection: SelectArg<any, any, SelectExpression<any, any>>,
): SelectionNode[] {
  if (isFunction(selection)) {
    return parseSelectArg(selection(expressionBuilder()))
  } else if (isReadonlyArray(selection)) {
    return selection.map((it) => parseSelectExpression(it))
  } else {
    return [parseSelectExpression(selection)]
  }
}

function parseSelectExpression(
  selection: SelectExpression<any, any>,
): SelectionNode {
  if (isString(selection)) {
    return SelectionNode.create(parseAliasedStringReference(selection))
  } else if (isDynamicReferenceBuilder(selection)) {
    return SelectionNode.create(selection.toOperationNode())
  } else {
    return SelectionNode.create(parseAliasedExpression(selection))
  }
}

export function parseSelectValueExpression(
  selection: SelectExpression<any, any>,
): SelectionNode[] {
  if (isString(selection)) {
    return [SelectionNode.createValueSelection(parseStringReference(selection))]
  } else if (isDynamicReferenceBuilder(selection)) {
    return [SelectionNode.createValueSelection(selection.toOperationNode())]
  } else {
    return [
      SelectionNode.createValueSelection(parseAliasedExpression(selection)), //TODO: This should never get called. selectValue doesn't support aliased expressions.
    ]
  }
}

export function parseSelectAll(table?: string | string[]): SelectionNode[] {
  if (!table) {
    return [SelectionNode.createSelectAll()]
  } else if (Array.isArray(table)) {
    return table.map(parseSelectAllArg)
  } else {
    return [parseSelectAllArg(table)]
  }
}

function parseSelectAllArg(table: string): SelectionNode {
  if (isString(table)) {
    return SelectionNode.createSelectAllFromTable(parseTable(table))
  }

  throw new Error(
    `invalid value selectAll expression: ${JSON.stringify(table)}`,
  )
}
