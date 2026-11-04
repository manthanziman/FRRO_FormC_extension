function requiredOrigin(value, name) {
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  const url = new URL(value);
  if (url.origin !== value.replace(/\/$/, "")) {
    throw new Error(`${name} must be an origin without a path`);
  }
  return url.origin;
}

export const API_ORIGIN = requiredOrigin(
  import.meta.env.EXTENSION_PUBLIC_API_ORIGIN,
  "EXTENSION_PUBLIC_API_ORIGIN",
);
export const GO_ORIGIN = requiredOrigin(
  import.meta.env.EXTENSION_PUBLIC_GO_ORIGIN,
  "EXTENSION_PUBLIC_GO_ORIGIN",
);
export const SESSION_COOKIE_NAME = "frro_session";
