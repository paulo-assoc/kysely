import { Kysely } from '..'
// import { expectType, expectError } from 'tsd'

class Order {
  schema: string = 'orders'
  orderId: string = ''
  userId: string = ''
  total: number = 0
  items: {
    amount: number
    category: string
    taxes: {
      type: string
      rate: number
    }[]
    productId: string
    quantity: number
  }[] = []
  tags: { name: string }[] = []
}

interface Database {
  orders: Order
}

async function JoinTest(db: Kysely<Database>) {
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
}
