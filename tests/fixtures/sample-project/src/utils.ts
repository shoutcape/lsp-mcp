/** Adds two numbers together. */
export function add(a: number, b: number): number {
  return a + b;
}

/** A greeting message type. */
export interface Greeting {
  message: string;
  timestamp: number;
}

export function createGreeting(message: string): Greeting {
  return { message, timestamp: Date.now() };
}
