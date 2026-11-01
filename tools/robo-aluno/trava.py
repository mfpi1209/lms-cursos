#!/usr/bin/env python3
"""Travamento visual no ARQUIVO do vídeo: trechos em que a imagem fica parada (nenhum pixel se mexe) por >= 120 ms.

Critério (calibrado em vídeos de avatar a 25 fps): em 160x90 cinza, um quadro "parado" tem diferença máxima <= 4 e
média < 0,15 em relação ao anterior. Fala normal sempre mexe algo (diferença máxima >= 10 em 95% dos quadros).
Para cada trecho parado mede a energia do áudio: com fala (> -35 dB) é o "rápido travamento" entre/durante falas;
sem fala é pausa congelada. Cauda (últimos 0,4 s) e começo (primeiros 0,2 s) são marcados à parte.

Uso: trava.py <video> [<video> ...]  -> JSON {arquivo: {dur, quadros, paradas: [...]}}
"""
import json, math, struct, subprocess, sys

W, H = 160, 90
FPS = 25


def analisa(f):
    raw = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', f, '-vf', f'fps={FPS},scale={W}:{H},format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
    n = len(raw) // (W * H)
    if n < 2:
        return {'erro': 'sem quadros'}
    parado = [False]
    for i in range(1, n):
        a = raw[(i - 1) * W * H:i * W * H]
        b = raw[i * W * H:(i + 1) * W * H]
        mx = 0
        s = 0
        for x, y in zip(a, b):
            d = x - y if x > y else y - x
            s += d
            if d > mx:
                mx = d
                if mx > 4:
                    break
        parado.append(mx <= 4 and s / (W * H) < 0.15)
    pcm = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', f, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True).stdout
    m = len(pcm) // 2
    amostras = struct.unpack('<%dh' % m, pcm[:m * 2]) if m else ()

    def db(t0, t1):
        s, e = int(t0 * 16000), int(t1 * 16000)
        seg = amostras[s:e]
        if not seg:
            return -99.0
        return round(20 * math.log10(math.sqrt(sum(v * v for v in seg) / len(seg)) / 32768 + 1e-9), 1)

    dur = n / FPS
    out = []
    i = 1
    while i < n:
        if parado[i]:
            j = i
            while j < n and parado[j]:
                j += 1
            # quadros i-1..j-1 são iguais: (j - i + 1) quadros na tela = (j - i) intervalos sem movimento + o quadro
            ms = (j - i + 1) * 1000 // FPS
            if ms >= 120:
                t = round((i - 1) / FPS, 2)
                fim = round(j / FPS, 2)
                fala = db(t, fim)
                # fala logo antes e logo depois (emenda entre falas)
                antes, depois = db(max(0, t - 0.3), t), db(fim, fim + 0.3)
                onde = 'cauda' if fim >= dur - 0.4 else 'inicio' if t <= 0.2 else 'meio'
                out.append({'t': t, 'ms': ms, 'fala_db': fala, 'antes_db': antes, 'depois_db': depois, 'com_fala': fala > -35, 'onde': onde})
            i = j
        else:
            i += 1
    return {'dur': round(dur, 2), 'quadros': n, 'paradas': out}


if __name__ == '__main__':
    res = {}
    for f in sys.argv[1:]:
        try:
            res[f] = analisa(f)
        except Exception as e:  # noqa: BLE001
            res[f] = {'erro': str(e)[:200]}
    print(json.dumps(res, ensure_ascii=False))
