export function download(
  url: string,
  into: string,
  options?: { attempts?: number; wait?: (ms: number) => Promise<void> },
): Promise<string>
