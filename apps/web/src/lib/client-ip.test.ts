import { describe, expect, it } from 'vitest';
import { clientIpConfigFromEnv, invalidTrustedProxies, resolveClientIp, resolveClientPort } from './client-ip';

const prod = { NODE_ENV: 'production' };
const h = (o: Record<string, string>) => new Headers(o);

describe('IP do cliente atrás do proxy', () => {
  it('padrão: lê x-forwarded-for, só com um valor (cadeia sem proxies de confiança é ambígua)', () => {
    const cfg = clientIpConfigFromEnv({});
    expect(cfg).toEqual({ headers: ['x-forwarded-for'], trustedProxies: [], portHeader: null });
    expect(resolveClientIp(h({ 'x-forwarded-for': '203.0.113.5' }), cfg, prod)).toBe('203.0.113.5');
    expect(resolveClientIp(h({ 'x-forwarded-for': '1.2.3.4, 203.0.113.5' }), cfg, prod)).toBeNull();
    expect(resolveClientIp(h({ 'x-forwarded-for': 'não-é-ip' }), cfg, prod)).toBeNull();
    expect(resolveClientIp(h({}), cfg, prod)).toBeNull();
  });

  it('com TRUSTED_PROXIES: lê a cadeia da direita para a esquerda e ignora o que o cliente escreveu na esquerda', () => {
    const cfg = clientIpConfigFromEnv({ TRUSTED_PROXIES: '10.0.0.0/8, 172.18.0.5' });
    // cliente real 198.51.100.7 -> Traefik (172.18.0.5) -> app
    expect(resolveClientIp(h({ 'x-forwarded-for': '198.51.100.7' }), cfg, prod)).toBe('198.51.100.7');
    expect(resolveClientIp(h({ 'x-forwarded-for': '198.51.100.7, 172.18.0.5' }), cfg, prod)).toBe('198.51.100.7');
    // o cliente tentou forjar "9.9.9.9" na ponta esquerda: vale o que o proxy viu
    expect(resolveClientIp(h({ 'x-forwarded-for': '9.9.9.9, 198.51.100.7, 10.1.2.3' }), cfg, prod)).toBe('198.51.100.7');
    // cadeia só de proxies: sem cliente confiável
    expect(resolveClientIp(h({ 'x-forwarded-for': '10.0.0.9, 172.18.0.5' }), cfg, prod)).toBeNull();
  });

  it('IPv6 e IPv4 mapeado em IPv6', () => {
    const cfg = clientIpConfigFromEnv({ TRUSTED_PROXIES: 'fd00::/8' });
    expect(resolveClientIp(h({ 'x-forwarded-for': '2001:DB8::1, fd00::5' }), cfg, prod)).toBe('2001:db8::1');
    expect(resolveClientIp(h({ 'x-forwarded-for': '::ffff:203.0.113.8' }), clientIpConfigFromEnv({}), prod)).toBe('203.0.113.8');
  });

  it('CLIENT_IP_HEADERS: atrás do Cloudflare usa cf-connecting-ip primeiro', () => {
    const cfg = clientIpConfigFromEnv({ CLIENT_IP_HEADERS: 'CF-Connecting-IP, x-forwarded-for' });
    expect(cfg.headers).toEqual(['cf-connecting-ip', 'x-forwarded-for']);
    expect(resolveClientIp(h({ 'cf-connecting-ip': '203.0.113.20', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }), cfg, prod)).toBe('203.0.113.20');
  });

  it('fora de produção, sem cabeçalho (acesso direto ao servidor de desenvolvimento): 127.0.0.1', () => {
    const cfg = clientIpConfigFromEnv({});
    expect(resolveClientIp(h({}), cfg, { NODE_ENV: 'development' })).toBe('127.0.0.1');
    expect(resolveClientIp(h({ 'x-forwarded-for': '203.0.113.5' }), cfg, { NODE_ENV: 'development' })).toBe('203.0.113.5');
  });

  it('porta de origem só pelo cabeçalho configurado', () => {
    expect(resolveClientPort(h({ 'x-forwarded-port': '443' }), clientIpConfigFromEnv({}))).toBeNull();
    const cfg = clientIpConfigFromEnv({ CLIENT_PORT_HEADER: 'X-Client-Port' });
    expect(resolveClientPort(h({ 'x-client-port': '51234' }), cfg)).toBe(51234);
    expect(resolveClientPort(h({ 'x-client-port': 'abc' }), cfg)).toBeNull();
  });

  it('aponta entradas inválidas de TRUSTED_PROXIES', () => {
    expect(invalidTrustedProxies(clientIpConfigFromEnv({ TRUSTED_PROXIES: '10.0.0.0/8, lixo, 1.2.3.4/99' }))).toEqual(['lixo', '1.2.3.4/99']);
  });
});
