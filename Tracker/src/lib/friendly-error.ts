export type ErrorContext =
  | "signup"
  | "auth"
  | "otp"
  | "otp_resend"
  | "password_reset"
  | "network"
  | "device"
  | "profile"
  | "expense"
  | "settlement"
  | "group"
  | "friend"
  | "invite"
  | "admin"
  | "feedback"
  | "delete"
  | "unknown";

const readErrorText = (error: unknown) => {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const maybeError = error as {
      message?: unknown;
      error_description?: unknown;
      error?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      name?: unknown;
      status?: unknown;
      context?: { status?: unknown; statusText?: unknown } | unknown;
    };
    const context = typeof maybeError.context === "object" && maybeError.context
      ? maybeError.context as { status?: unknown; statusText?: unknown }
      : {};

    return [
      maybeError.message,
      maybeError.error_description,
      maybeError.error,
      maybeError.details,
      maybeError.hint,
      maybeError.code,
      maybeError.name,
      maybeError.status,
      context.status,
      context.statusText,
    ]
      .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
      .map(String)
      .join(" ");
  }
  return "";
};

const readErrorStatus = (error: unknown) => {
  if (!error || typeof error !== "object") return undefined;
  const maybeError = error as { status?: unknown; context?: { status?: unknown } | unknown };
  if (typeof maybeError.status === "number") return maybeError.status;
  if (typeof maybeError.context === "object" && maybeError.context && typeof (maybeError.context as { status?: unknown }).status === "number") {
    return (maybeError.context as { status: number }).status;
  }
  return undefined;
};

const isSignupContext = (context: ErrorContext) => context === "signup";
const isAuthContext = (context: ErrorContext) => context === "auth" || context === "signup";

export function getFriendlyErrorTitle(error: unknown, context: ErrorContext = "unknown") {
  const message = getFriendlyErrorMessage(error, context);
  if (message.includes("already added")) return "Already added";
  if (message.includes("already exists")) return "Account already exists";
  if (message.includes("valid email")) return "Check your email";
  if (message.includes("Password")) return "Check your password";
  if (message.includes("Too many attempts")) return "Please wait";
  if (message.includes("permission")) return "Permission needed";
  if (context === "auth") return "Sign in failed";
  if (context === "signup") return "Could not create account";
  if (context === "otp" || context === "otp_resend") return "Code issue";
  if (context === "password_reset") return "Password reset failed";
  if (context === "expense") return "Expense not saved";
  if (context === "settlement") return "Settlement not saved";
  if (context === "feedback") return "Feedback not sent";
  if (context === "delete") return "Delete failed";
  return "Action needed";
}

export function getFriendlyErrorMessage(error: unknown, context: ErrorContext = "unknown") {
  const text = readErrorText(error).toLowerCase();
  const status = readErrorStatus(error);

  if (status === 429 || text.includes("rate limit") || text.includes("too many") || text.includes("over email send rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  if (status === 409 && isSignupContext(context)) {
    return "An account with this email already exists. Please sign in instead.";
  }

  if (
    text.includes("already registered") ||
    text.includes("user already registered") ||
    text.includes("email already") ||
    text.includes("account with this email already exists") ||
    text.includes("already exists") ||
    text.includes("duplicate")
  ) {
    if (context === "friend" || context === "group") return "This person is already added.";
    if (isSignupContext(context)) return "An account with this email already exists. Please sign in instead.";
    return "This record already exists. Please check the details and try again.";
  }

  if (
    text.includes("invalid email") ||
    text.includes("email address is invalid") ||
    text.includes("email is invalid") ||
    text.includes("invalid format") ||
    text.includes("email_address_invalid")
  ) {
    return "Please enter a valid email address.";
  }

  if (
    text.includes("weak password") ||
    text.includes("password should") ||
    text.includes("password must") ||
    text.includes("password is too short") ||
    text.includes("password_too_short")
  ) {
    return "Password is too weak. Please use a stronger password.";
  }

  if (text.includes("passwords do not match") || text.includes("password mismatch")) {
    return "Passwords do not match.";
  }

  if (
    text.includes("email not confirmed") ||
    text.includes("email_not_confirmed") ||
    (text.includes("email") && text.includes("confirm"))
  ) {
    return "Please verify your email before signing in.";
  }

  if (text.includes("invalid login") || text.includes("invalid credentials")) {
    return "Invalid email or password.";
  }

  if (status === 400 && isAuthContext(context) && text.includes("non-2xx")) {
    return context === "signup" ? "Please check your signup details and try again." : "Invalid email or password.";
  }

  if (status === 401 || status === 403) {
    if (isAuthContext(context)) return "Invalid email or password.";
    return "You do not have permission to complete this action.";
  }

  if (status && status >= 500 && text.includes("non-2xx")) {
    if (context === "signup" || context === "otp_resend") return "Could not send the verification code. Please try again.";
    if (context === "password_reset") return "Could not update your password. Please try again.";
    return "We could not complete this request. Please try again.";
  }

  if (text.includes("reset session expired") || text.includes("session expired")) {
    return "This reset session has expired. Please request a new code.";
  }

  if (text.includes("account not found") && context === "otp") {
    return "We could not find this account. Please create an account first.";
  }

  if (text.includes("not found") && context === "password_reset") {
    return "If this email is registered, we will send a verification code.";
  }

  if (text.includes("invalid request") && (context === "signup" || context === "password_reset" || context === "otp_resend")) {
    return "Please check the details and try again.";
  }

  if (text.includes("enter the 6-digit code")) {
    return "Enter the 6-digit code.";
  }

  if (text.includes("invalid") && (text.includes("otp") || text.includes("code") || text.includes("token"))) {
    return "Invalid code. Please check the 6-digit code and try again.";
  }

  if (text.includes("expired") && (text.includes("otp") || text.includes("code") || text.includes("token"))) {
    return "This code has expired. Please request a new one.";
  }

  if (text.includes("edge function")) {
    if (context === "otp_resend" || context === "otp" || context === "password_reset" || context === "signup") {
      return "Could not send the verification code. Please try again.";
    }
    return "We could not complete this request. Please try again.";
  }

  if (
    text.includes("failed to fetch") ||
    text.includes("network") ||
    text.includes("offline") ||
    text.includes("timeout") ||
    text.includes("timed out")
  ) {
    return "Network issue. Please check your connection and try again.";
  }

  if (
    text.includes("webauthn") ||
    text.includes("notallowederror") ||
    text.includes("operation either timed out or was not allowed") ||
    text.includes("privacy-considerations") ||
    text.includes("fingerprint") ||
    text.includes("face id")
  ) {
    return "Device verification was cancelled or timed out. Please try again.";
  }

  if (
    text.includes("permission") ||
    text.includes("not authorized") ||
    text.includes("unauthorized") ||
    text.includes("jwt")
  ) {
    return "You do not have permission to complete this action.";
  }

  if (text.includes("row level security") || text.includes("violates")) {
    return "We could not save this change. Please check the details and try again.";
  }

  if (text.includes("expense has settlements")) {
    return "This expense has settlements. Reverse or delete its settlements before editing split details.";
  }

  switch (context) {
    case "signup":
      return "Could not create your account. Please check the details and try again.";
    case "otp":
      return "Invalid or expired code. Please check the 6-digit code and try again.";
    case "otp_resend":
      return "Could not resend the code. Please try again.";
    case "password_reset":
      return "Could not update your password. Please try again.";
    case "auth":
      return "We could not complete sign in. Please try again.";
    case "device":
      return "Device verification was cancelled or timed out. Please try again.";
    case "profile":
      return "Could not update your profile. Please try again.";
    case "expense":
      return "Could not save this expense. Please try again.";
    case "settlement":
      return "Could not update the settlement. Please try again.";
    case "group":
      return "Could not update the group. Please try again.";
    case "friend":
      return "Could not update this friend request. Please try again.";
    case "invite":
      return "This invite is unavailable or has expired.";
    case "admin":
      return "Could not complete the admin action. Please try again.";
    case "feedback":
      return "Could not send your feedback. Please try again.";
    case "delete":
      return "Could not delete this item. Please try again.";
    case "network":
      return "Network issue. Please check your connection and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
