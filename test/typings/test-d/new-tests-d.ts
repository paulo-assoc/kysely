import { Point } from 'geojson'
import { Expression, ExpressionBuilder, Kysely, sql } from '..'
import {
  AnyAliasedArrayPropertyPathWithTable,
  AnyAliasedObjectPropertyPathWithTable,
  AnyPropertyPath,
  AnyPropertyPathWithTable,
} from '../../../dist/cjs/util/type-utils'
// import { expectType, expectError } from 'tsd'

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
  items: {
    amount: number
    category: string
    taxes: {
      type: string
      rate: number
    }[]
    productId: string
    quantity: number
  }[]
  tags: { name: string }[]
  colors: string[]
  customer: {
    firstName: string
    lastName: string
    address: {
      street: string
      city: string
      state: string
      zip: string
    }
    phoneNumbers: string[]
  }
}

interface Order2 {
  orderId: string
  items: {
    taxes: {
      type: string
    }[]
  }[]
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
    street: string
    city: string
    coordinates: {
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
  orders2: Order2
  families: Family
  nested: Nested
}

async function JoinTest(db: Kysely<Database>) {
  test('select all tests', async () => {
    const result1 = db.selectFrom('persons as p').selectAll().compile()

    const result1a = await db
      .selectFrom('persons as p')
      .selectValue('p.age')
      .compile()

    const result2 = db
      .selectFrom('orders.customer.phoneNumbers as p')
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
      .where((eb) => eb.fn.arrayContains('f.children[0].pets', { age: 5 }))
      .compile()

    const result2 = db
      .selectFrom('orders.tags as t')
      .selectAll()
      .where((eb) => eb.fn.arrayContains('t', { name: 'electronics' }))
      .compile()

    const result3 = db
      .selectFrom('orders.tags as t')
      .selectAll()
      .where((eb) => eb.fn.arrayContains('t', { name: 'electronics' }))
      .compile()

    const result4 = db
      .selectFrom('orders.customer.phoneNumbers as p')
      .selectAll()
      .where((eb) => eb.fn.arrayContains('p', '213-867-8309'))
      .compile()

    const createColorsPredicate = (
      eb: ExpressionBuilder<
        Database & {
          o: Order
        },
        'o'
      >,
      colors: string[],
    ) => {
      return eb.or(
        colors.map((color) => eb.fn.arrayContains(`o.colors`, color)),
      )
    }

    const result5 = db
      .selectFrom('orders as o')
      .where((eb) => createColorsPredicate(eb, ['red', 'blue']))
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

  // Cosmos DB does not support a HAVING clause can be simulated by using a subquery.
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

  test('join test with deep path select', async () => {
    const case1 = db
      .selectFrom('orders as o')
      .join('i in o.items')
      .select('i.taxes')
      .compile()

    const case2 = db
      .selectFrom('orders as o')
      .join('i in o.items')
      .select('i.taxes[0].type')
      .compile()
  })

  type T1 = AnyPropertyPath<Database, 'orders2'>
  type T2 = AnyPropertyPathWithTable<Database, 'orders2'>

  type AnyAliasedArray = AnyAliasedArrayPropertyPathWithTable<
    Database,
    'orders'
  >

  type AnyAliasedObjects = AnyAliasedObjectPropertyPathWithTable<
    Database,
    'nested'
  >

  type AnyAliasedObjects2 = AnyAliasedObjectPropertyPathWithTable<
    Database,
    'orders'
  >
}
