/** Turns raw file contents into a clean string: BOM-aware decoding and `\n` line endings. */
export type TextInput = string | Uint8Array | ArrayBuffer;

function decodeBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  // The UTF-8 decoder strips a UTF-8 BOM itself. Invalid bytes become U+FFFD rather than throwing.
  return new TextDecoder('utf-8').decode(bytes);
}

export function decodeText(input: TextInput): string {
  let text: string;
  if (typeof input === 'string') text = input;
  else if (input instanceof Uint8Array) text = decodeBytes(input);
  else text = decodeBytes(new Uint8Array(input));
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.replace(/\r\n?/g, '\n').replace(/\u2028|\u2029/g, '\n');
}
