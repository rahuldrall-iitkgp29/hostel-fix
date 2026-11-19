import type { CreateComplaintFormData } from './schemas';
import type { ComplaintDetail } from './types';

// A failed response keeps the key for the same draft; double clicks share the
// request. A changed draft is a new logical submission with its own key.
export function createComplaintSubmission(
  send: (
    data: CreateComplaintFormData & { clientRequestId: string }
  ) => Promise<ComplaintDetail>,
  makeId = () => crypto.randomUUID()
) {
  const drafts = new Map<
    string,
    { id: string; pending?: Promise<ComplaintDetail>; result?: ComplaintDetail }
  >();
  return async (data: CreateComplaintFormData) => {
    const fingerprint = JSON.stringify(data);
    const draft = drafts.get(fingerprint) ?? { id: makeId() };
    drafts.set(fingerprint, draft);
    if (draft.result) return draft.result;
    if (draft.pending) return draft.pending;
    draft.pending = send({ ...data, clientRequestId: draft.id })
      .then((result) => {
        draft.result = result;
        return result;
      })
      .finally(() => {
        draft.pending = undefined;
      });
    return draft.pending;
  };
}
