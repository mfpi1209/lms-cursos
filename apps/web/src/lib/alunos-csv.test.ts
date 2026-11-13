import { describe, expect, it } from 'vitest';
import { CSV_MAX_ROWS, csvCell, detectDelimiter, errorsToCsv, parseStudentsCsv } from './alunos-csv';

describe('parseStudentsCsv', () => {
  it('lê vírgula, aspas, acentos e cursos separados por ;', () => {
    const r = parseStudentsCsv('nome,email,rgm,telefone,cursos\nJosé da Conceição,jose@x.com,123,(11) 9 8888-7777,a;b\nAna,ana@x.com,456,,\n');
    expect(r.fatal).toEqual([]);
    expect(r.rows).toEqual([
      { linha: 2, nome: 'José da Conceição', email: 'jose@x.com', rgm: '123', telefone: '(11) 9 8888-7777', cursos: ['a', 'b'] },
      { linha: 3, nome: 'Ana', email: 'ana@x.com', rgm: '456', telefone: '', cursos: [] },
    ]);
  });

  it('aceita BOM, separador ; (Excel brasileiro) e CRLF', () => {
    const r = parseStudentsCsv('﻿Nome;E-mail;RGM;Telefone;Cursos\r\nMaria;maria@x.com;77;;curso-a;\r\n');
    expect(r.fatal).toEqual([]);
    expect(r.rows[0]).toMatchObject({ nome: 'Maria', email: 'maria@x.com', rgm: '77', cursos: ['curso-a'] });
    // o ";" final vira uma célula além do cabeçalho e é ignorada
    const r2 = parseStudentsCsv('nome;email;rgm;telefone;cursos\r\nMaria;m@x.com;1;;"a;b"\r\n');
    expect(r2.rows[0]!.cursos).toEqual(['a', 'b']);
  });

  it('aspas com vírgula, aspas duplas escapadas e quebra de linha dentro do campo', () => {
    const r = parseStudentsCsv('nome,email,rgm\n"Silva, João ""Jota""",j@x.com,9\n"Linha\nquebrada",q@x.com,10\nFim,f@x.com,11');
    expect(r.rows.map((x) => x.nome)).toEqual(['Silva, João "Jota"', 'Linha\nquebrada', 'Fim']);
    // o número da linha segue o arquivo, mesmo depois de um campo com quebra de linha
    expect(r.rows.map((x) => x.linha)).toEqual([2, 3, 5]);
  });

  it('tabulação, colunas fora de ordem, apelidos e linhas em branco', () => {
    const r = parseStudentsCsv('RGM\tCelular\tNome\tE-mail\n5\t119\tZé\tze@x.com\n\n \t\t\t\n6\t\tLu\tlu@x.com\n');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1]).toMatchObject({ linha: 5, nome: 'Lu', rgm: '6', telefone: '' });
  });

  it('o separador dentro de aspas no cabeçalho não confunde a detecção', () => {
    expect(detectDelimiter('"a;b;c",d,e\n1;2;3')).toBe(',');
  });

  it('cabeçalho sem coluna obrigatória é erro do arquivo', () => {
    const r = parseStudentsCsv('nome,email\nAna,a@x.com');
    expect(r.rows).toEqual([]);
    expect(r.fatal[0]).toMatch(/rgm/);
  });

  it('arquivo vazio e arquivo com linhas demais', () => {
    expect(parseStudentsCsv('').fatal).toHaveLength(1);
    expect(parseStudentsCsv('﻿  \n').fatal).toHaveLength(1);
    const big = 'nome,email,rgm\n' + Array.from({ length: CSV_MAX_ROWS + 1 }, (_, i) => `n${i},e${i}@x.com,${i}`).join('\n');
    expect(parseStudentsCsv(big).fatal[0]).toMatch(/máximo/);
    const ok = 'nome,email,rgm\n' + Array.from({ length: CSV_MAX_ROWS }, (_, i) => `n${i},e${i}@x.com,${i}`).join('\n');
    expect(parseStudentsCsv(ok).rows).toHaveLength(CSV_MAX_ROWS);
  });

  it('cursos separados por ; sem aspas num arquivo separado por ; (colunas a mais) também valem', () => {
    const r = parseStudentsCsv('nome;email;rgm;telefone;cursos\nA;a@x.com;1;;c1;c2;c3');
    expect(r.rows[0]!.cursos).toEqual(['c1', 'c2', 'c3']);
  });

  it('cursos repetidos viram um, espaços são aparados', () => {
    const r = parseStudentsCsv('nome,email,rgm,cursos\nA,a@x.com,1," a ; a ;b "');
    expect(r.rows[0]!.cursos).toEqual(['a', 'b']);
  });
});

describe('CSV de erros', () => {
  it('neutraliza fórmulas e escapa aspas e ;', () => {
    expect(csvCell('=SOMA(A1)')).toBe("'=SOMA(A1)");
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    const csv = errorsToCsv([{ row: { linha: 4, nome: '@alguem', email: 'x', rgm: '', telefone: '', cursos: ['a', 'b'] }, reason: 'E-mail inválido' }]);
    expect(csv.startsWith('﻿linha;nome;email;rgm;telefone;cursos;erro\r\n')).toBe(true);
    expect(csv).toContain(`4;'@alguem;x;;;"a;b";E-mail inválido`);
  });
});
