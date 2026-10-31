/** Divide a fala em frases mantendo o texto original (pontuação incluída). */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const re = /[.!?…]+["'”’»)]*(?=\s|$)/g;
  let start = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    const sentence = text.slice(start, end).trim();
    if (sentence) out.push(sentence);
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}
