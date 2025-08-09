import { Kysely } from '..'
// import { expectType, expectError } from 'tsd'

export interface BaseEntity {
  id: string
  schema: string
  tenantId?: string
  excludedAt?: Date
  _ts?: number
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
  customer: {
    firstName: string
    lastName: string
    address: {
      street: string
      city: string
      state: string
      zip: string
    }
    phone: string
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
  families: Family
}

async function JoinTest(db: Kysely<Database>) {
  const issue1 = await db.selectFrom('persons as p').selectAll().compile()
  const issue2 = await db
    .selectFrom('persons as p')
    .selectAll()
    .where('p.age', '<=', 18)
    .compile()
  const noIssue = await db.selectFrom('persons as p').select('p.name').compile()

  const result1 = db
    .selectFrom('orders as o')
    .join('i in o.items')
    .join('t in o.tags')
    .join('x in i.taxes')
    .groupBy('i.category')
    .select((eb) => [
      'i.category',
      eb.fn.sum<number>('i.amount').as('totalAmount'),
      'x.type as taxType',
    ])
    .compile()

  const result2 = db
    .selectFrom('orders as o')
    .join('i in o.items[5].taxes')
    .join('t in o.tags')
    .groupBy('t.name')
    .select((eb) => eb.fn.sum<number>('i.rate').as('totalAmount'))
    .compile()

  const result3 = db
    .selectFrom('orders.items[0] as i')
    .select('i.taxes')
    .orderBy('i.taxes[0].type')
    .compile()

  const result4 = db
    .selectFrom('orders.items[0].taxes[3] as t')
    .select('t.type')
    .compile()

  const result5 = db
    .selectFrom('orders.customer as c')
    .select('c.firstName')
    .compile()
}
