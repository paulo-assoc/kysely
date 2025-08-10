import { InsertResult } from '../query-builder/insert-result.js'
import { DeleteResult } from '../query-builder/delete-result.js'
import { UpdateResult } from '../query-builder/update-result.js'
import { KyselyTypeError } from './type-error.js'
import { MergeResult } from '../query-builder/merge-result.js'
import * as TestDatabase from 'better-sqlite3'

/**
 * Given a database type and a union of table names in that db, returns
 * a union type with all possible column names.
 *
 * Example:
 *
 * ```ts
 * interface Person {
 *   id: number
 * }
 *
 * interface Pet {
 *   name: string
 *   species: 'cat' | 'dog'
 * }
 *
 * interface Movie {
 *   stars: number
 * }
 *
 * interface Database {
 *   person: Person
 *   pet: Pet
 *   movie: Movie
 * }
 *
 * type Columns = AnyColumn<Database, 'person' | 'pet'>
 *
 * // Columns == 'id' | 'name' | 'species'
 * ```
 */

// Helper type to decrement depth
type Decrement = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export type AnyColumn<DB, TB extends keyof DB> = {
  [T in TB]: keyof DB[T]
}[TB] &
  string

/**
 * Extracts a column type.
 */
export type ExtractColumnType<DB, TB extends keyof DB, C> = {
  [T in TB]: C extends keyof DB[T] ? DB[T][C] : never
}[TB]

/**
 * Given a database type and a union of table names in that db, returns
 * a union type with all possible `table`.`column` combinations.
 *
 * Example:
 *
 * ```ts
 * interface Person {
 *   id: number
 * }
 *
 * interface Pet {
 *   name: string
 *   species: 'cat' | 'dog'
 * }
 *
 * interface Movie {
 *   stars: number
 * }
 *
 * interface Database {
 *   person: Person
 *   pet: Pet
 *   movie: Movie
 * }
 *
 * type Columns = AnyColumnWithTable<Database, 'person' | 'pet'>
 *
 * // Columns == 'person.id' | 'pet.name' | 'pet.species'
 * ```
 */
export type AnyColumnWithTable<DB, TB extends keyof DB> = {
  [T in TB]: `${T & string}.${keyof DB[T] & string}`
}[TB]

export type AnyPropertyPath<
  DB,
  TB extends keyof DB,
  Depth extends number = 5,
> = keyof DB[TB] extends string
  ? Depth extends 0
    ? never
    : {
        [K in keyof DB[TB]]: K extends string
          ? DB[TB][K] extends Array<infer AV>
            ?
                | K
                | `${K}[${number}]`
                | `${K}[${number}].${AnyPropertyPath<{ table: AV }, 'table', Decrement[Depth]>}`
            : DB[TB][K] extends object
              ?
                  | K
                  | `${K}.${AnyPropertyPath<{ table: DB[TB][K] }, 'table', Decrement[Depth]>}`
              : K
          : never
      }[keyof DB[TB]]
  : never & string

export type ExtractPropertyPathType<T, P extends string> = T extends any
  ? P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
      ? ExtractPropertyPathType<T[K], Rest>
      : K extends `${infer ArrayKey}[${number}]`
        ? ArrayKey extends keyof T
          ? ExtractPropertyPathType<ArrayItemType<T[ArrayKey]>, Rest>
          : never
        : ExtractPropertyPathType<T, Rest>
    : P extends `${infer K}[${number}]`
      ? K extends keyof T
        ? ArrayItemType<T[K]>
        : never
      : DirectExtract<T, P>
  : never

export type AnyPropertyPathWithTable<DB, TB extends keyof DB> = {
  [T in TB]: `${T & string}.${AnyPropertyPath<DB, TB> & string}`
}[TB]

export type AnyArrayPropertyPath<
  DB,
  T extends keyof DB,
  Depth extends number = 5,
  Path extends string = '',
> = Depth extends 0
  ? never // Stop recursion when depth reaches 0
  : {
      [K in keyof DB[T]]: DB[T][K] extends any[] | undefined // Check if DB[T][K] is an array or an array | undefined
        ? // Include the array path and recurse into array items if objects
          | (Path extends '' ? `${K & string}` : `${Path}.${K & string}`)
            | (DB[T][K] extends (infer U)[] | undefined
                ? U extends object
                  ? AnyArrayPropertyPath<
                      { _: U },
                      '_',
                      Decrement[Depth],
                      Path extends ''
                        ? `${K & string}[${number}]`
                        : `${Path}.${K & string}[${number}]`
                    >
                  : never
                : never)
        : DB[T][K] extends object
          ? AnyArrayPropertyPath<
              { _: DB[T][K] },
              '_',
              Decrement[Depth],
              Path extends '' ? `${K & string}` : `${Path}.${K & string}`
            > // Recurse if object
          : never // Exclude non-array, non-object properties
    }[keyof DB[T]]

// Helper type to extract the item type of an array property
export type ExtractArrayItemType<
  DB,
  T extends keyof DB,
  P extends string,
> = P extends `${infer Key}[0].${infer Rest}`
  ? Key extends keyof DB[T]
    ? DB[T][Key] extends (infer U)[] | undefined
      ? U extends object
        ? ExtractArrayItemType<{ _: U }, '_', Rest>
        : never
      : never
    : never
  : P extends `${infer Key}[0]`
    ? Key extends keyof DB[T]
      ? DB[T][Key] extends (infer U)[] | undefined
        ? U
        : never
      : never
    : P extends keyof DB[T]
      ? DB[T][P] extends (infer U)[] | undefined
        ? U
        : DB[T][P]
      : never

export type ExtractArrayItemTypeWithTable<
  DB,
  TB extends keyof DB,
  P extends string,
> = P extends `${TB & string}.${infer Rest}`
  ? ExtractArrayItemType<DB, TB, Rest>
  : never

export type AnyArrayPropertyPathWithTable<DB, TB extends keyof any> =
  | {
      [T in TB]: T extends keyof DB
        ? `${T & string}.${AnyArrayPropertyPath<DB, T> & string}`
        : never
    }[TB]
  | {
      [A in keyof DB]: A extends string
        ? DB[A] extends DB[keyof DB]
          ? `${A & string}.${AnyArrayPropertyPath<DB, A> & string}`
          : never
        : never
    }[keyof DB]

export type AnyObjectPropertyPath<
  DB,
  T extends keyof DB,
  Depth extends number = 5,
  Path extends string = '',
> = Depth extends 0
  ? never
  : {
      [K in keyof DB[T]]:
        | (NonUndefined<DB[T][K]> extends object
            ? Path extends ''
              ? `${K & string}`
              : `${Path}.${K & string}`
            : never)
        | (DB[T][K] extends (infer U)[] | undefined
            ? NonUndefined<U> extends object
              ?
                  | (Path extends ''
                      ? `${K & string}[${number}]`
                      : `${Path}.${K & string}[${number}]`)
                  | AnyObjectPropertyPath<
                      { _: NonUndefined<U> },
                      '_',
                      Decrement[Depth],
                      Path extends ''
                        ? `${K & string}[${number}]`
                        : `${Path}.${K & string}[${number}]`
                    >
              : never
            : NonUndefined<DB[T][K]> extends object
              ? AnyObjectPropertyPath<
                  { _: NonUndefined<DB[T][K]> },
                  '_',
                  Decrement[Depth],
                  Path extends '' ? `${K & string}` : `${Path}.${K & string}`
                >
              : never)
    }[keyof DB[T]]

export type AnyObjectPropertyPathWithTable<DB, TB extends keyof any> =
  | {
      [T in TB]: T extends keyof DB
        ? `${T & string}.${AnyObjectPropertyPath<DB, T> & string}`
        : never
    }[TB]
  | {
      [A in keyof DB]: A extends string
        ? DB[A] extends DB[keyof DB]
          ? `${A & string}.${AnyObjectPropertyPath<DB, A> & string}`
          : never
        : never
    }[keyof DB]

/**
 * Just like {@link AnyObjectPropertyPathWithTable} but with a ` as <string>` suffix.
 */
export type AnyAliasedObjectPropertyPathWithTable<
  DB,
  TB extends keyof DB,
> = `${AnyObjectPropertyPathWithTable<DB, TB>} as ${string}`

export type AnyMatchingObjectPropertyPath<
  DB,
  T extends keyof DB,
  M,
  Depth extends number = 5,
  Path extends string = '',
> = Depth extends 0
  ? never
  : {
      [K in keyof DB[T]]:  // Include path if DB[T][K] is an object (not an array) that extends PartialM<M>
        | (NonUndefined<DB[T][K]> extends object
            ? NonUndefined<DB[T][K]> extends any[] | undefined
              ? never // Exclude array paths
              : NonUndefined<DB[T][K]> extends PartialKeyOfT<M>
                ? Path extends ''
                  ? `${K & string}`
                  : `${Path}.${K & string}`
                : never
            : never)
        | (DB[T][K] extends (infer U)[] | undefined
            ? NonUndefined<U> extends object
              ? // Include array item path if U extends PartialM<M>
                | (NonUndefined<U> extends PartialKeyOfT<M>
                      ? Path extends ''
                        ? `${K & string}[${number}]`
                        : `${Path}.${K & string}[${number}]`
                      : never)
                  // Recurse into array items
                  | AnyMatchingObjectPropertyPath<
                      { _: NonUndefined<U> },
                      '_',
                      M,
                      Decrement[Depth],
                      Path extends ''
                        ? `${K & string}[${number}]`
                        : `${Path}.${K & string}[${number}]`
                    >
              : never
            : NonUndefined<DB[T][K]> extends object
              ? // Recurse into object properties
                AnyMatchingObjectPropertyPath<
                  { _: NonUndefined<DB[T][K]> },
                  '_',
                  M,
                  Decrement[Depth],
                  Path extends '' ? `${K & string}` : `${Path}.${K & string}`
                >
              : never)
    }[keyof DB[T]]

/**
 * Just like {@link AnyArrayPropertyPathWithTable} but with a ` as <string>` suffix.
 */
export type AnyAliasedArrayPropertyPathWithTable<
  DB,
  TB extends keyof DB,
> = `${AnyArrayPropertyPathWithTable<DB, TB>} as ${string}`

/**
 * Just like {@link AnyColumn} but with a ` as <string>` suffix.
 */
export type AnyAliasedColumn<DB, TB extends keyof DB> = `${AnyColumn<
  DB,
  TB
>} as ${string}`

/**
 * Just like {@link AnyColumnWithTable} but with a ` as <string>` suffix.
 */
export type AnyAliasedColumnWithTable<
  DB,
  TB extends keyof DB,
> = `${AnyColumnWithTable<DB, TB>} as ${string}`

/**
 * Just like {@link AnyPropertyPath} but with a ` as <string>` suffix.
 */
export type AnyAliasedPropertyPath<
  DB,
  TB extends keyof DB,
> = `${AnyPropertyPath<DB, TB>} as ${string}`

/**
 * Extracts the item type of an array.
 */
export type ArrayItemType<T> = T extends ReadonlyArray<infer I> ? I : never

export type SimplifySingleResult<O> = O extends InsertResult
  ? O
  : O extends DeleteResult
    ? O
    : O extends UpdateResult
      ? O
      : O extends MergeResult
        ? O
        : Simplify<O> | undefined

export type SimplifyResult<O> = O extends InsertResult
  ? O
  : O extends DeleteResult
    ? O
    : O extends UpdateResult
      ? O
      : O extends MergeResult
        ? O
        : Simplify<O>

export type Simplify<T> = DrainOuterGeneric<{ [K in keyof T]: T[K] } & {}>

/**
 * Represents a database row whose column names and their types are unknown.
 */
export type UnknownRow = Record<string, unknown>

/**
 * Makes all properties of object type `T` nullable.
 */
export type Nullable<T> = { [P in keyof T]: T[P] | null }

/**
 * Evaluates to `true` if `T` is `never`.
 */
export type IsNever<T> = [T] extends [never] ? true : false

/**
 * Evaluates to `true` if `T` is `any`.
 */
export type IsAny<T> = 0 extends T & 1 ? true : false

/**
 * Evaluates to `true` if the types `T` and `U` are equal.
 */
export type Equals<T, U> =
  (<G>() => G extends T ? 1 : 2) extends <G>() => G extends U ? 1 : 2
    ? true
    : false

export type NarrowPartial<O, T> = DrainOuterGeneric<
  T extends object
    ? {
        [K in keyof O & string]: K extends keyof T
          ? T[K] extends NotNull
            ? Exclude<O[K], null>
            : T[K] extends O[K]
              ? T[K]
              : KyselyTypeError<`$narrowType() call failed: passed type does not exist in '${K}'s type union`>
          : O[K]
      }
    : never
>

/**
 * A type constant for marking a column as not null. Can be used with `$narrowPartial`.
 *
 * Example:
 *
 * ```ts
 * import type { NotNull } from 'kysely'
 *
 * await db.selectFrom('person')
 *   .where('nullable_column', 'is not', null)
 *   .selectAll()
 *   .$narrowType<{ nullable_column: NotNull }>()
 *   .executeTakeFirstOrThrow()
 * ```
 */
export type NotNull = { readonly __notNull__: unique symbol }

export type SqlBool = boolean | 0 | 1

/**
 * Utility to reduce depth of TypeScript's internal type instantiation stack.
 *
 * Example:
 *
 * ```ts
 * type A<T> = { item: T }
 *
 * type Test<T> = A<
 *   A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<T>>>>>>>>>>>>>>>>>>>>>>>>
 * >
 *
 * // type Error = Test<number> // Type instantiation is excessively deep and possibly infinite.ts (2589)
 * ```
 *
 * To fix this, we can use `DrainOuterGeneric`:
 *
 * ```ts
 * type A<T> = DrainOuterGeneric<{ item: T }>
 *
 * type Test<T> = A<
 *  A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<A<T>>>>>>>>>>>>>>>>>>>>>>>>
 * >
 *
 * type Ok = Test<number> // Ok
 * ```
 */
export type DrainOuterGeneric<T> = [T] extends [unknown] ? T : never

export type ShallowRecord<K extends keyof any, T> = DrainOuterGeneric<{
  [P in K]: T
}>

type DirectExtract<T, P extends string> = T extends any
  ? P extends keyof T
    ? T[P]
    : never
  : never

// Utility type to make all properties of T optional
type PartialKeyOfT<T> = { [K in keyof T]?: T[K] }

// Utility type to exclude undefined from a type
type NonUndefined<T> = T extends undefined ? never : T

interface TestDatabase {
  user: {
    id: number
    name: string
    numbers?: number[]
    nested: {
      id: number
      items: string[]
      deeper?: {
        id: number
        values?: boolean[]
        other: number
        evenDeeper: {
          id: number
          more: number[]
        }
      }
      arrayOfObjects: { id: number; values: string[]; other: number }[]
    }
  }
  settings: {
    otherArray: { data: number[]; extra: string }[]
  }
}

// For testing purposes, to ensure the types work as expected
// type ArrayProps = AnyArrayPropertyPath<TestDatabase, 'user'>
// const useExample: ArrayProps = 'nested.arrayOfObjects[0].values'
// type ObjectProps = AnyMatchingObjectPropertyPath<
//   TestDatabase,
//   'user',
//   { id: number }
// >
// const objExample: ObjectProps = 'nested.arrayOfObjects[8]'
// type SettingsArrayProps = AnyArrayPropertyPath<TestDatabase, 'settings'>
// const settingsExample: SettingsArrayProps = 'otherArray[0].data'

// // Used for type testing purposes
// // const x: AnyPropertyPath<Database, 'families'> = 'parents[0].firstName'
// // const c: ExtractPropertyPathType<Family, 'address'> = {
// //   state: 'California',
// //   county: 'Los Angeles',
// //   city: 'Los Angeles',
// // }

// const t: ExtractPropertyPathType<Family, 'f.pedigree.region'> = ''
// // 1. Direct property access
// const testDirect: ExtractPropertyPathType<Family, 'id'> = '123' // string
// const testDirectOptional: ExtractPropertyPathType<Family, 'lastName'> = 'Smith' // string | undefined

// // 2. Nested property access
// const testNested: ExtractPropertyPathType<Family, 'address.state'> = 'CA' // string
// const testNestedOptional: ExtractPropertyPathType<Family, 'pedigree.region'> =
//   'North' // string

// // 3. Array items access
// const testArray: ExtractPropertyPathType<Family, 'parents[0]'> = {
//   firstName: 'John',
// } // Parent
// const testArrayNested: ExtractPropertyPathType<Family, 'parents[0].givenName'> =
//   'John' // string
// const testArrayDeep: ExtractPropertyPathType<
//   Family,
//   'children[0].pets[0].givenName'
// > = 'Fluffy' // string

// // 4. Ignoring irrelevant prefixes
// const testIgnorePrefix: ExtractPropertyPathType<Family, 'f.pedigree.region'> =
//   'South' // string
// const testIgnoreMultiplePrefixes: ExtractPropertyPathType<
//   Family,
//   'a.b.c.pedigree.region'
// > = 'East' // string
// const testIgnorePrefixArray: ExtractPropertyPathType<
//   Family,
//   'ignorethis.parents[0].givenName'
// > = 'Jane' // string

// // 5. Invalid paths
// const testInvalid: ExtractPropertyPathType<Family, 'nonexistent'> =
//   undefined as never // never
// const testInvalidNested: ExtractPropertyPathType<
//   Family,
//   'address.nonexistent'
// > = undefined as never // never
// const testInvalidArray: ExtractPropertyPathType<
//   Family,
//   'parents[0].nonexistent'
// > = undefined as never // never

// // 6. Additional tests
// const testArrayProperty: ExtractPropertyPathType<Family, 'parents.length'> = 5 // number
// const testOptionalArray: ExtractPropertyPathType<
//   Family,
//   'location.coordinates[0]'
// > = 10 // number
// const testMixedPath: ExtractPropertyPathType<
//   Family,
//   'address.state.nonexistent'
// > = undefined as never // never

// // Used for type testing purposes
// export interface Family {
//   id: string
//   lastName?: string
//   parents: Parent[]
//   children: Children[]
//   address: Address
//   creationDate: string
//   isRegistered: boolean
//   location?: Location
//   pedigree?: {
//     region: string
//   }
// }

// export interface Parent {
//   firstName?: string
//   familyName?: string
//   givenName?: string
//   colors?: string[]
// }

// export interface Children {
//   firstName?: string
//   gender: string
//   grade: number
//   pets?: Pet[]
//   familyName?: string
//   givenName?: string
// }

// export interface Pet {
//   givenName: string
// }

// export interface Address {
//   state: string
//   county: string
//   city: string
// }

// export interface Location {
//   type: string
//   coordinates: number[]
// }

// interface TestDatabase {
//   families: Family
// }
