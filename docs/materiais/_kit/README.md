# Materiais de apoio: como escrever

Cada curso tem uma pasta `docs/materiais/<slug>/` com:

- `materiais.json`: o manifesto (lista de materiais, na ordem em que aparecem para a aluna);
- um `.html` por material (fonte), usando `../_kit/base.css`;
- `_saida/`: os arquivos prontos (PDF/PNG), gerados por `apps/web/src/scripts/materiais-gerar.ts`. Não edite à mão.

## Manifesto

```json
{
  "curso": "crs_xxx",
  "titulo": "Dinheiro no controle",
  "materiais": [
    {
      "id": "orcamento-30min",
      "titulo": "Planilha de orçamento em 30 minutos",
      "descricao": "Uma frase, do ponto de vista da aluna: o que é e quando usar.",
      "categoria": "modelo",
      "modulo": 1,
      "fonte": "orcamento-30min.html",
      "formato": "pdf"
    }
  ]
}
```

- `categoria`: `resumo` | `checklist` | `modelo` | `infografico` | `exemplos` | `atalhos` (hacks e truques).
- `modulo`: número do módulo do roteiro (1, 2, …) a que o material pertence; omita para material do curso inteiro.
- `formato`: `pdf` (A4, várias páginas) ou `png` (infográfico de 1080 px de largura, `body class="info"`).
- `id`: minúsculas e hífens; vira o nome do arquivo de saída.

## Regras de conteúdo

- Tudo sai dos roteiros (`docs/roteiros/<curso>.md`): mesmos números, exemplos, nomes de personagens e termos da aula.
  Nada inventado que contradiga a aula. Pode aprofundar com passo a passo prático.
- Português do Brasil, segunda pessoa ("você"), frases curtas, tom da instrutora.
- Marca: DNA Work apenas. Sem "Cruzeiro do Sul" nem outra instituição; sem logotipo de serviço real.
- Nada de dado pessoal real (CPF, telefone, e-mail reais). Exemplos com nomes fictícios.
- Finanças e segurança: informativo, sem recomendar produto, banco ou investimento específico.
- PDF: 1 a 4 páginas. Infográfico: uma ideia só, de 3 a 6 blocos, legível no celular.

## Esqueleto de PDF

```html
<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="../_kit/base.css"><title>…</title></head>
<body>
  <header class="doc-head">
    <img class="logo" src="../_kit/logo-branco.png" alt="DNA Work">
    <div class="curso">Dinheiro no controle · Módulo 1</div>
    <h1>Título do material</h1>
    <div class="sub">Para que serve, em uma frase.</div>
  </header>
  <h2>…</h2> <p>…</p>
  <div class="box dica"><span class="rotulo">Dica</span><p>…</p></div>
  <ul class="check"><li>…</li></ul>
  <div class="rodape">Material de apoio do curso Dinheiro no controle · DNA Work</div>
</body></html>
```

Classes disponíveis: `.box.dica`, `.box.alerta`, `.box.ok`, `.check`, `table` (com `td.preencher` para campos em branco), `.linha` (linha para escrever), `.exemplo` (texto de exemplo: prompt, mensagem, trecho de currículo).

## Esqueleto de infográfico

```html
<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="../_kit/base.css"><title>…</title></head>
<body class="info">
  <div class="curso">Segurança digital</div>
  <h1>Título curto</h1>
  <div class="sub">Uma linha de contexto.</div>
  <div class="passos">
    <div class="passo"><div class="num">1</div><div><h3>…</h3><p>…</p></div></div>
  </div>
  <div class="destaque">A regra de ouro em uma frase.</div>
  <div class="assinatura"><span>Material de apoio · DNA Work</span><img src="../_kit/logo-branco.png" alt="DNA Work"></div>
</body></html>
```

Também há `.grade` com `.cartao` (2 colunas) no lugar de `.passos`.
