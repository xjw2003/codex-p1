function handleQuotaCommand(runtime, normalized) {
  const text = buildQuotaInfoText(runtime.latestRateLimits);
  return runtime.sendInfoCardMessage({
    chatId: normalized.chatId,
    replyToMessageId: normalized.messageId,
    text,
    kind: runtime.latestRateLimits ? "info" : "error",
  });
}

function updateLatestRateLimits(runtime, params) {
  const normalized = normalizeRateLimitsPayload(params?.rateLimits);
  if (!normalized) {
    return;
  }
  runtime.latestRateLimits = normalized;
}

function buildQuotaInfoText(rateLimits) {
  if (!rateLimits) {
    return [
      "**当前 Codex 额度**",
      "",
      "暂时还没有收到额度数据。",
      "通常在一次 Codex turn 开始后，app-server 才会推送最新额度状态。",
      "你可以先发一条普通消息，再执行 `/codex quota` 查看。",
    ].join("\n");
  }

  const lines = [
    "**当前 Codex 额度**",
    "",
    `套餐：${rateLimits.planType || "unknown"}`,
    buildWindowLine("主额度窗口", rateLimits.primary),
    buildWindowLine("次额度窗口", rateLimits.secondary),
  ].filter(Boolean);

  if (rateLimits.credits) {
    lines.push(`Credits：${rateLimits.credits}`);
  }

  return lines.join("\n");
}

function buildWindowLine(label, windowInfo) {
  if (!windowInfo) {
    return `${label}：unknown`;
  }
  const usedPercent = Number.isFinite(windowInfo.usedPercent) ? `${windowInfo.usedPercent}%` : "unknown";
  const remainingPercent = Number.isFinite(windowInfo.usedPercent)
    ? `${Math.max(0, 100 - windowInfo.usedPercent)}%`
    : "unknown";
  const resetAtText = windowInfo.resetsAt ? formatUnixTimestamp(windowInfo.resetsAt) : "unknown";
  const durationText = Number.isFinite(windowInfo.windowDurationMins)
    ? `${windowInfo.windowDurationMins} 分钟`
    : "unknown";
  return `${label}：已用 ${usedPercent}，剩余 ${remainingPercent}，窗口 ${durationText}，重置时间 ${resetAtText}`;
}

function normalizeRateLimitsPayload(rateLimits) {
  if (!rateLimits || typeof rateLimits !== "object") {
    return null;
  }

  return {
    limitId: normalizeText(rateLimits.limitId),
    limitName: normalizeText(rateLimits.limitName),
    planType: normalizeText(rateLimits.planType),
    credits: normalizeCredits(rateLimits.credits),
    primary: normalizeWindow(rateLimits.primary),
    secondary: normalizeWindow(rateLimits.secondary),
  };
}

function normalizeWindow(windowInfo) {
  if (!windowInfo || typeof windowInfo !== "object") {
    return null;
  }

  return {
    usedPercent: normalizeNumber(windowInfo.usedPercent),
    windowDurationMins: normalizeNumber(windowInfo.windowDurationMins),
    resetsAt: normalizeNumber(windowInfo.resetsAt),
  };
}

function normalizeCredits(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return normalizeText(String(value));
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function formatUnixTimestamp(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "unknown";
  }
  return new Date(seconds * 1000).toLocaleString("zh-CN", {
    hour12: false,
  });
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  buildQuotaInfoText,
  handleQuotaCommand,
  updateLatestRateLimits,
};
