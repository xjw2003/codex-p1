const DEFAULT_INACTIVITY_TIMEOUT_MS = 60 * 1000;
const MAX_RESPONSE_WATCH_ENTRIES = 500;

const TERMINAL_METHODS = new Set([
  "turn/completed",
  "turn/failed",
  "turn/cancelled",
]);

function startResponseWatch(runtime, {
  threadId,
  chatId,
  replyToMessageId = "",
  stage = "message",
}) {
  const normalizedThreadId = normalizeId(threadId);
  const normalizedChatId = normalizeId(chatId);
  if (!normalizedThreadId || !normalizedChatId) {
    return;
  }

  const now = Date.now();
  const existing = runtime.responseWatchByThreadId.get(normalizedThreadId) || null;
  if (existing?.timer) {
    clearTimeout(existing.timer);
  }

  const watch = {
    threadId: normalizedThreadId,
    chatId: normalizedChatId,
    replyToMessageId: normalizeId(replyToMessageId),
    stage,
    startedAt: existing?.startedAt || now,
    lastProgressAt: now,
    lastMethod: "",
    notifiedAt: 0,
    timer: null,
  };
  runtime.responseWatchByThreadId.set(normalizedThreadId, watch);
  pruneResponseWatchMap(runtime);
  console.log(`[codex-im] response-watch start thread=${normalizedThreadId} stage=${stage}`);
  scheduleInactivityTimeout(runtime, watch);
}

function touchResponseWatch(runtime, threadId, { method = "" } = {}) {
  const normalizedThreadId = normalizeId(threadId);
  if (!normalizedThreadId) {
    return;
  }
  const watch = runtime.responseWatchByThreadId.get(normalizedThreadId);
  if (!watch) {
    return;
  }

  const normalizedMethod = normalizeId(method);
  if (normalizedMethod && TERMINAL_METHODS.has(normalizedMethod)) {
    clearResponseWatch(runtime, normalizedThreadId);
    return;
  }

  watch.lastProgressAt = Date.now();
  watch.lastMethod = normalizedMethod || watch.lastMethod || "";
  watch.notifiedAt = 0;
  if (watch.lastMethod) {
    console.log(`[codex-im] response-watch touch thread=${normalizedThreadId} method=${watch.lastMethod}`);
  }
  scheduleInactivityTimeout(runtime, watch);
}

function clearResponseWatch(runtime, threadId) {
  const normalizedThreadId = normalizeId(threadId);
  if (!normalizedThreadId) {
    return;
  }
  const watch = runtime.responseWatchByThreadId.get(normalizedThreadId);
  if (!watch) {
    return;
  }
  if (watch.timer) {
    clearTimeout(watch.timer);
  }
  runtime.responseWatchByThreadId.delete(normalizedThreadId);
  console.log(`[codex-im] response-watch clear thread=${normalizedThreadId}`);
}

function scheduleInactivityTimeout(runtime, watch) {
  if (!watch) {
    return;
  }
  if (watch.timer) {
    clearTimeout(watch.timer);
  }
  const timeoutMs = resolveInactivityTimeoutMs(runtime);
  watch.timer = setTimeout(() => {
    watch.timer = null;
    notifyInactivityTimeout(runtime, watch).catch((error) => {
      console.error(`[codex-im] failed to send inactivity timeout hint: ${error.message}`);
    });
  }, timeoutMs);
}

async function notifyInactivityTimeout(runtime, watch) {
  const latest = runtime.responseWatchByThreadId.get(watch.threadId);
  if (!latest) {
    return;
  }

  // Avoid repeated notifications without new progress.
  if (latest.notifiedAt && latest.notifiedAt >= latest.lastProgressAt) {
    return;
  }

  const now = Date.now();
  const waitedSeconds = Math.max(1, Math.round((now - latest.lastProgressAt) / 1000));
  const diagnosis = diagnoseInactivity(runtime, latest);

  latest.notifiedAt = now;
  console.log(`[codex-im] response-watch timeout thread=${latest.threadId} diagnosis=${diagnosis.title}`);
  await runtime.sendInfoCardMessage({
    chatId: latest.chatId,
    replyToMessageId: latest.replyToMessageId,
    text: buildInactivityHintText({
      stage: latest.stage,
      waitedSeconds,
      diagnosis,
      threadId: latest.threadId,
    }),
    kind: diagnosis.kind,
  });
}

function diagnoseInactivity(runtime, watch) {
  if (runtime.pendingApprovalByThreadId.has(watch.threadId)) {
    return {
      kind: "info",
      title: "等待授权",
      reason: "当前有待处理的授权请求，Codex 会在授权后继续执行。",
      action: "请在授权卡片点击“允许”或“拒绝”。",
    };
  }

  const codexSnapshot = runtime.codex?.getConnectionSnapshot
    ? runtime.codex.getConnectionSnapshot()
    : null;
  if (codexSnapshot && !codexSnapshot.connected) {
    const detail = normalizeText(codexSnapshot.lastDisconnectReason);
    return {
      kind: "error",
      title: "Codex 连接异常",
      reason: detail
        ? `Codex 连接已断开：${detail}`
        : "Codex 连接已断开或进程已退出。",
      action: "建议重启机器人进程后重试。",
    };
  }

  const feishuState = normalizeText(runtime.feishuWsState).toLowerCase();
  if (feishuState === "error" || feishuState === "disconnected") {
    const detail = normalizeText(runtime.feishuWsLastError);
    return {
      kind: "error",
      title: "飞书连接异常",
      reason: detail
        ? `飞书长连接异常：${detail}`
        : "飞书长连接当前异常或已断开。",
      action: "请检查网络并重启机器人进程。",
    };
  }
  if (feishuState === "reconnecting") {
    return {
      kind: "info",
      title: "飞书重连中",
      reason: "飞书长连接正在重连，消息可能延迟。",
      action: "可先等待重连完成，再决定是否重试。",
    };
  }

  if (runtime.activeTurnIdByThreadId.has(watch.threadId)) {
    return {
      kind: "progress",
      title: "Codex 执行中",
      reason: "Codex 仍在执行，但在当前时间窗内没有产生新进展事件。",
      action: "可继续等待；若长时间无变化，可发送 `/codex stop` 后重试。",
    };
  }

  return {
    kind: "info",
    title: "状态未确定",
    reason: "未检测到新的执行进展，且无法精确定位卡点。",
    action: "建议先发送 `/codex status`，必要时 `/codex stop` 后重试。",
  };
}

function buildInactivityHintText({ stage, waitedSeconds, diagnosis, threadId }) {
  return buildInactivityStatusText({
    heading: "超时提醒",
    stage,
    waitedSeconds,
    diagnosis,
    threadId,
  });
}

function getInactivityStatus(runtime, threadId) {
  const normalizedThreadId = normalizeId(threadId);
  if (!normalizedThreadId) {
    return null;
  }
  const watch = runtime.responseWatchByThreadId.get(normalizedThreadId);
  if (!watch) {
    return null;
  }

  const now = Date.now();
  return {
    stage: watch.stage,
    waitedSeconds: Math.max(1, Math.round((now - watch.lastProgressAt) / 1000)),
    diagnosis: diagnoseInactivity(runtime, watch),
    threadId: watch.threadId,
  };
}

function buildQueriedInactivityStatusText(runtime, status) {
  if (!status) {
    return "";
  }
  return buildInactivityStatusText({
    runtime,
    heading: "当前状态查询",
    stage: status.stage,
    waitedSeconds: status.waitedSeconds,
    diagnosis: status.diagnosis,
    threadId: status.threadId,
  });
}

function buildInactivityStatusText({ runtime, heading, stage, waitedSeconds, diagnosis, threadId }) {
  const stageLabel = stage === "approval"
    ? "授权后等待继续执行"
    : "消息下发后等待响应";
  const lines = [
    `**${normalizeText(heading) || "超时提醒"}：${stageLabel}**`,
    `已等待：\`${waitedSeconds}s\``,
    `线程：\`${threadId}\``,
    `判断：${diagnosis.title}`,
    `原因：${diagnosis.reason}`,
    `建议：${diagnosis.action}`,
  ];
  const runtimeStatusLines = buildRuntimeStatusLines(runtime, threadId);
  if (runtimeStatusLines.length) {
    lines.push("");
    lines.push(...runtimeStatusLines);
  }
  return lines.join("\n");
}

function buildRuntimeStatusLines(runtime, threadId) {
  if (!runtime) {
    return [];
  }
  const lines = [
    `桥接层状态：${describeBridgeStatus(runtime, threadId)}`,
    `Codex 连接：${describeCodexConnection(runtime)}`,
  ];
  const recentEventText = describeRecentCodexEvent(runtime);
  if (recentEventText) {
    lines.push(recentEventText);
  }
  return lines;
}

function describeBridgeStatus(runtime, threadId) {
  if (runtime.pendingApprovalByThreadId.has(threadId)) {
    return "等待授权";
  }
  if (runtime.activeTurnIdByThreadId.has(threadId)) {
    return "运行中";
  }
  return "空闲";
}

function describeCodexConnection(runtime) {
  const snapshot = runtime.codex?.getConnectionSnapshot?.() || null;
  if (!snapshot) {
    return "未知";
  }
  if (!snapshot.connected) {
    const detail = normalizeText(snapshot.lastDisconnectReason);
    return detail ? `未连接（${detail}）` : "未连接";
  }
  if (!snapshot.ready) {
    return "连接中";
  }
  return "已连接";
}

function describeRecentCodexEvent(runtime) {
  const method = normalizeText(runtime.lastCodexEventMethod);
  const timestampText = formatStatusTimestamp(runtime.lastCodexEventAt);
  if (!method && !timestampText) {
    return "";
  }
  if (method && timestampText) {
    return `最近 Codex 事件：\`${method}\` · ${timestampText}`;
  }
  return method
    ? `最近 Codex 事件：\`${method}\``
    : `最近 Codex 事件时间：${timestampText}`;
}

function formatStatusTimestamp(value) {
  const timestamp = Number(value || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "";
  }
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}

function resolveInactivityTimeoutMs(runtime) {
  const configured = Number(runtime?.config?.inactivityTimeoutMs || 0);
  if (Number.isFinite(configured) && configured >= 5000) {
    return Math.round(configured);
  }
  return DEFAULT_INACTIVITY_TIMEOUT_MS;
}

function pruneResponseWatchMap(runtime) {
  const map = runtime.responseWatchByThreadId;
  if (!map || map.size <= MAX_RESPONSE_WATCH_ENTRIES) {
    return;
  }

  while (map.size > MAX_RESPONSE_WATCH_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (!oldestKey) {
      break;
    }
    const watch = map.get(oldestKey);
    if (watch?.timer) {
      clearTimeout(watch.timer);
    }
    map.delete(oldestKey);
  }
}

function normalizeId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  buildQueriedInactivityStatusText,
  clearResponseWatch,
  getInactivityStatus,
  startResponseWatch,
  touchResponseWatch,
};
