// How a problem or a refusal is written: its words as they are, and what it
// mentions, a name, a value, a token or a piece of dxn, in backticks, as code
// is quoted in Markdown, so it reads apart from the words around it.

// Words to put in a message as they are, not quoted: a part of a message
// built before, or a token, a path or a title said another way.
export class Words {
  constructor(readonly text: string) {}
}

export const words = (text: string) => new Words(text);

// What a message can mention: a string, quoted; a number, a count, as it is;
// words, as they are; or a list of strings and words, each so, split by
// commas.
export type Mentioned = string | number | undefined | Words | readonly (string | Words)[];

const quoted = (value: string | undefined | Words) =>
  value instanceof Words ? value.text : `\`${value}\``;

// A message, from a template: message`${name} is not a type`.
export function message(text: TemplateStringsArray, ...mentioned: Mentioned[]): string {
  return text.reduce((said, part, index) => {
    if (index === 0) return part;
    const value = mentioned[index - 1];
    const shown =
      typeof value === "number"
        ? String(value)
        : Array.isArray(value)
          ? value.map(quoted).join(", ")
          : quoted(value as string | undefined | Words);
    return `${said}${shown}${part}`;
  }, "");
}
