import { AliasNode } from '../operation-node/alias-node.js';
import { ColumnNode } from '../operation-node/column-node.js';
import { ReferenceNode } from '../operation-node/reference-node.js';
import { TableNode } from '../operation-node/table-node.js';
import { isReadonlyArray, isString } from '../util/object-utils.js';
import {
  AnyArrayPropertyPath,
  AnyArrayPropertyPathWithTable,
  AnyColumn,
  AnyColumnWithTable,
  AnyDateTimePropertyPath,
  AnyDateTimePropertyPathWithTable,
  AnyMatchingObjectPropertyPath,
  AnyMatchingObjectPropertyPathWithTable,
  AnyObjectPropertyPath,
  AnyObjectPropertyPathWithTable,
  AnyPropertyPath,
  AnyPropertyPathWithTable,
  AnyStringPropertyPath,
  AnyStringPropertyPathWithTable,
  ExtractColumnType,
  ExtractPropertyPathType,
} from '../util/type-utils.js';
import { SelectQueryBuilderExpression } from '../query-builder/select-query-builder-expression.js';
import { parseExpression, ExpressionOrFactory, isExpressionOrFactory } from './expression-parser.js';
import { DynamicReferenceBuilder } from '../dynamic/dynamic-reference-builder.js';
import { SelectType, UpdateType } from '../util/column-type.js';
import { IdentifierNode } from '../operation-node/identifier-node.js';
import { OperationNode } from '../operation-node/operation-node.js';
import { Expression } from '../expression/expression.js';
import { SimpleReferenceExpressionNode } from '../operation-node/simple-reference-expression-node.js';
import { OrderByDirection, isOrderByDirection, parseOrderBy } from './order-by-parser.js';
import { JSONOperatorWith$, OperatorNode, isJSONOperator } from '../operation-node/operator-node.js';
import { JSONReferenceNode } from '../operation-node/json-reference-node.js';
import { JSONOperatorChainNode } from '../operation-node/json-operator-chain-node.js';
import { JSONPathNode } from '../operation-node/json-path-node.js';
import { ExtractTypeFromStringSelectExpression } from './select-parser.js';
import * as exp from 'constants';

export type AnyReference<DB, TB extends keyof DB> =
  | AnyColumn<DB, TB>
  | AnyColumnWithTable<DB, TB>
  | AnyPropertyPath<DB, TB>
  | AnyPropertyPathWithTable<DB, TB>;

export type StringReference<DB, TB extends keyof DB> = AnyStringPropertyPath<DB, TB> | AnyStringPropertyPathWithTable<DB, TB>;

export type DateTimeReference<DB, TB extends keyof DB> = AnyDateTimePropertyPath<DB, TB> | AnyDateTimePropertyPathWithTable<DB, TB>;

export type ObjectReference<DB, TB extends keyof DB> = AnyObjectPropertyPath<DB, TB> | AnyObjectPropertyPathWithTable<DB, TB>;

export type MatchingObjectReference<DB, TB extends keyof DB, M> =
  | AnyMatchingObjectPropertyPath<DB, TB, M>
  | AnyMatchingObjectPropertyPathWithTable<DB, TB, M>;

export type ArrayReference<DB, TB extends keyof DB> = AnyArrayPropertyPath<DB, TB> | AnyArrayPropertyPathWithTable<DB, TB>;

export type SimpleReferenceExpression<DB, TB extends keyof DB> = AnyReference<DB, TB> | DynamicReferenceBuilder<any>;

export type ReferenceExpression<DB, TB extends keyof DB> = SimpleReferenceExpression<DB, TB> | ExpressionOrFactory<DB, TB, any>;

export type ReferenceExpressionOrList<DB, TB extends keyof DB> = ReferenceExpression<DB, TB> | ReadonlyArray<ReferenceExpression<DB, TB>>;

export type ExtractTypeFromReferenceExpression<DB, TB extends keyof DB, RE, DV = unknown> = SelectType<
  ExtractRawTypeFromReferenceExpression<DB, TB, RE, DV>
>;

export type ExtractRawTypeFromReferenceExpression<DB, TB extends keyof DB, RE, DV = unknown> = RE extends string
  ? //? ExtractTypeFromStringReference<DB, TB, RE>
    ExtractTypeFromStringSelectExpression<DB, TB, RE> // experimental
  : RE extends SelectQueryBuilderExpression<infer O>
    ? O[keyof O] | null
    : RE extends (qb: any) => SelectQueryBuilderExpression<infer O>
      ? O[keyof O] | null
      : RE extends Expression<infer O>
        ? O
        : RE extends (qb: any) => Expression<infer O>
          ? O
          : DV;

export type ExtractTypeFromStringReference<DB, TB extends keyof DB, RE extends string, DV = unknown> =
  RE extends AnyPropertyPath<DB, TB>
    ? ExtractPropertyPathType<DB[TB], RE> //TODO: not working with aliased references? The property type is not extracted.
    : RE extends `${infer SC}.${infer T}.${infer C}`
      ? `${SC}.${T}` extends TB
        ? C extends keyof DB[`${SC}.${T}`]
          ? DB[`${SC}.${T}`][C]
          : never
        : never
      : RE extends `${infer T}.${infer C}`
        ? T extends TB
          ? C extends keyof DB[T]
            ? DB[T][C]
            : never
          : never
        : RE extends AnyColumn<DB, TB>
          ? ExtractColumnType<DB, TB, RE>
          : DV;

export type OrderedColumnName<C extends string> = C extends `${string} ${infer O}` ? (O extends OrderByDirection ? C : never) : C;

export type ExtractColumnNameFromOrderedColumnName<C extends string> = C extends `${infer CL} ${infer O}`
  ? O extends OrderByDirection
    ? CL
    : never
  : C;

export function parseSimpleReferenceExpression(exp: SimpleReferenceExpression<any, any>): SimpleReferenceExpressionNode {
  if (isString(exp)) {
    return parseStringReference(exp);
  }

  return exp.toOperationNode();
}

export function parseReferenceExpressionOrList(arg: ReferenceExpressionOrList<any, any>): OperationNode[] {
  if (isReadonlyArray(arg)) {
    return arg.map(it => parseReferenceExpression(it));
  } else {
    return [parseReferenceExpression(arg)];
  }
}

export function parseReferenceExpression(exp: ReferenceExpression<any, any>): OperationNode {
  if (isExpressionOrFactory(exp)) {
    return parseExpression(exp);
  }

  return parseSimpleReferenceExpression(exp);
}

export function parseJSONReference(ref: string, op: JSONOperatorWith$): JSONReferenceNode {
  const referenceNode = parseStringReference(ref);

  if (isJSONOperator(op)) {
    return JSONReferenceNode.create(referenceNode, JSONOperatorChainNode.create(OperatorNode.create(op)));
  }

  const opWithoutLastChar = op.slice(0, -1);

  if (isJSONOperator(opWithoutLastChar)) {
    return JSONReferenceNode.create(referenceNode, JSONPathNode.create(OperatorNode.create(opWithoutLastChar)));
  }

  throw new Error(`Invalid JSON operator: ${op}`);
}

export function parseStringReference(ref: string): ReferenceNode {
  const SEPARATOR = '.';

  if (!ref.includes(SEPARATOR)) {
    return ReferenceNode.create(ColumnNode.create(ref));
  }

  const parts = ref.split(SEPARATOR).map(trim);

  // Split the ref into two parts: the first part (the table name or alias) is up to the first period, and the rest is the second part (the property path).
  // eg, persons.address.city or p.address.city
  const [firstPart, ...restParts] = ref.split(SEPARATOR);
  const secondPart = restParts.join(SEPARATOR);

  return parseStringReferenceWithTable([firstPart, secondPart]);
}

export function parseAliasedStringReference(ref: string): SimpleReferenceExpressionNode | AliasNode {
  const ALIAS_SEPARATOR = ' as ';

  if (ref.includes(ALIAS_SEPARATOR)) {
    const [columnRef, alias] = ref.split(ALIAS_SEPARATOR).map(trim);

    return AliasNode.create(parseStringReference(columnRef), IdentifierNode.create(alias));
  } else {
    return parseStringReference(ref);
  }
}

export function parseColumnName(column: AnyColumn<any, any>): ColumnNode {
  return ColumnNode.create(column);
}

export function parseOrderedColumnName(column: string): OperationNode {
  const ORDER_SEPARATOR = ' ';

  if (column.includes(ORDER_SEPARATOR)) {
    const [columnName, order] = column.split(ORDER_SEPARATOR).map(trim);

    if (!isOrderByDirection(order)) {
      throw new Error(`invalid order direction "${order}" next to "${columnName}"`);
    }

    return parseOrderBy([columnName, order])[0];
  } else {
    return parseColumnName(column);
  }
}

function parseStringReferenceWithTableAndSchema(parts: string[]): ReferenceNode {
  const [schema, table, column] = parts;

  return ReferenceNode.create(ColumnNode.create(column), TableNode.createWithSchema(schema, table));
}

function parseStringReferenceWithTable(parts: string[]): ReferenceNode {
  const [table, column] = parts;

  return ReferenceNode.create(ColumnNode.create(column), TableNode.create(table));
}

function trim(str: string): string {
  return str.trim();
}
