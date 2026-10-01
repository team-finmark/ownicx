// Error types and the rule for what a manager is allowed to see. No "server-only": the classes are
// plain and the helpers carry no secrets.

/** A database call failed. Its message names tables and Postgres details, so it is never shown to users. */
export class DbError extends Error {}

export const GENERIC_ERROR = "Something went wrong on our side. Please try again.";

/**
 * Message for the person who triggered the action. Errors we throw on purpose ("Name is required",
 * "Needs 200 points") pass through; database failures and programming errors are logged and hidden.
 */
export function userMessage(e: unknown): string {
  if (e instanceof DbError || e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError || e instanceof SyntaxError || !(e instanceof Error)) {
    console.error(e);
    return GENERIC_ERROR;
  }
  return e.message;
}
