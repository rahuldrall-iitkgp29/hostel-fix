import type { ApiClient } from '@/lib/api/client';
import { getAttachmentContent } from '@/lib/api/complaints';

export async function loadPrivatePhoto(
  client: ApiClient,
  id: string,
  signal: AbortSignal
) {
  const blob = await getAttachmentContent(client, id, signal);
  if (signal.aborted) return null;
  const url = URL.createObjectURL(blob);
  return { url, dispose: () => URL.revokeObjectURL(url) };
}
