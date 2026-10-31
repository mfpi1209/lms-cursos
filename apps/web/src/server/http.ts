import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DomainError, httpStatusFor } from '@lms/db';
import { HttpError } from './viewer';

export type ApiErrorBody = { error: { code: string; message: string; details?: unknown } };

/** Padroniza erros de Route Handlers: DomainError -> status do domínio; Zod -> 422. */
export function handleError(e: unknown): NextResponse<ApiErrorBody> {
  if (e instanceof HttpError) return NextResponse.json({ error: { code: `HTTP_${e.status}`, message: e.message, details: e.details } }, { status: e.status });
  if (e instanceof DomainError) return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: httpStatusFor[e.code] });
  if (e instanceof z.ZodError) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Dados inválidos', details: e.issues } }, { status: 422 });
  console.error(e);
  return NextResponse.json({ error: { code: 'INTERNAL', message: 'Erro interno' } }, { status: 500 });
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, 'Corpo da requisição inválido');
  }
  return schema.parse(json);
}

export function route<T>(fn: () => Promise<T>): Promise<NextResponse> {
  return fn().then((data) => NextResponse.json(data as object)).catch(handleError);
}
