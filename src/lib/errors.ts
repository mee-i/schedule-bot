export class UserError extends Error {
  readonly is_user_error = true;

  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}
