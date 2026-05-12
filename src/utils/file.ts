export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateFilename(index: number, total: number): string {
  const padded = String(index + 1).padStart(String(total).length, '0');
  return `collage_${padded}_of_${total}.jpg`;
}
