import { z } from 'zod';

/**
 * DSL pequena, tipada e validada para condições e efeitos.
 * Nunca executa código: é interpretada pelo motor sobre variáveis declaradas.
 */
const IdSchema = z.string().min(1).max(64).regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/);

export const VariableTypeSchema = z.enum(['number', 'boolean', 'string']);
export type VariableType = z.infer<typeof VariableTypeSchema>;

/**
 * Escopo de uma variável:
 * - `lesson` (padrão): nasce com `initial` em cada tentativa da aula;
 * - `course`: o valor atravessa as aulas do curso. Ao criar uma tentativa, o
 *   servidor procura o valor mais recente nas tentativas da mesma matrícula e o
 *   usa no lugar de `initial` (ver `createInitialState(graph, { carried })`).
 *   Cada aula que lê a variável precisa declará-la, com o mesmo tipo.
 */
export const VariableScopeSchema = z.enum(['lesson', 'course']);
export type VariableScope = z.infer<typeof VariableScopeSchema>;

export const VariableDeclarationSchema = z.object({
  name: IdSchema,
  type: VariableTypeSchema,
  initial: z.union([z.number(), z.boolean(), z.string().max(200)]),
  label: z.string().max(80).optional(),
  /**
   * Ausente = `lesson` (compatível com documentos antigos). Opcional no tipo
   * (em vez de `.default`) para que quem monta declarações à mão — editor do
   * estúdio, exemplos, testes — não precise informar o escopo.
   */
  scope: VariableScopeSchema.optional(),
});
export type VariableDeclaration = z.infer<typeof VariableDeclarationSchema>;

/** Escopo efetivo de uma declaração (`lesson` quando ausente). */
export function variableScope(v: Pick<VariableDeclaration, 'scope'>): VariableScope {
  return v.scope ?? 'lesson';
}

/** Tipo de um valor escalar no vocabulário das variáveis. */
export function scalarType(v: Scalar): VariableType {
  return typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string';
}

export const ScalarSchema = z.union([z.number(), z.boolean(), z.string().max(200)]);
export type Scalar = z.infer<typeof ScalarSchema>;

export type Condition =
  | { op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; var: string; value: Scalar }
  | { op: 'in'; var: string; values: Scalar[] }
  | { op: 'and' | 'or'; conditions: Condition[] }
  | { op: 'not'; condition: Condition }
  | { op: 'answered'; nodeId: string; optionId?: string }
  | { op: 'passed'; nodeId: string }
  | { op: 'always' };

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.object({ op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']), var: IdSchema, value: ScalarSchema }),
    z.object({ op: z.literal('in'), var: IdSchema, values: z.array(ScalarSchema).min(1).max(50) }),
    z.object({ op: z.enum(['and', 'or']), conditions: z.array(ConditionSchema).min(1).max(20) }),
    z.object({ op: z.literal('not'), condition: ConditionSchema }),
    z.object({ op: z.literal('answered'), nodeId: IdSchema, optionId: IdSchema.optional() }),
    z.object({ op: z.literal('passed'), nodeId: IdSchema }),
    z.object({ op: z.literal('always') }),
  ]),
) as z.ZodType<Condition>;

export const EffectSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set'), var: IdSchema, value: ScalarSchema }),
  z.object({ op: z.literal('inc'), var: IdSchema, by: z.number().finite() }),
]);
export type Effect = z.infer<typeof EffectSchema>;

export type VariableValues = Record<string, Scalar>;

export interface EvaluationContext {
  variables: VariableValues;
  /** nodeId -> optionIds escolhidos (choice ou assessment) */
  answers: Record<string, { optionIds?: string[]; text?: string; passed?: boolean }>;
}

export function evaluateCondition(cond: Condition | undefined, ctx: EvaluationContext): boolean {
  if (!cond) return true;
  switch (cond.op) {
    case 'always':
      return true;
    case 'and':
      return cond.conditions.every((c) => evaluateCondition(c, ctx));
    case 'or':
      return cond.conditions.some((c) => evaluateCondition(c, ctx));
    case 'not':
      return !evaluateCondition(cond.condition, ctx);
    case 'in':
      return cond.values.includes(ctx.variables[cond.var] as Scalar);
    case 'answered': {
      const a = ctx.answers[cond.nodeId];
      if (!a) return false;
      if (cond.optionId === undefined) return true;
      return (a.optionIds ?? []).includes(cond.optionId);
    }
    case 'passed':
      return ctx.answers[cond.nodeId]?.passed === true;
    default: {
      const left = ctx.variables[cond.var];
      const right = cond.value;
      if (left === undefined) return false;
      switch (cond.op) {
        case 'eq':
          return left === right;
        case 'neq':
          return left !== right;
        case 'gt':
          return typeof left === 'number' && typeof right === 'number' && left > right;
        case 'gte':
          return typeof left === 'number' && typeof right === 'number' && left >= right;
        case 'lt':
          return typeof left === 'number' && typeof right === 'number' && left < right;
        case 'lte':
          return typeof left === 'number' && typeof right === 'number' && left <= right;
      }
    }
  }
}

export function applyEffects(effects: Effect[] | undefined, variables: VariableValues): VariableValues {
  if (!effects || effects.length === 0) return variables;
  const next: VariableValues = { ...variables };
  for (const e of effects) {
    if (e.op === 'set') {
      next[e.var] = e.value;
    } else if (e.op === 'inc') {
      const cur = next[e.var];
      next[e.var] = (typeof cur === 'number' ? cur : 0) + e.by;
    }
  }
  return next;
}

/** Erros de tipo estáticos de uma condição frente às variáveis declaradas. */
export function checkConditionTypes(
  cond: Condition | undefined,
  vars: Map<string, VariableType>,
  knownNodeIds: Set<string>,
  path = 'condition',
): string[] {
  if (!cond) return [];
  const errors: string[] = [];
  const typeOf = (v: Scalar): VariableType => (typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string');
  switch (cond.op) {
    case 'always':
      break;
    case 'and':
    case 'or':
      cond.conditions.forEach((c, i) => errors.push(...checkConditionTypes(c, vars, knownNodeIds, `${path}.${cond.op}[${i}]`)));
      break;
    case 'not':
      errors.push(...checkConditionTypes(cond.condition, vars, knownNodeIds, `${path}.not`));
      break;
    case 'in': {
      const t = vars.get(cond.var);
      if (!t) errors.push(`${path}: variável "${cond.var}" não declarada`);
      else if (cond.values.some((v) => typeOf(v) !== t)) errors.push(`${path}: valores de "in" não são do tipo ${t}`);
      break;
    }
    case 'answered':
    case 'passed':
      if (!knownNodeIds.has(cond.nodeId)) errors.push(`${path}: nó "${cond.nodeId}" não existe`);
      break;
    default: {
      const t = vars.get(cond.var);
      if (!t) errors.push(`${path}: variável "${cond.var}" não declarada`);
      else if (typeOf(cond.value) !== t) errors.push(`${path}: comparação de "${cond.var}" (${t}) com valor ${typeOf(cond.value)}`);
      else if (['gt', 'gte', 'lt', 'lte'].includes(cond.op) && t !== 'number')
        errors.push(`${path}: operador ${cond.op} exige variável numérica`);
    }
  }
  return errors;
}

export function checkEffectTypes(effects: Effect[] | undefined, vars: Map<string, VariableType>, path = 'effects'): string[] {
  if (!effects) return [];
  const errors: string[] = [];
  effects.forEach((e, i) => {
    const t = vars.get(e.var);
    if (!t) {
      errors.push(`${path}[${i}]: variável "${e.var}" não declarada`);
      return;
    }
    if (e.op === 'inc' && t !== 'number') errors.push(`${path}[${i}]: "inc" exige variável numérica`);
    if (e.op === 'set') {
      const vt = typeof e.value === 'number' ? 'number' : typeof e.value === 'boolean' ? 'boolean' : 'string';
      if (vt !== t) errors.push(`${path}[${i}]: atribuição de ${vt} em variável ${t}`);
    }
  });
  return errors;
}
