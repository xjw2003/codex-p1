const fs = require("fs");
const os = require("os");
const path = require("path");

async function handleAccountCommand(runtime, normalized) {
  const summary = await readCurrentCodexAccountSummary();
  const text = buildAccountInfoText(summary);
  await runtime.sendInfoCardMessage({
    chatId: normalized.chatId,
    replyToMessageId: normalized.messageId,
    text,
    kind: summary.ok ? "info" : "error",
  });
}

async function readCurrentCodexAccountSummary() {
  const codexHome = resolveCodexHome(process.env);
  const authPath = path.join(codexHome, "auth.json");

  let raw;
  try {
    raw = await fs.promises.readFile(authPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        ok: false,
        authPath,
        error: "当前 Codex 环境还没有登录信息。",
      };
    }
    return {
      ok: false,
      authPath,
      error: `读取登录信息失败：${error.message}`,
    };
  }

  let auth;
  try {
    auth = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      authPath,
      error: `解析登录信息失败：${error.message}`,
    };
  }

  const claims = decodeTokenClaims(auth);
  if (!claims) {
    return {
      ok: false,
      authPath,
      error: "找到了 auth.json，但无法解析当前登录账号信息。",
    };
  }

  const authInfo = claims["https://api.openai.com/auth"] || {};
  const defaultOrg = Array.isArray(authInfo.organizations)
    ? authInfo.organizations.find((item) => item?.is_default) || authInfo.organizations[0] || null
    : null;

  return {
    ok: true,
    authPath,
    codexHome,
    authMode: normalizeText(auth.auth_mode),
    provider: normalizeText(claims.auth_provider),
    name: normalizeText(claims.name),
    email: normalizeText(claims.email),
    emailVerified: !!claims.email_verified,
    plan: normalizeText(authInfo.chatgpt_plan_type),
    accountId: normalizeText(auth?.tokens?.account_id),
    chatgptUserId: normalizeText(authInfo.chatgpt_user_id),
    organization: normalizeText(defaultOrg?.title),
    organizationRole: normalizeText(defaultOrg?.role),
  };
}

function buildAccountInfoText(summary) {
  if (!summary?.ok) {
    return [
      "**当前 Codex 登录账号**",
      "",
      summary?.error || "无法读取当前登录账号信息。",
      "",
      `auth.json：\`${summary?.authPath || "unknown"}\``,
    ].join("\n");
  }

  const lines = [
    "**当前 Codex 登录账号**",
    "",
    `CODEX_HOME：\`${summary.codexHome}\``,
    `auth.json：\`${summary.authPath}\``,
    `登录方式：${summary.authMode || "unknown"}`,
    `第三方登录：${summary.provider || "unknown"}`,
    `账号名：${summary.name || "unknown"}`,
    `邮箱：${summary.email || "unknown"}`,
    `邮箱验证：${summary.emailVerified ? "已验证" : "未验证"}`,
    `套餐：${summary.plan || "unknown"}`,
    `默认组织：${summary.organization || "unknown"}`,
    `组织角色：${summary.organizationRole || "unknown"}`,
  ];

  if (summary.accountId) {
    lines.push(`account_id：\`${summary.accountId}\``);
  }
  if (summary.chatgptUserId) {
    lines.push(`chatgpt_user_id：\`${summary.chatgptUserId}\``);
  }

  return lines.join("\n");
}

function resolveCodexHome(env = process.env) {
  const configured = normalizeText(env.CODEX_HOME);
  return configured || path.join(os.homedir(), ".codex");
}

function decodeTokenClaims(auth) {
  const tokenCandidates = [
    auth?.tokens?.id_token,
    auth?.tokens?.access_token,
  ];

  for (const token of tokenCandidates) {
    const claims = parseJwtClaims(token);
    if (claims) {
      return claims;
    }
  }

  return null;
}

function parseJwtClaims(token) {
  const normalized = normalizeText(token);
  if (!normalized) {
    return null;
  }

  const parts = normalized.split(".");
  if (parts.length < 2) {
    return null;
  }

  const payload = decodeBase64Url(parts[1]);
  if (!payload) {
    return null;
  }

  try {
    const claims = JSON.parse(payload);
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(value) {
  const normalized = normalizeText(value)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (!normalized) {
    return "";
  }

  const padding = (4 - (normalized.length % 4)) % 4;
  try {
    return Buffer.from(`${normalized}${"=".repeat(padding)}`, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  buildAccountInfoText,
  handleAccountCommand,
  readCurrentCodexAccountSummary,
};
