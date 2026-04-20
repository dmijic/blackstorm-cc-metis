const DEFAULT_API_BASE_URL = "/api";

function isLocalHostname(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

function isUnsafeLocalhostBase(configuredBase) {
  if (!configuredBase) {
    return false;
  }

  try {
    const candidate = new URL(configuredBase, window.location.origin);
    return isLocalHostname(candidate.hostname);
  } catch {
    return false;
  }
}

export function getApiBaseUrl() {
  const configuredBase =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    DEFAULT_API_BASE_URL;

  if (typeof window !== "undefined") {
    const currentHostname = window.location.hostname;
    if (!isLocalHostname(currentHostname) && isUnsafeLocalhostBase(configuredBase)) {
      return DEFAULT_API_BASE_URL;
    }
  }

  return configuredBase || DEFAULT_API_BASE_URL;
}

export function buildApiUrl(path) {
  const baseUrl = getApiBaseUrl();

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const normalizedBase = baseUrl.endsWith("/")
    ? baseUrl.slice(0, -1)
    : baseUrl;
  let normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (
    normalizedPath.startsWith("/api/") &&
    (normalizedBase === "/api" || normalizedBase.endsWith("/api"))
  ) {
    normalizedPath = normalizedPath.slice(4);
  }

  return `${normalizedBase}${normalizedPath}`;
}

export { DEFAULT_API_BASE_URL };
