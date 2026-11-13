export interface UploadedRecording {
  assetId: string;
  sizeBytes: number;
  linked: number;
  revision: number;
}

/**
 * Envia UM MP4 para `POST /api/courses/[courseId]/screen-recordings` (corpo bruto, não multipart) com progresso.
 * XMLHttpRequest porque `fetch` ainda não informa o progresso do envio. Rejeita com `Error` de mensagem em pt-BR.
 */
export function uploadScreenRecording(courseId: string, file: File, onProgress: (ratio: number) => void): Promise<UploadedRecording> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/courses/${encodeURIComponent(courseId)}/screen-recordings?fileName=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader('Content-Type', 'video/mp4');
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
    };
    xhr.onerror = () => reject(new Error('A conexão caiu durante o envio. Tente este arquivo de novo.'));
    xhr.onabort = () => reject(new Error('Envio cancelado.'));
    xhr.onload = () => {
      let data: { error?: { message?: string } } & Partial<UploadedRecording> = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        /* corpo que não é JSON (ex.: página de erro do proxy) */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.assetId) {
        onProgress(1);
        resolve(data as UploadedRecording);
        return;
      }
      reject(new Error(data.error?.message ?? (xhr.status === 413 ? 'O servidor recusou o tamanho do arquivo.' : `Não foi possível enviar (erro ${xhr.status}).`)));
    };
    xhr.send(file);
  });
}
