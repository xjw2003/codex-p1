const PROXY_ENV_NAMES = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "WS_PROXY",
  "WSS_PROXY",
];

function buildProxyEnv(proxyUrl) {
  const normalizedProxyUrl = normalizeText(proxyUrl);
  if (!normalizedProxyUrl) {
    return {};
  }

  const overrides = {};
  for (const name of PROXY_ENV_NAMES) {
    overrides[name] = normalizedProxyUrl;
    overrides[name.toLowerCase()] = normalizedProxyUrl;
  }
  return overrides;
}

function buildRuntimeEnv(baseEnv = process.env, { proxyUrl = "" } = {}) {
  return {
    ...baseEnv,
    ...buildProxyEnv(proxyUrl),
  };
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  buildProxyEnv,
  buildRuntimeEnv,
};
