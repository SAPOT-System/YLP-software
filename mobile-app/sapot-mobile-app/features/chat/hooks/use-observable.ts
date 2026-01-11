import { Observable } from "@nozbe/watermelondb/utils/rx";
import { useEffect, useState } from "react";

export function useObservable<T>(
  observable$: Observable<T[]>,
  initialValue: T[]
) {
  const [value, setValue] = useState<T[]>(initialValue);

  useEffect(() => {
    const sub = observable$.subscribe(setValue);
    return () => sub.unsubscribe();
  }, [observable$]);

  return value;
}
