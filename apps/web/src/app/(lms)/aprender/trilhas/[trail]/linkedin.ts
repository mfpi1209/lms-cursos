/**
 * Link oficial do LinkedIn para adicionar uma certificação ao perfil ("Add to profile"), sem integração paga:
 * https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=…&organizationName=…&issueYear=…&issueMonth=…&certUrl=…&certId=…
 */
export function linkedInAddUrl(input: { trail: string; code: string; issuedAt: Date; url: string }): string {
  const d = new Date(input.issuedAt);
  const q = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: `Selo DNA Work · ${input.trail}`,
    organizationName: 'DNA Work',
    issueYear: String(d.getUTCFullYear()),
    issueMonth: String(d.getUTCMonth() + 1),
    certUrl: input.url,
    certId: input.code,
  });
  return `https://www.linkedin.com/profile/add?${q.toString()}`;
}
