'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/features/auth/context/auth-context';
import { loadPrivatePhoto } from '../private-photo';
import type { AttachmentItem } from '../types';

export function PrivatePhoto({ attachment }: { attachment: AttachmentItem }) {
  const { apiClient } = useAuth();
  const [photo, setPhoto] = useState<{ url?: string; error?: string }>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let dispose: (() => void) | undefined;
    void loadPrivatePhoto(apiClient, attachment.id, controller.signal)
      .then((result) => {
        if (!result) return;
        if (controller.signal.aborted) {
          result.dispose();
          return;
        }
        dispose = result.dispose;
        setPhoto({ url: result.url });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setPhoto({ error: 'Unable to load this photo.' });
      });
    return () => {
      controller.abort();
      dispose?.();
    };
  }, [apiClient, attachment.id, retry]);
  return (
    <figure className="space-y-2 rounded-xl border border-line p-3">
      {photo.url ? (
        <a
          href={photo.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${attachment.originalName}`}
        >
          <Image
            src={photo.url}
            alt={attachment.originalName}
            width={attachment.width ?? 600}
            height={attachment.height ?? 400}
            unoptimized
            className="h-40 w-full rounded-lg object-contain"
          />
        </a>
      ) : photo.error ? (
        <div role="alert">
          {photo.error}{' '}
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : (
        <p role="status">Loading photo...</p>
      )}
      <figcaption className="truncate text-xs">
        {attachment.originalName}
      </figcaption>
    </figure>
  );
}
