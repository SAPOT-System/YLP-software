export type FactoryOverrides<T> = Partial<T>;

export type Factory<T> = (overrides?: FactoryOverrides<T>) => T;

/**
 * Creates a reusable factory with sensible defaults and typed overrides.
 */
export function createFactory<T>(defaults: T | (() => T)): Factory<T> {
  return (overrides: FactoryOverrides<T> = {}) => {
    const base = typeof defaults === "function" ? (defaults as () => T)() : defaults;
    return { ...base, ...overrides };
  };
}

/**
 * Creates an array of entities from a factory.
 */
export function createFactoryList<T>(
  factory: Factory<T>,
  count: number,
  overrides?: FactoryOverrides<T> | ((index: number) => FactoryOverrides<T>)
): T[] {
  return Array.from({ length: count }, (_, index) => {
    const itemOverrides =
      typeof overrides === "function" ? overrides(index) : overrides;
    return factory(itemOverrides);
  });
}
