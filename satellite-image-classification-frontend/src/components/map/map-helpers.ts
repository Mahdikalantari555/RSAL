import type { ClassDefinition } from "@/types";

export function classNameFor(
  classes: ClassDefinition[],
  classId: string,
): ClassDefinition | undefined {
  return classes.find((cls) => cls.id === classId);
}
