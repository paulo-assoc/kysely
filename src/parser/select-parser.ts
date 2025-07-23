import { isFunction, isReadonlyArray, isString } from '../util/object-utils.js'
import { AliasedSelectQueryBuilder } from '../query-builder/select-query-builder.js'
import { SelectionNode } from '../operation-node/selection-node.js'
import {
  AnyAliasedColumn,
  AnyAliasedColumnWithTable,
  AnyAliasedPropertyPath,
  AnyColumn,
  AnyColumnWithTable,
  AnyPropertyPath,
  DrainOuterGeneric,
  ExtractPropertyPathType,
} from '../util/type-utils.js'
import { parseAliasedStringReference } from './reference-parser.js'
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
  | AnyAliasedColumn<DB, TB>
  | AnyColumnWithTable<DB, TB>
  | AnyColumn<DB, TB>
  | AnyAliasedPropertyPath<DB, TB>
  | AnyPropertyPath<DB, TB>
  | DynamicReferenceBuilder<any>
  | AliasedExpressionOrFactory<DB, TB>

export type SelectCallback<DB, TB extends keyof DB> = (
  eb: ExpressionBuilder<DB, TB>,
) => ReadonlyArray<SelectExpression<DB, TB>>

/**
 * Turns a SelectExpression or a union of them into a selection object.
 */
export type Selection<
  DB,
  TB extends keyof DB,
  SE,
  // Inline version of DrainOuterGeneric for performance reasons.
  // Don't replace with DrainOuterGeneric!
> = [DB] extends [unknown]
  ? {
      [E in FlattenSelectExpression<SE> as ExtractAliasFromSelectExpression<E>]: SelectType<
        ExtractTypeFromSelectExpression<DB, TB, E>
      >
    }
  : {}

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
  SE extends `${string}.${string}.${string} as ${infer A}`
    ? A
    : SE extends `${string}.${string} as ${infer A}`
      ? A
      : SE extends `${string} as ${infer A}`
        ? A
        : SE extends `${string}.${string}.${infer C}`
          ? C
          : SE extends `${string}.${infer C}`
            ? C
            : SE

type ExtractTypeFromSelectExpression<
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

// This is the new version that works correctly with nested objects
export type ExtractTypeFromStringSelectExpression<
  DB,
  TB extends keyof DB,
  SE extends string,
> = SE extends `${infer PE extends string} as ${string}`
  ? ExtractPropertyPathType<DB[TB], PE>
  : SE extends `${infer PE extends string}`
    ? ExtractPropertyPathType<DB[TB], PE>
    : never

// This is the original version that was not working correctly with nested objects
// type ExtractTypeFromStringSelectExpression<
//   DB,
//   TB extends keyof DB,
//   SE extends string,
// > = SE extends `${infer SC}.${infer T}.${infer C} as ${string}`
//   ? `${SC}.${T}` extends TB
//     ? C extends keyof DB[`${SC}.${T}`]
//       ? DB[`${SC}.${T}`][C]
//       : never
//     : never
//   : SE extends `${infer T}.${infer C} as ${string}`
//     ? T extends TB
//       ? C extends keyof DB[T]
//         ? DB[T][C]
//         : never
//       : never
//     : SE extends `${infer C} as ${string}`
//       ? C extends AnyColumn<DB, TB>
//         ? ExtractColumnType<DB, TB, C>
//         : never
//       : SE extends `${infer SC}.${infer T}.${infer C}`
//         ? `${SC}.${T}` extends TB
//           ? C extends keyof DB[`${SC}.${T}`]
//             ? DB[`${SC}.${T}`][C]
//             : never
//           : never
//         : SE extends `${infer T}.${infer C}`
//           ? T extends TB
//             ? C extends keyof DB[T]
//               ? DB[T][C]
//               : never
//             : never
//           : SE extends AnyColumn<DB, TB>
//             ? ExtractColumnType<DB, TB, SE>
//             : never

// type ExtractTypeFromStringSelectExpression<
//   DB,
//   TB extends keyof DB,
//   SE extends string,
// > = SE extends `${infer PE extends string} as ${string}`
//   ? ExtractPropertyPathType<DB[TB], PE>
//   : SE extends `${infer SC}.${infer T}.${infer C} as ${string}`
//     ? `${SC}.${T}` extends TB
//       ? C extends keyof DB[`${SC}.${T}`]
//         ? DB[`${SC}.${T}`][C]
//         : 'a'
//       : 'b'
//     : SE extends `${infer T}.${infer C} as ${string}`
//       ? T extends TB
//         ? C extends keyof DB[T]
//           ? DB[T][C]
//           : 'c'
//         : 'd'
//       : SE extends `${infer C} as ${string}`
//         ? C extends AnyColumn<DB, TB>
//           ? ExtractColumnType<DB, TB, C>
//           : 'e'
//         : SE extends AnyPropertyPath<DB[TB], keyof DB[TB]>
//           ? ExtractPropertyPathType<DB[TB], SE>
//           : SE extends `${infer SC}.${infer T}.${infer C}`
//             ? `${SC}.${T}` extends TB
//               ? C extends keyof DB[`${SC}.${T}`]
//                 ? DB[`${SC}.${T}`][C]
//                 : 'f'
//               : 'g'
//             : SE extends `${infer T}.${infer C}`
//               ? T extends TB
//                 ? C extends keyof DB[T]
//                   ? DB[T][C]
//                   : 'h'
//                 : ExtractPropertyPathType<DB[TB], SE> // Use PropertyPathFromString for nested objects
//               : SE extends AnyColumn<DB, TB>
//                 ? ExtractColumnType<DB, TB, SE>
//                 : 'i'

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

interface Database {
  user: User
}

type NameType = Selection<Database, 'user', 'name'> // string
type AgeType = Selection<Database, 'user', 'details.age'> // number
type AddressType = Selection<Database, 'user', 'details.addresses[0]'> // { street: string; city: string; zip: string; }
type VillaType = Selection<Database, 'user', 'details.addresses[0].villa'> // { name: string; year: number; old: boolean; }
type HobbyType = Selection<Database, 'user', 'details.hobbies[0]'> // string
type HobbiesType = Selection<Database, 'user', 'details.hobbies'> // string[]
type FriendNameType = Selection<Database, 'user', 'friends[0].name'> // string
type SettingsType = Selection<Database, 'user', 'settings'> // { theme: "light" | "dark"; }[]
type SettingType = Selection<Database, 'user', 'settings[0]'> // { theme: "light" | "dark"; }
type ThemeType = Selection<Database, 'user', 'settings[0].theme'> // "light" | "dark"

type NameTypeA = Selection<Database, 'user', 'name as n'> // string
type AgeTypeA = Selection<Database, 'user', 'details.age as a'> // number
type AddressTypeA = Selection<Database, 'user', 'details.addresses[0] as a'> // { street: string; city: string; zip: string; }
type VillaTypeA = Selection<Database, 'user', 'details.addresses[0].villa as v'> // { name: string; year: number; old: boolean; }
type HobbyTypeA = Selection<Database, 'user', 'details.hobbies[0] as h'> // string
type HobbiesTypeA = Selection<Database, 'user', 'details.hobbies as h'> // string[]
type FriendNameTypeA = Selection<Database, 'user', 'friends[0].name as fn'> // string
type SettingsTypeA = Selection<Database, 'user', 'settings as s'> // { theme: "light" | "dark"; }[]
type SettingTypeA = Selection<Database, 'user', 'settings[0] as s'> // { theme: "light" | "dark"; }
type ThemeTypeA = Selection<Database, 'user', 'settings[0].theme as t'> // "light" | "dark"

// type NameType = ExtractPropertyPathType<User, 'name'> // string
// type AgeType = ExtractPropertyPathType<User, 'details.age'> // number
// type HobbyType = ExtractPropertyPathType<User, 'details.hobbies[0]'> // string
// type HobbiesType = ExtractPropertyPathType<User, 'details.hobbies'> // string[]
// type FriendNameType = ExtractPropertyPathType<User, 'friends[0].name'> // string
// type SettingsType = ExtractPropertyPathType<User, 'settings'> // { theme: "light" | "dark"; }[]
// type SettingType = ExtractPropertyPathType<User, 'settings[0]'> // { theme: "light" | "dark"; }
// type ThemeType = ExtractPropertyPathType<User, 'settings[0].theme'> // "light" | "dark"

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
