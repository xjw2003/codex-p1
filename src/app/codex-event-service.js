const codexMessageUtils = require("../infra/codex/message-utils");
const { formatFailureText } = require("../shared/error-text");

async function handleStopCommand(runtime, normalized) {
  const bindingKey = runtime.sessionStore.buildBindingKey(normalized);
  const workspaceRoot = runtime.resolveWorkspaceRootForBinding(bindingKey);
  const threadId = workspaceRoot ? runtime.resolveThreadIdForBinding(bindingKey, workspaceRoot) : null;
  const turnId = threadId ? runtime.activeTurnIdByThreadId.get(threadId) || null : null;

  if (!threadId) {
    await runtime.sendInfoCardMessage({
      chatId: normalized.chatId,
      replyToMessageId: normalized.messageId,
      text: "当前会话还没有可停止的运行任务。",
    });
    return;
  }

  try {
    await runtime.codex.sendRequest("turn/cancel", {
      threadId,
      turnId,
    });
    await runtime.sendInfoCardMessage({
      chatId: normalized.chatId,
      replyToMessageId: normalized.messageId,
      text: "已发送停止请求。",
    });
  } catch (error) {
    await runtime.sendInfoCardMessage({
      chatId: normalized.chatId,
      replyToMessageId: normalized.messageId,
      text: formatFailureText("停止失败", error),
    });
  }
}

function handleCodexMessage(runtime, message) {
  if (typeof message?.method === "string") {
    console.log(`[codex-im] codex event ${message.method}`);
  }
  codexMessageUtils.trackRunningTurn(runtime.activeTurnIdByThreadId, message);
  codexMessageUtils.trackPendingApproval(runtime.pendingApprovalByThreadId, message);
  codexMessageUtils.trackRunKeyState(runtime.currentRunKeyByThreadId, runtime.activeTurnIdByThreadId, message);
  const threadIdFromEvent = codexMessageUtils.extractThreadIdFromMessage(message);
  runtime.pruneRuntimeMapSizes();
  const outbound = codexMessageUtils.mapCodexMessageToImEvent(message);
  if (!outbound) {
    if (threadIdFromEvent && isTerminalTurnMessage(message)) {
      runtime.clearResponseWatch(threadIdFromEvent);
    }
    return;
  }

  const threadId = outbound.payload?.threadId || "";
  if (threadId) {
    runtime.touchResponseWatch(threadId, { method: message?.method || "" });
  }
  if (!outbound.payload.turnId) {
    outbound.payload.turnId = runtime.activeTurnIdByThreadId.get(threadId) || "";
  }
  const context = runtime.pendingChatContextByThreadId.get(threadId);
  if (context) {
    outbound.payload.chatId = context.chatId;
    outbound.payload.threadKey = context.threadKey;
  }

  if (codexMessageUtils.eventShouldClearPendingReaction(outbound)) {
    runtime.clearPendingReactionForThread(threadId).catch((error) => {
      console.error(`[codex-im] failed to clear pending reaction: ${error.message}`);
    });
  }

  const shouldCleanupThreadState = isTerminalTurnMessage(message);
  runtime.deliverToFeishu(outbound)
    .catch((error) => {
      console.error(`[codex-im] failed to deliver Feishu message: ${error.message}`);
    })
    .finally(() => {
      if (!shouldCleanupThreadState || !threadId) {
        return;
      }
      runtime.clearPendingReactionForThread(threadId).catch((error) => {
        console.error(`[codex-im] failed to clear pending reaction: ${error.message}`);
      });
      runtime.cleanupThreadRuntimeState(threadId);
    });
}

async function deliverToFeishu(runtime, event) {
  if (event.type === "im.agent_reply") {
    await runtime.upsertAssistantReplyCard({
      threadId: event.payload.threadId,
      turnId: event.payload.turnId,
      chatId: event.payload.chatId,
      text: event.payload.text,
      state: "streaming",
      deferFlush: !runtime.config.feishuStreamingOutput,
    });
    return;
  }

  if (event.type === "im.file_change") {
    recordFileChange(runtime, event.payload);
    return;
  }

  if (event.type === "im.run_state") {
    if (event.payload.state === "streaming") {
      if (!runtime.config.feishuStreamingOutput) {
        return;
      }
      await runtime.upsertAssistantReplyCard({
        threadId: event.payload.threadId,
        turnId: event.payload.turnId,
        chatId: event.payload.chatId,
        state: "streaming",
      });
    } else if (event.payload.state === "completed") {
      await runtime.upsertAssistantReplyCard({
        threadId: event.payload.threadId,
        turnId: event.payload.turnId,
        chatId: event.payload.chatId,
        state: "completed",
      });
      await sendFileChangeSummaryIfAny(runtime, event.payload);
    } else if (event.payload.state === "failed") {
      await runtime.upsertAssistantReplyCard({
        threadId: event.payload.threadId,
        turnId: event.payload.turnId,
        chatId: event.payload.chatId,
        text: event.payload.text || "执行失败",
        state: "failed",
      });
      await sendFileChangeSummaryIfAny(runtime, event.payload);
    }
    return;
  }

  if (event.type === "im.approval_request") {
    const approval = runtime.pendingApprovalByThreadId.get(event.payload.threadId);
    if (!approval) {
      return;
    }
    const autoApproved = await runtime.tryAutoApproveRequest(event.payload.threadId, approval);
    if (autoApproved) {
      return;
    }
    approval.chatId = event.payload.chatId || approval.chatId || "";
    approval.replyToMessageId = runtime.pendingChatContextByThreadId.get(event.payload.threadId)?.messageId || approval.replyToMessageId || "";
    const response = await runtime.sendInteractiveApprovalCard({
      chatId: approval.chatId,
      approval,
      replyToMessageId: approval.replyToMessageId || "",
    });
    const messageId = codexMessageUtils.extractCreatedMessageId(response);
    if (messageId) {
      approval.cardMessageId = messageId;
    }
  }
}

function recordFileChange(runtime, payload) {
  const threadId = normalizeText(payload?.threadId);
  if (!threadId) {
    return;
  }
  const turnId = normalizeText(payload?.turnId) || runtime.activeTurnIdByThreadId.get(threadId) || "";
  const runKey = codexMessageUtils.buildRunKey(threadId, turnId);
  const current = runtime.fileChangeSummaryByRunKey.get(runKey) || {
    threadId,
    turnId,
    paths: new Map(),
  };

  const changes = Array.isArray(payload?.changes) ? payload.changes : [];
  for (const change of changes) {
    const path = normalizeText(change?.path);
    if (!path) {
      continue;
    }
    const kind = normalizeText(change?.kind) || "unknown";
    const kindSet = current.paths.get(path) || new Set();
    kindSet.add(kind);
    current.paths.set(path, kindSet);
  }

  runtime.fileChangeSummaryByRunKey.set(runKey, current);
}

async function sendFileChangeSummaryIfAny(runtime, payload) {
  const threadId = normalizeText(payload?.threadId);
  if (!threadId) {
    return;
  }
  const turnId = normalizeText(payload?.turnId) || runtime.activeTurnIdByThreadId.get(threadId) || "";
  const runKey = codexMessageUtils.buildRunKey(threadId, turnId);
  const summary = runtime.fileChangeSummaryByRunKey.get(runKey);
  if (!summary || !(summary.paths instanceof Map) || summary.paths.size === 0) {
    return;
  }

  runtime.fileChangeSummaryByRunKey.delete(runKey);

  const chatId = normalizeText(payload?.chatId);
  if (!chatId) {
    return;
  }
  const replyToMessageId = runtime.pendingChatContextByThreadId.get(threadId)?.messageId || "";
  await runtime.sendInfoCardMessage({
    chatId,
    replyToMessageId,
    text: buildFileChangeSummaryText(summary.paths),
    kind: "info",
  });
}

function buildFileChangeSummaryText(pathMap) {
  const items = Array.from(pathMap.entries())
    .map(([path, kindSet]) => ({
      path,
      kinds: Array.from(kindSet || []).filter(Boolean).sort(),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const maxDisplay = 30;
  const displayItems = items.slice(0, maxDisplay);
  const lines = [`**本轮代码改动：${items.length} 个文件**`];
  for (const item of displayItems) {
    const kindText = item.kinds.length ? ` (${item.kinds.join("/")})` : "";
    lines.push(`- \`${escapeInlineCode(item.path)}\`${kindText}`);
  }
  if (items.length > maxDisplay) {
    lines.push(`- ... 其余 ${items.length - maxDisplay} 个文件未展开`);
  }
  return lines.join("\n");
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeInlineCode(text) {
  return String(text || "").replace(/`/g, "\\`");
}

function isTerminalTurnMessage(message) {
  const method = typeof message?.method === "string" ? message.method : "";
  return method === "turn/completed" || method === "turn/failed" || method === "turn/cancelled";
}

module.exports = {
  deliverToFeishu,
  handleCodexMessage,
  handleStopCommand,
};
