import { InsertResult } from '../query-builder/insert-result.js'
import { DeleteResult } from '../query-builder/delete-result.js'
import { UpdateResult } from '../query-builder/update-result.js'
import { KyselyTypeError } from './type-error.js'
import { MergeResult } from '../query-builder/merge-result.js'
import { Kysely } from '../kysely.js'
import { sql } from '../raw-builder/sql.js'
import { Point } from 'geojson'
import { SelectExpression } from '../parser/select-parser.js'
import { AliasedExpressionOrFactory } from '../parser/expression-parser.js'

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
          ? NonNullable<DB[TB][K]> extends Array<infer AV>
            ?
                | K
                | `${K}[${number}]`
                | `${K}[${number}].${AnyPropertyPath<{ table: AV }, 'table', Decrement[Depth]>}`
            : NonNullable<DB[TB][K]> extends object
              ?
                  | K
                  | `${K}.${AnyPropertyPath<{ table: NonNullable<DB[TB][K]> }, 'table', Decrement[Depth]>}`
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
  [T in TB]: `${T & string}.${AnyPropertyPath<DB, T> & string}`
}[TB]

/**
 * Just like {@link AnyPropertyPathWithTable} but with a ` as <string>` suffix.
 */
export type AnyAliasedPropertyPathWithTable<
  DB,
  TB extends keyof DB,
> = `${AnyPropertyPathWithTable<DB, TB>} as ${string}`

export type AnyArrayPropertyPath<
  DB,
  T extends keyof DB,
  Depth extends number = 5,
  Path extends string = '',
> = Depth extends 0
  ? never
  : {
      [K in keyof DB[T]]: DB[T][K] extends any[] | undefined
        ?
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
        : NonUndefined<DB[T][K]> extends object
          ? AnyArrayPropertyPath<
              { _: NonUndefined<DB[T][K]> },
              '_',
              Decrement[Depth],
              Path extends '' ? `${K & string}` : `${Path}.${K & string}`
            >
          : never
    }[keyof DB[T]]

// Helper type to extract the item type of an array property
export type ExtractArrayItemType<
  DB,
  T extends keyof DB,
  P extends string,
> = P extends `${infer Key}[${number}].${infer Rest}`
  ? Key extends keyof DB[T]
    ? DB[T][Key] extends (infer U)[] | undefined
      ? U extends object
        ? ExtractArrayItemType<{ _: U }, '_', Rest>
        : U
      : never
    : never
  : P extends `${infer Key}[${number}]`
    ? Key extends keyof DB[T]
      ? DB[T][Key] extends (infer U)[] | undefined
        ? U
        : never
      : never
    : P extends `${infer Key}.${infer Rest}`
      ? Key extends keyof DB[T]
        ? DB[T][Key] extends (infer U)[] | undefined
          ? U extends object
            ? ExtractArrayItemType<{ _: U }, '_', Rest>
            : never
          : ExtractArrayItemType<{ _: DB[T][Key] }, '_', Rest>  // Handle object nesting
        : never
      : P extends keyof DB[T]  // Direct property
        ? DB[T][P] extends (infer U)[] | undefined
          ? U
          : never
        : never

export type ExtractArrayItemTypeWithTable<
  DB,
  TB extends keyof DB,
  P extends string,
> = P extends `${infer Table}.${infer Rest}`
  ? Table extends TB
    ? ExtractArrayItemType<DB, Table, Rest>
    : never
  : P extends TB & string  // Whole table is an array
    ? DB[TB] extends (infer U)[] | undefined
      ? U
      : never
    : never

export type AnyArrayPropertyPathWithTable<DB, TB extends keyof DB> = {
  [T in TB]: T extends keyof DB
    ? DB[T] extends any[] | undefined
      ? T & string // Include the table alias if it's an array
      : `${T & string}.${AnyArrayPropertyPath<DB, T> & string}`
    : never
}[TB]

export type AnyObjectPropertyPath<
  DB,
  T extends keyof DB,
  Depth extends number = 5,
  Path extends string = '',
> = Depth extends 0
  ? never
  : {
      [K in keyof DB[T]]: NonUndefined<DB[T][K]> extends object
        ? NonUndefined<DB[T][K]> extends Date
          ? never
          : NonUndefined<DB[T][K]> extends any[] | undefined
            ? DB[T][K] extends (infer U)[] | undefined
              ? U extends object
                ? U extends Date
                  ? never
                  :
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
              : never
            :
                | (Path extends '' ? `${K & string}` : `${Path}.${K & string}`)
                | AnyObjectPropertyPath<
                    { _: NonUndefined<DB[T][K]> },
                    '_',
                    Decrement[Depth],
                    Path extends '' ? `${K & string}` : `${Path}.${K & string}`
                  >
        : never
    }[keyof DB[T]]

export type AnyObjectPropertyPathWithTable<DB, TB extends keyof any> = {
  [T in TB]: T extends keyof DB
    ? `${T & string}.${AnyObjectPropertyPath<DB, T> & string}`
    : never
}[TB]

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
      [K in keyof DB[T]]: NonUndefined<DB[T][K]> extends object
        ? NonUndefined<DB[T][K]> extends any[] | undefined
          ? never // Exclude arrays
          : NonUndefined<DB[T][K]> extends PartialKeyOfT<M>
            ? Path extends ''
              ? `${K & string}`
              : `${Path}.${K & string}`
            : never
        :
            | never
            | (NonUndefined<DB[T][K]> extends object
                ? NonUndefined<DB[T][K]> extends any[] | undefined
                  ? never // Exclude array recursion
                  : AnyMatchingObjectPropertyPath<
                      { _: NonUndefined<DB[T][K]> },
                      '_',
                      M,
                      Decrement[Depth],
                      Path extends ''
                        ? `${K & string}`
                        : `${Path}.${K & string}`
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

export type AnyMatchingObjectPropertyPathWithTable<DB, TB extends keyof DB, M> = {
  [T in TB]: T extends keyof DB
    ? DB[T] extends any[] | undefined
      ? T & string // Include the table alias if it's an array
      : `${T & string}.${AnyMatchingObjectPropertyPath<DB, T, M> & string}`
    : never
}[TB]

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

//TODO: Move this to a separate file in test/typings
export interface BaseEntity {
  id: string
  schema: string
  tenantId?: string
  excludedAt?: Date
  _ts?: number
}

interface Nested {
  level1: {
    id1: string
    name1: string
    level2: {
      id2: string
      name2: string
      level3IsAnArray: {
        id3: string
        name3: string
        colors: string[]
        level4: {
          id4: string
          name4: string
        }
      }[]
      level3a: {
        id3a: string
        name3a: string
      }
    }
  }
}

interface Order extends BaseEntity {
  schema: string
  orderId: string
  userId: string
  total: number
  items?: {
    amount: number
    category: string
    taxes: {
      type: string
      rate: number
    }[]
    productId: string
    quantity: number
  }[]
  phoneNumbers?: string[]
  tags: { name: string }[]
  customer?: {
    firstName: string
    lastName: string
    address: {
      street: string
      city: string
      state: string
      zip: string
    }
    phoneNumbers?: string[]
  }
}

export interface Person extends BaseEntity {
  schema: string
  name: string
  email: string
  age: number
  active: boolean
  lastLogin: Date | null
  address: {
    number: number
    street?: string
    city: string
    coordinates?: {
      lat: number
      lon: number
    }
  }
  location: { type: 'Point' | 'Polygon'; coordinates: number[] }
  orders: Order[]
}

export interface Family extends BaseEntity {
  lastName?: string
  parents: Parent[]
  children: Children[]
  address: Address
  creationDate: string
  isRegistered: boolean
  deletedOn?: Date
}

export interface Parent {
  firstName?: string
  familyName?: string
  givenName?: string
  colors?: string[]
}

export interface Children {
  firstName?: string
  gender: string
  grade: number
  pets?: Pet[]
  familyName?: string
  givenName?: string
}

export interface Pet {
  givenName: string
  breed: string
  age: number
}

export interface Address {
  state: string
  county: string
  city: string
}

// Define the database schema. By convention, the property names (item collections) should be plural.
interface Database {
  persons: Person
  orders: Order
  families: Family
  nested: Nested
}

let a: AnyArrayPropertyPathWithTable<Database, 'orders'> = 'orders.phoneNumbers'

async function JoinTest(db: Kysely<Database>) {
  test('select all tests', async () => {
    const result1 = db.selectFrom('persons as p').selectAll().compile()

    const result2 = db
      .selectFrom('orders.customer.phoneNumbers as p')
      .selectAll()
      .compile()

    const result3 = db
      .selectFrom('orders.items[0] as firstItem')
      .selectAll()
      .compile()

    const result4 = db
      .selectFrom('orders.customer.phoneNumbers as p')
      .selectAll()
      .compile()

    const result5 = db
      .selectFrom('orders.items[0] as firstItem')
      .where('firstItem.taxes[0].type', '=', 'VAT')
      .selectAll()
      .compile()
  })

  test('alias test', async () => {
    const result = db
      .selectFrom('families as f')
      .select(['f.id', 'f.address.city'])
      .where('f.address.city', '=', 'Dallas')
      .compile()
  })

  test('deep select test', async () => {
    const result1 = db
      .selectFrom('nested as n')
      .select('n.level1.level2.level3IsAnArray[0].level4.name4')
      .compile()

    const result2 = db
      .selectFrom('nested as n')
      .select('n.level1.level2.level3IsAnArray[0].colors')
      .compile()
  })

  test('order by clause test', async () => {
    const result = db
      .selectFrom('families as f')
      .select(['f.id', 'f.address.city'])
      .orderBy('f.address.city', 'asc')
      .compile()
  })

  test('aggregate function test', async () => {
    const result = db
      .selectFrom('families as f')
      .select((eb) => eb.fn.count<number>('f.id').as('dallas_count'))
      .where('f.address.city', '=', 'Dallas')
      .compile()
  })

  test('in clause test', async () => {
    const states = ['NY', 'WA', 'CA', 'PA', 'OH', 'OR', 'MI', 'WI']
    const result = db
      .selectFrom('families as f')
      .select(['f.id', 'f.lastName', 'f.address'])
      .where('f.address.state', 'in', states)
      .compile()
  })

  test('value select test', async () => {
    const result = db
      .selectFrom('families as f')
      .select((eb) => eb.val('Hello World').as('some_value'))
      .compile()
  })

  test('select arithmetic expression test', async () => {
    const result = db
      .selectFrom('orders as o')
      .join('i in o.items')
      .select(
        sql<number>`(i.quantity * i.unitPrice) * (1 - i.discount)`.as('amount'),
      )
      .compile()
  })

  test('parameterized where test', async () => {
    const city = 'Dallas',
      state = 'TX'
    const result = db
      .selectFrom('families as f')
      .selectAll()
      .where('f.address.city', '=', city)
      .where('f.address.state', '=', state)
      .compile()
  })

  test('limit clause test', async () => {
    const result = db
      .selectFrom('families as f')
      .selectAll()
      .orderBy('f.address.city')
      .limit(10)
      .compile()
  })

  test('arrayContains function tests', async () => {
    const result1 = db
      .selectFrom('families as f')
      .selectAll()
      .where((eb) => eb.fn.arrayContains('f.children[4].pets', { age: 5 }))
      .compile()

    const result2 = db
      .selectFrom('orders.tags as t')
      .selectAll()
      .where((eb) => eb.fn.arrayContains('t', { name: 'electronics' }))
      .compile()

    const result3 = db
      .selectFrom('orders.customer.phoneNumbers as p')
      .selectAll()
      // .where((eb) => eb.fn.arrayContains('p', { name: 'electronics' }))
      .compile()

    const result4 = db
      .selectFrom('orders.customer.phoneNumbers as p')
      .selectAll()
      .where((eb) => eb.fn.arrayContains('p', '213-867-5309'))
      .compile()
  })

  test('distance function test', async () => {
    const geo: Point = { type: 'Point', coordinates: [31.9, -4.8] }
    const result = db
      .selectFrom('persons as p')
      .select((eb) => eb.fn.distance('p.location', geo).as('distance'))
      .where((eb) => eb.fn.distance('p.location', geo), '<', 30_000)
      .compile()
  })

  test('join test', async () => {
    const result = db
      .selectFrom('orders as o')
      .join('i in o.items')
      .select((eb) => eb.fn.sum('i.amount').as('totalAmount'))
      .where('o.total', '>=', 10_000)
      .where('i.category', '=', 'electronics')
      .compile()
  })

  // Cosmos DB does not support a HAVING clause but can be simulated by using a subquery.
  test('group by having simulation test', async () => {
    const subquery = db
      .selectFrom('orders as o')
      .join('i in o.items')
      .groupBy('i.category')
      .select((eb) => [
        'i.category',
        eb.fn.sum<number>('i.amount').as('totalAmount'),
      ])

    const result = db
      .selectFrom(subquery.as('grouped'))
      .where('grouped.totalAmount', '>', 250)
      .select(['grouped.category', 'grouped.totalAmount'])
      .compile()
  })

  test('group by with multiple joins test', async () => {
    const result = db
      .selectFrom('orders as o')
      .join('i in o.items')
      .join('t in o.tags')
      .groupBy('i.category')
      .select((eb) => [
        'i.category',
        eb.fn.sum<number>('i.amount').as('totalAmount'),
        't.name',
      ])
      .compile()
  })

  test('group by multiple columns test', async () => {
    const result = db
      .selectFrom('orders as o')
      .join('i in o.items')
      .groupBy(['i.category', 'i.productId'])
      .select((eb) => [
        'i.category',
        'i.productId',
        eb.fn.sum<number>('i.amount').as('totalAmount'),
      ])
      .compile()
  })

  test('join with group by and where clause test', async () => {
    const result = db
      .selectFrom('orders as o')
      .join('i in o.items')
      .where('o.total', '>', 100)
      .groupBy('i.category')
      .select((eb) => [
        'i.category',
        eb.fn.count<number>('i.productId').as('productCount'),
      ])
      .compile()
  })

  test('join with deeply nested array test', async () => {
    const result = db
      .selectFrom('orders as o')
      .join('i in o.items[5].taxes')
      .join('t in o.tags')
      .groupBy('t.name')
      .select(['t.name', (eb) => eb.fn.avg<number>('i.rate').as('totalAmount')])
      .compile()
  })

  test('subquery test', async () => {
    const subquery = db
      .selectFrom('families as f')
      .where('f.address.city', '=', 'Dallas')
      .select((eb) => [eb.fn.count<number>('f.id').as('familyCount')])

    const result = db
      .selectFrom(subquery.as('grouped'))
      .select(['grouped.familyCount'])
      .compile()
  })

  test('discriminator and logical deletion test', async () => {
    const result = db
      .selectFrom('families as f')
      .where(({ eb, or }) =>
        or([
          eb('f.address.city', '=', 'Dallas'),
          eb('f.address.city', '=', 'Austin'),
        ]),
      )
      .select(['f.id', 'f.address.city'])
      .compile()
  })

  test('group by having simulation test with discriminator and logical deletion', async () => {
    const subquery = db
      .selectFrom('orders as o')
      .join('i in o.items')
      .groupBy('i.category')
      .select((eb) => [
        'i.category',
        eb.fn.sum<number>('i.amount').as('totalAmount'),
      ])

    const result = db
      .selectFrom(subquery.as('grouped'))
      .where('grouped.totalAmount', '>', 250)
      .select(['grouped.category', 'grouped.totalAmount'])
      .compile()
  })

  test('select from nested object test', async () => {
    const result = db
      .selectFrom('orders.items[0] as i')
      .select('i.taxes')
      .orderBy('i.taxes[0].type')
      .compile()

    const result1 = db
      .selectFrom('orders.items[0].taxes[3] as t')
      .select('t.type')
      .compile()
  })

  test('select from nested object test', async () => {
    const result = db
      .selectFrom('orders.customer as c')
      .select('c.firstName')
      .compile()
  })

  test('select indexed-access off optional array test', async () => {
    const result1 = db
      .selectFrom('orders as o')
      .select('o.items[0].quantity')
      .compile()

    const result2 = db
      .selectFrom('orders as o')
      .select((eb) =>
        eb.fn.intBitOr('o.total', 'o.items[0].quantity').as('orValues'),
      )
      .compile()
  })

  test('join test with deep path select', async () => {
    const result1 = db
      .selectFrom('orders as o')
      .join('i in o.items')
      .select('i.taxes[5] as t')
      .compile()

    const result2 = db
      .selectFrom('orders as o')
      .join('i in o.items')
      .select('i.taxes as taxes')
      .compile()

    const result3 = db
      .selectFrom('orders as o')
      .join('i in o.items')
      .select('i.taxes[0].type as taxType')
      .compile()

    const result4 = db
      .selectFrom('orders as o')
      .join('i in o.items')
      .select('i.taxes[0].type')
      .compile()

    const result5 = db
      .selectFrom('orders as o')
      .join('i in o.items')
      .select('i.taxes[0] as firstTax') //TODO: Shouldn't an alias be required when selecting an array element?
      .compile()

    const result6 = db
      .selectFrom('orders as o')
      .join('i in o.items')
      .select('i.productId')
      .compile()
  })

  // Diagnostic type to inspect SelectExpression for the joined query
  type DiagnosticSelectExpression = SelectExpression<
    Database & { o: Order } & { i: ArrayItemType<Order['items']> },
    'o' | 'i'
  >

  // Diagnostic type to check assignability
  type DiagnosticIsAssignable =
    'i.taxes[0].type' extends DiagnosticSelectExpression ? true : false // Should be DiagnosticIsAssignable = true
  type DiagnosticIsAliasedAssignable =
    'i.taxes[0].type as taxType' extends DiagnosticSelectExpression
      ? true // Should be DiagnosticIsAliasedAssignable = true
      : false
}
