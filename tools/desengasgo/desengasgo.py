#!/usr/bin/env python3
"""Desengasgo: tira os trechos de imagem parada (>= --min-ms) de um vídeo, sem mexer no áudio nem na duração.

Um "engasgo" é um trecho em que o HeyGen entrega o MESMO quadro repetido (A, A, A, ..., A) e só depois a imagem volta a se
mexer (B). Medido com o MESMO critério do robô (tools/robo-aluno/trava.py): em 160x90 cinza, diferença máxima <= 4 e média < 0,15
entre quadros vizinhos.

Para cada trecho, os quadros repetidos do MEIO (A fica, B fica) são trocados por quadros novos, na mesma quantidade:
  1. imagem de base entre A e B: fluxo óptico (DIS) quando A e B diferem muito (fala no meio do trecho), mistura simples quando
     quase não diferem (pausa de boca fechada, que é o caso comum);
  2. movimento de câmera contínuo e bem leve (zoom que sobe e desce, 1,00 -> 1,0x -> 1,00), com a menor amplitude que faz
     TODO par de quadros vizinhos passar do limite do medidor (com folga); teto 2,5%. Sem deformar rosto nem boca.
O áudio é copiado do arquivo original, sem recodificar. A saída tem exatamente o mesmo número de quadros.

Uso:
  desengasgo.py trata <entrada.mp4> <saida.mp4> [--min-ms 200] [--metodo auto|mistura|fluxo|so-zoom] [--json]
  desengasgo.py achar <video> [--min-ms 200]            (lista os trechos, mesmo critério)
  desengasgo.py folha <video> <t0> <dur> <png> [--rotulo texto] [--largura 240] [--colunas 10]   (folha de contato, 1 quadro a cada 0,04 s)
"""
import argparse, json, math, os, subprocess, sys
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
FPS = 25
MARGEM = 7          # diferença máxima mínima (160x90, cinza) entre quadros vizinhos dentro do trecho; o medidor para em 4
AMP_MIN, AMP_MAX = 0.004, 0.025
CORTE = 100         # diferença máxima A->B (160x90) a partir da qual B é outro plano (corte seco): não se interpola até ele


def pequenos(video):
    """Quadros 160x90 cinza, do mesmo jeito que o medidor do robô."""
    raw = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', video, '-vf', f'fps={FPS},scale=160:90,format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
    n = len(raw) // (160 * 90)
    return np.frombuffer(raw[: n * 160 * 90], np.uint8).reshape(n, 90, 160).astype(np.int16)


def corridas(a, max_ok, media_ok):
    """Corridas de quadros "iguais" (como o trava.py, com limites ajustáveis): [(s, c)] com os quadros s..s+c-1 iguais."""
    n = len(a)
    par = [False] + [bool(np.abs(a[i] - a[i - 1]).max() <= max_ok and np.abs(a[i] - a[i - 1]).mean() < media_ok) for i in range(1, n)]
    out, i = [], 1
    while i < n:
        if par[i]:
            j = i
            while j < n and par[j]:
                j += 1
            out.append((i - 1, j - i + 1))
            i = j
        else:
            i += 1
    return out, n


def achar(video, min_ms=200, folga=True):
    """Trechos parados >= min_ms: [{s, c, ms, t}] com os quadros s..s+c-1 iguais (B = s+c).
    Critério do robô (max <= 4, média < 0,15). Com `folga`, também pega os QUASE parados (max <= 6, média < 0,25): ao recodificar,
    quadros quase iguais podem virar iguais, e o medidor passaria a ver um trecho novo."""
    a = pequenos(video)
    estrito, n = corridas(a, 4, 0.15)
    largo, _ = corridas(a, 6, 0.25) if folga else (estrito, n)
    res = []
    for s, c in largo:
        if c * 40 < min_ms:
            continue
        pegou = [(es, ec) for es, ec in estrito if es >= s and es + ec <= s + c]
        res.append({'s': s, 'c': c, 'ms': c * 40, 't': round(s / FPS, 2), 'estrito': bool(any(ec * 40 >= min_ms for _, ec in pegou)), 'onde': 'cauda' if s + c >= n else 'meio'})
    return res, n


def sonda(video):
    j = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames', '-of', 'json', video], capture_output=True, text=True, check=True).stdout)
    s = j['streams'][0]
    return int(s['width']), int(s['height'])


def ler_yuv(video, w, h):
    """Gera os quadros yuv420p crus, um a um."""
    fsz = w * h * 3 // 2
    p = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-i', video, '-map', '0:v:0', '-vf', f'fps={FPS}', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-'], stdout=subprocess.PIPE)
    try:
        while True:
            b = p.stdout.read(fsz)
            if len(b) < fsz:
                break
            yield np.frombuffer(b, np.uint8)
    finally:
        p.stdout.close()
        p.wait()


def y_pequeno(yuv, w, h):
    y = yuv[: w * h].reshape(h, w)
    return cv2.resize(y, (160, 90), interpolation=cv2.INTER_AREA).astype(np.int16)


def para_bgr(yuv, w, h):
    return cv2.cvtColor(yuv.reshape(h * 3 // 2, w), cv2.COLOR_YUV2BGR_I420)


def de_bgr(bgr):
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2YUV_I420).reshape(-1)


def zoom(img, z):
    if abs(z - 1) < 1e-6:
        return img
    h, w = img.shape[:2]
    M = np.float32([[z, 0, (1 - z) * w / 2], [0, z, (1 - z) * h / 2]])
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)


def perfil(c):
    """Forma do zoom em cada quadro intermediário k=1..c-1: sobe e desce (zero em A e em B), com o pico ENTRE dois quadros
    (nunca dois quadros seguidos com o mesmo zoom)."""
    m = c // 2
    tp = (m + 0.25) / c
    out = []
    for k in range(1, c):
        t = k / c
        out.append(t / tp if t <= tp else (1 - t) / (1 - tp))
    return out


def base_fluxo(A, B, t, fAB, fBA):
    h, w = A.shape[:2]
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))

    def amostra(img, dx, dy):
        return cv2.remap(img, gx + dx, gy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)

    # ponto que está em y no instante t veio de y - t*F_AB(y) em A e vai para y + (1-t)*F_AB(y) em B (e o inverso com F_BA)
    a1 = amostra(A, -t * fAB[..., 0], -t * fAB[..., 1])
    a2 = amostra(A, t * fBA[..., 0], t * fBA[..., 1])
    b1 = amostra(B, (1 - t) * fAB[..., 0], (1 - t) * fAB[..., 1])
    b2 = amostra(B, -(1 - t) * fBA[..., 0], -(1 - t) * fBA[..., 1])
    return (1 - t) * 0.5 * (a1 + a2) + t * 0.5 * (b1 + b2)


def fluxos(A, B):
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    ga = cv2.cvtColor(A, cv2.COLOR_BGR2GRAY)
    gb = cv2.cvtColor(B, cv2.COLOR_BGR2GRAY)
    return dis.calc(ga, gb, None), dis.calc(gb, ga, None)


def diff_max(a, b):
    return int(np.abs(a - b).max()), float(np.abs(a - b).mean())


def refaz_trecho(A, B, c, metodo, w, h):
    """Devolve (quadros BGR intermediários [c-1], info). A e B são BGR uint8 (B pode ser None: cauda)."""
    pequeno = lambda im: cv2.resize(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), (160, 90), interpolation=cv2.INTER_AREA).astype(np.int16)
    sa = pequeno(A)
    dmax = diff_max(sa, pequeno(B))[0] if B is not None else 0
    corte = B is not None and dmax >= CORTE
    if B is None or corte:
        # cauda ou corte seco logo depois: não há para onde interpolar; a imagem de A segue com a deriva de câmera até o corte
        metodo_real = 'so-zoom'
    elif metodo == 'auto':
        metodo_real = 'fluxo' if dmax >= 40 else 'mistura'
    else:
        metodo_real = metodo
    if metodo_real == 'so-zoom':
        B_orig, B = B, None
        bases = [A.astype(np.float32)] * (c - 1)
    elif metodo_real == 'mistura':
        bases = [(1 - k / c) * A.astype(np.float32) + (k / c) * B.astype(np.float32) for k in range(1, c)]
    else:
        fAB, fBA = fluxos(A, B)
        bases = [base_fluxo(A, B, k / c, fAB, fBA) for k in range(1, c)]
    bases = [np.clip(b, 0, 255).astype(np.uint8) for b in bases]
    pf = perfil(c) if B is not None else [k / c for k in range(1, c)]  # cauda: deriva só para um lado (não há B para voltar)

    def monta(amp):
        return [zoom(b, 1 + amp * p) for b, p in zip(bases, pf)]

    amp, quadros, minimo = 0.0, bases, None
    seq = lambda qs: [sa] + [pequeno(q) for q in qs] + ([pequeno(B)] if B is not None else [])
    a = AMP_MIN
    ok = False
    while a <= AMP_MAX + 1e-9:
        quadros = monta(a)
        sm = seq(quadros)
        minimo = min(diff_max(sm[i], sm[i + 1])[0] for i in range(len(sm) - 1))
        if minimo >= MARGEM:
            ok = True
            amp = a
            break
        a *= 1.25
    if not ok:
        amp = min(a, AMP_MAX)
        quadros = monta(amp)
        sm = seq(quadros)
        minimo = min(diff_max(sm[i], sm[i + 1])[0] for i in range(len(sm) - 1))
    return quadros, {'corte': bool(corte), 'metodo': metodo_real, 'amp': round(amp, 4), 'minimo': minimo, 'ok': ok and minimo >= MARGEM, 'dmaxAB': dmax}


def trata(entrada, saida, min_ms=200, metodo='auto', crf=17, quadros_extra=None):
    trechos, n = achar(entrada, min_ms)
    w, h = sonda(entrada)
    info = {'entrada': entrada, 'quadros': n, 'trechos': []}
    if not any(t['estrito'] for t in trechos):
        info['semTrechos'] = True
        return info
    janelas = {}
    for t in trechos:
        janelas[t['s']] = t
    enc = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', f'{w}x{h}', '-r', str(FPS), '-i', '-', '-i', entrada,
                            '-map', '0:v:0', '-map', '1:a:0?', '-c:v', 'libx264', '-preset', 'medium', '-crf', str(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', str(FPS),
                            '-c:a', 'copy', '-map_metadata', '1', '-movflags', '+faststart', saida], stdin=subprocess.PIPE)
    escritos = 0
    lidos = 0

    def escreve(yuv):
        nonlocal escritos
        enc.stdin.write(yuv.tobytes())
        escritos += 1

    pend = {}
    ativa = None
    a_escrito = False  # trecho encadeado: o quadro A dele já foi escrito como B do anterior
    try:
        for i, yuv in enumerate(ler_yuv(entrada, w, h)):
            lidos += 1
            if ativa is None and i in janelas:
                ativa = janelas[i]
                pend = {}
            if ativa is None:
                escreve(yuv)
                continue
            s, c = ativa['s'], ativa['c']
            pend[i] = yuv
            fecha_b = i == s + c
            fecha_cauda = s + c >= n and i == n - 1
            if not (fecha_b or fecha_cauda):
                continue
            A = para_bgr(pend[s], w, h)
            B = None if fecha_cauda else para_bgr(pend[s + c], w, h)
            novos, d = refaz_trecho(A, B, c, metodo, w, h)
            d.update({'inicio': ativa['t'], 'ms': ativa['ms'], 'quadro': s, 'quadros': c, 'cauda': fecha_cauda, 'estrito': ativa['estrito']})
            info['trechos'].append(d)
            for q in range(s + (1 if a_escrito else 0), i + 1):
                escreve(de_bgr(novos[q - s - 1]) if s < q < s + c else pend[q])
            ativa = None
            pend = {}
            a_escrito = False
            if i in janelas and not fecha_cauda:  # outro trecho parado começa exatamente em B
                ativa = janelas[i]
                pend = {i: yuv}
                a_escrito = True
        if ativa is not None:  # janela aberta no fim (não deveria ocorrer): escreve como veio
            for q in sorted(pend):
                escreve(pend[q])
    finally:
        enc.stdin.close()
        rc = enc.wait()
    if rc != 0:
        raise RuntimeError(f'ffmpeg (codificação) saiu com {rc}')
    if escritos != lidos:
        raise RuntimeError(f'quadros escritos {escritos} != lidos {lidos}')
    info['escritos'] = escritos
    info['lidos'] = lidos
    return info


def folha(video, t0, dur, png, rotulo='', largura=240, colunas=10):
    w, h = sonda(video)
    alt = round(largura * h / w)
    p = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-ss', str(t0), '-i', video, '-t', str(dur), '-vf', f'fps={FPS},scale={largura}:{alt}', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], capture_output=True)
    n = len(p.stdout) // (largura * alt * 3)
    qs = np.frombuffer(p.stdout[: n * largura * alt * 3], np.uint8).reshape(n, alt, largura, 3).copy()
    linhas = math.ceil(n / colunas)
    canvas = np.full((linhas * alt, colunas * largura, 3), 24, np.uint8)
    prev = None
    for i in range(n):
        q = qs[i]
        # marca em vermelho a faixa do quadro quando ele é IGUAL ao anterior (parado)
        igual = prev is not None and np.abs(q.astype(np.int16) - prev.astype(np.int16)).max() <= 4
        cv2.putText(q, f'{t0 + i / FPS:.2f}', (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)
        if igual:
            cv2.rectangle(q, (0, 0), (largura - 1, alt - 1), (0, 0, 255), 3)
        r, c = divmod(i, colunas)
        canvas[r * alt:(r + 1) * alt, c * largura:(c + 1) * largura] = q
        prev = qs[i]
    if rotulo:
        cv2.putText(canvas, rotulo, (6, canvas.shape[0] - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.imwrite(png, canvas)
    return n


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest='cmd', required=True)
    a = sp.add_parser('trata'); a.add_argument('entrada'); a.add_argument('saida'); a.add_argument('--min-ms', type=int, default=200); a.add_argument('--metodo', default='auto', choices=['auto', 'mistura', 'fluxo', 'so-zoom']); a.add_argument('--crf', type=int, default=17); a.add_argument('--json', action='store_true')
    b = sp.add_parser('achar'); b.add_argument('video'); b.add_argument('--min-ms', type=int, default=200)
    c = sp.add_parser('folha'); c.add_argument('video'); c.add_argument('t0', type=float); c.add_argument('dur', type=float); c.add_argument('png'); c.add_argument('--rotulo', default=''); c.add_argument('--largura', type=int, default=240); c.add_argument('--colunas', type=int, default=10)
    x = ap.parse_args()
    if x.cmd == 'trata':
        print(json.dumps(trata(x.entrada, x.saida, x.min_ms, x.metodo, x.crf), ensure_ascii=False))
    elif x.cmd == 'achar':
        print(json.dumps(achar(x.video, x.min_ms)[0], ensure_ascii=False))
    else:
        print(folha(x.video, x.t0, x.dur, x.png, x.rotulo, x.largura, x.colunas))
