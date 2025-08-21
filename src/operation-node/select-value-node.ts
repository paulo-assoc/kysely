import { freeze } from '../util/object-utils.js'
import { OperationNode } from './operation-node.js'

export interface SelectValueNode extends OperationNode {
  readonly kind: 'SelectValueNode'
}

/**
 * @internal
 */
export const SelectValueNode = freeze({
  is(node: OperationNode): node is SelectValueNode {
    return node.kind === 'SelectValueNode'
  },

  create(): SelectValueNode {
    return freeze({
      kind: 'SelectValueNode',
    })
  },
})
