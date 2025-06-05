import {
  Kysely,
  Generated,
  DummyDriver,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from '../..'

class BaseEntity {
  id: string = ''
  schema: string
  tenantId?: string
  excludedAt?: Date
  _ts?: number
}

class Order {
  schema: string = 'Order'
  orderId: string
  userId: string
  items: { productId: string; quantity: number }[] = []
}

class Person extends BaseEntity {
  schema: string = 'Person'
  first_name: string
  age: number = 0
  address: {
    street: string
    city: string
    coordinates: { lat: number; lon: number }
  } = { street: '', city: '', coordinates: { lat: 0, lon: 0 } }
  location: { type: 'Point' | 'Polygon'; coordinates: number[] } = {
    type: 'Point',
    coordinates: [0, 0],
  }
  orders: Order[] = []
}

class Database {
  person: Person
  order: Order
}

const db = new Kysely<Database>({
  dialect: {
    createAdapter() {
      return new SqliteAdapter()
    },
    createDriver() {
      return new DummyDriver()
    },
    createIntrospector(db: Kysely<any>) {
      return new SqliteIntrospector(db)
    },
    createQueryCompiler() {
      return new SqliteQueryCompiler()
    },
  },
})

window.addEventListener('load', () => {
  const sql = db
    .selectFrom('person')
    .select(['id', 'first_name as name', 'address.city as city'])
    .where('address.street', '=', 'Main St')
    .where('address.city', 'in', ['New York', 'Los Angeles'])
    .groupBy('city')
    .having('address.coordinates', '=', { lon: 0, lat: 0 })
    .compile()

  const sql2 = db
    .selectFrom('person')
    .select(['orders[0].orderId', 'orders[0].items[0].productId'])
    .where('id', '=', '1')
    .execute()

  const result = document.createElement('span')
  result.id = 'result'
  result.innerHTML = sql.sql

  document.body.appendChild(result)
})
