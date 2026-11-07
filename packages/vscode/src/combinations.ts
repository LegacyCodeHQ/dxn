/** Fetch from the live server on every click, then display its canonical table. */
export async function showCombinations(
  uri: string,
  type: string,
  execute: (params: { command: string; arguments: string[] }) => Promise<{ table: string }>,
  open: (table: string) => Promise<void>,
): Promise<void> {
  const result = await execute({ command: "dxn.combinations", arguments: [uri, type] });
  await open(result.table);
}
