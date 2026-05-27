type ErrorContext =
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
  | "delete"
  | "unknown";

const readErrorText = (error: unknown) => {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const maybeError = error as { message?: unknown; error_description?: unknown; error?: unknown; details?: unknown };
    return [maybeError.message, maybeError.error_description, maybeError.error, maybeError.details]
      .filter((value): value is string => typeof value === "string")
      .join(" ");
  }
  return "";
};

export function getFriendlyErrorMessage(error: unknown, context: ErrorContext = "unknown") {
  const text = readErrorText(error).toLowerCase();

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
    text.includes("failed to fetch") ||
    text.includes("network") ||
    text.includes("offline") ||
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("edge function")
  ) {
    return "Network issue. Please check your connection and try again.";
  }

  if (text.includes("invalid") && (text.includes("otp") || text.includes("code") || text.includes("token"))) {
    return "Invalid code. Please check the 6-digit code and try again.";
  }

  if (text.includes("expired") && (text.includes("otp") || text.includes("code") || text.includes("token"))) {
    return "This code has expired. Please request a new one.";
  }

  if (text.includes("invalid login") || text.includes("invalid credentials")) {
    return "Invalid email or password. Please check your details and try again.";
  }

  if (text.includes("email") && text.includes("verify")) {
    return "Please verify your email with the 6-digit code before logging in.";
  }

  if (text.includes("already registered") || text.includes("already exists") || text.includes("duplicate")) {
    if (context === "friend" || context === "group") return "This person is already added.";
    return "An account with these details already exists.";
  }

  if (text.includes("permission") || text.includes("not authorized") || text.includes("unauthorized") || text.includes("jwt")) {
    return "You do not have permission to complete this action.";
  }

  if (text.includes("row level security") || text.includes("violates")) {
    return "We could not save this change. Please check the details and try again.";
  }

  if (text.includes("expense has settlements")) {
    return "This expense has settlements. Reverse or delete its settlements before editing split details.";
  }

  switch (context) {
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
    case "delete":
      return "Could not delete this item. Please try again.";
    case "network":
      return "Network issue. Please check your connection and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
