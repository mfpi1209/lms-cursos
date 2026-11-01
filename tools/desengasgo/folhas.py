#!/usr/bin/env python3
"""Folhas de contato antes/depois do desengasgo (1 quadro a cada 0,04 s).

Cada folha tem 3 linhas, uma abaixo da outra:
  ANTES        o arquivo como está (quadro com moldura vermelha = IGUAL ao anterior, no critério do robô);
  MINTERPOLATE a alternativa "interpolar com ffmpeg minterpolate (mci)" aplicada só no trecho;
  DESENGASGO   o arquivo tratado por desengasgo.py (técnica escolhida).

Uso: folhas.py <saida.png> <video-antes> <video-depois> <t0> <dur> [--titulo texto] [--largura 192] [--colunas 12]
t0/dur: janela da folha em segundos. O trecho parado dentro da janela é achado pelo mesmo critério do robô.
"""
import argparse, os, subprocess, sys, tempfile
import numpy as np
import cv2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import desengasgo as dg  # noqa: E402


def quadros(video, t0, dur, largura):
    w, h = dg.sonda(video)
    alt = round(largura * h / w)
    p = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-ss', str(t0), '-i', video, '-t', str(dur), '-vf', f'fps=25,scale={largura}:{alt}', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], capture_output=True)
    n = len(p.stdout) // (largura * alt * 3)
    return np.frombuffer(p.stdout[: n * largura * alt * 3], np.uint8).reshape(n, alt, largura, 3).copy()


def minterpolate_trecho(video, t0, n, largura, s_rel, c):
    """Troca os quadros s_rel+1..s_rel+c-1 (dentro da janela) pelos de minterpolate entre o quadro s_rel (A) e s_rel+c (B)."""
    q = quadros(video, t0, n / 25 + 0.01, largura)
    A, B = q[s_rel], q[s_rel + c]
    with tempfile.TemporaryDirectory() as d:
        cv2.imwrite(os.path.join(d, 'f1.png'), A)
        cv2.imwrite(os.path.join(d, 'f2.png'), B)
        out = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-framerate', f'25/{c}', '-i', os.path.join(d, 'f%d.png'),
                              '-vf', 'minterpolate=fps=25:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], capture_output=True).stdout
    alt, larg = A.shape[:2]
    m = np.frombuffer(out[: len(out) // (alt * larg * 3) * alt * larg * 3], np.uint8).reshape(-1, alt, larg, 3)
    novo = q.copy()
    for k in range(1, c):
        novo[s_rel + k] = m[k] if k < len(m) else A
    return novo


def parado(a, b):
    # mesmo critério do robô, em cinza (a folha tem 160x90 quando a largura é 160)
    ga = cv2.resize(cv2.cvtColor(a, cv2.COLOR_BGR2GRAY), (160, 90), interpolation=cv2.INTER_AREA).astype(np.int16)
    gb = cv2.resize(cv2.cvtColor(b, cv2.COLOR_BGR2GRAY), (160, 90), interpolation=cv2.INTER_AREA).astype(np.int16)
    d = np.abs(ga - gb)
    return d.max() <= 4 and d.mean() < 0.15


def linha(qs, t0, largura, colunas, rotulo):
    alt = qs.shape[1]
    linhas = (len(qs) + colunas - 1) // colunas
    canvas = np.full((linhas * alt + 22, colunas * largura, 3), 24, np.uint8)
    cv2.putText(canvas, rotulo, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    prev = None
    for i, q in enumerate(qs):
        q = q.copy()
        igual = prev is not None and parado(q, prev)
        cv2.putText(q, f'{t0 + i / 25:.2f}', (3, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1, cv2.LINE_AA)
        if igual:
            cv2.rectangle(q, (0, 0), (largura - 1, alt - 1), (0, 0, 255), 3)
        r, c = divmod(i, colunas)
        canvas[22 + r * alt:22 + (r + 1) * alt, c * largura:(c + 1) * largura] = q
        prev = qs[i]
    return canvas


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('saida'); ap.add_argument('antes'); ap.add_argument('depois'); ap.add_argument('t0', type=float); ap.add_argument('dur', type=float)
    ap.add_argument('--titulo', default=''); ap.add_argument('--largura', type=int, default=192); ap.add_argument('--colunas', type=int, default=12)
    x = ap.parse_args()
    antes = quadros(x.antes, x.t0, x.dur, x.largura)
    depois = quadros(x.depois, x.t0, x.dur, x.largura)
    # trecho parado do ARQUIVO ANTES dentro da janela (critério do robô, pelos quadros pequenos)
    ach, _ = dg.achar(x.antes, 200, folga=False)
    i0, i1 = round(x.t0 * 25), round((x.t0 + x.dur) * 25)
    dentro = [t for t in ach if i0 <= t['s'] < i1]
    pecas = []
    if x.titulo:
        pecas.append(np.full((26, x.colunas * x.largura, 3), 24, np.uint8))
        cv2.putText(pecas[0], x.titulo, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (80, 220, 255), 1, cv2.LINE_AA)
    pecas.append(linha(antes, x.t0, x.largura, x.colunas, 'ANTES (moldura vermelha = quadro igual ao anterior)'))
    if dentro:
        t = dentro[0]
        mi = minterpolate_trecho(x.antes, x.t0, len(antes), x.largura, t['s'] - i0, t['c']) if t['s'] - i0 + t['c'] < len(antes) else antes
        pecas.append(linha(mi, x.t0, x.largura, x.colunas, 'ALTERNATIVA: ffmpeg minterpolate (mci) so no trecho'))
    pecas.append(linha(depois, x.t0, x.largura, x.colunas, 'DEPOIS: desengasgo (escolhida)'))
    cv2.imwrite(x.saida, np.vstack(pecas))
    print(x.saida)
