import { createFactory, createFactoryList } from "../builders/factory.builder";

export interface DestroyOp {
  op: string;
}

export const createDestroyOp = createFactory<DestroyOp>(() => ({
  op: "destroy-op",
}));

export const createDestroyOps = (
  count: number,
  overrides?: Partial<DestroyOp> | ((index: number) => Partial<DestroyOp>)
) => createFactoryList(createDestroyOp, count, overrides);
