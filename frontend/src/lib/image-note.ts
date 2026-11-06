// AI-assisted: Used Claude to write this file.

/**
 * An image job has one content string, so a note typed beside the image travels inside it. That keeps the note
 * covered by the job's file hash and the wallet's signature. Base64 has no line breaks, so the split is unambiguous.
 */
const NOTE_BREAK = "\n\nNOTES FROM THE SENDER\n";

export function withImageNote(image: string, note: string) {
  return note ? `${image}${NOTE_BREAK}${note}` : image;
}

export function splitImageNote(content: string): { image: string; note?: string } {
  const at = content.indexOf(NOTE_BREAK);
  if (at < 0) return { image: content };
  return { image: content.slice(0, at), note: content.slice(at + NOTE_BREAK.length) };
}
