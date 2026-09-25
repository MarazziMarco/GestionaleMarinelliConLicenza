export function categoryKey(value: string): string {
  return value.trim().toLocaleLowerCase("it");
}

export function categoryNames(values: readonly string[]): string[] {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const name = value.trim();
    const key = categoryKey(name);
    if (key && !byKey.has(key)) byKey.set(key, name);
  }
  return [...byKey.values()].sort((left, right) => left.localeCompare(right, "it", { sensitivity: "base" }));
}

export function canonicalCategory(value: string, existing: readonly string[]): string {
  const name = value.trim();
  return categoryNames(existing).find((candidate) => categoryKey(candidate) === categoryKey(name)) ?? name;
}