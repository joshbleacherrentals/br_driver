/** Local picker photo — never keep full-image base64 in React state. */
export type DocumentPhoto = {
  uri: string | null;
  attachmentId?: string | null;
  isNew?: boolean;
  ext?: string;
};
