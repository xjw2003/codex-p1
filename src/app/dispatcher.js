const messageNormalizers = require("../presentation/message/normalizers");
const eventsRuntime = require("./codex-event-service");
const { formatFailureText } = require("../shared/error-text");

async function onFeishuTextEvent(runtime, event) {
  const normalized = messageNormalizers.normalizeFeishuTextEvent(event, runtime.config);
  if (!normalized) {
    return;
  }

  if (await runtime.dispatchTextCommand(normalized)) {
    return;
  }

  const currentThreadContext = runtime.getCurrentThreadContext(normalized);
  if (
    currentThreadContext?.threadId
    && runtime.pendingApprovalByThreadId.has(currentThreadContext.threadId)
  ) {
    await runtime.sendInfoCardMessage({
      chatId: normalized.chatId,
      replyToMessageId: normalized.messageId,
      text: [
        "当前线程还有待处理的授权请求。",
        "请先在授权卡片上点击同意/拒绝，或直接发送 `/codex approve`、`/codex reject`。",
        "如果你怀疑卡片点击已经失效，可以先发 `/codex status` 检查状态。",
      ].join("\n"),
      kind: "info",
    });
    return;
  }

  const workspaceContext = await runtime.resolveWorkspaceContext(normalized, {
    replyToMessageId: normalized.messageId,
    missingWorkspaceText: "当前会话还未绑定项目。先发送 `/codex bind /绝对路径`。",
  });
  if (!workspaceContext) {
    return;
  }
  const { bindingKey, workspaceRoot } = workspaceContext;
  const { threadId } = await runtime.resolveWorkspaceThreadState({
    bindingKey,
    workspaceRoot,
    normalized,
    autoSelectThread: true,
  });

  runtime.setPendingBindingContext(bindingKey, normalized);
  if (threadId) {
    runtime.setPendingThreadContext(threadId, normalized);
  }

  await runtime.addPendingReaction(bindingKey, normalized.messageId);

  try {
    const resolvedThreadId = await runtime.ensureThreadAndSendMessage({
      bindingKey,
      workspaceRoot,
      normalized,
      threadId,
    });
    runtime.movePendingReactionToThread(bindingKey, resolvedThreadId);
    runtime.startResponseWatch({
      threadId: resolvedThreadId,
      chatId: normalized.chatId,
      replyToMessageId: normalized.messageId,
      stage: "message",
    });
  } catch (error) {
    if (threadId) {
      runtime.clearResponseWatch(threadId);
    }
    await runtime.clearPendingReactionForBinding(bindingKey);
    await runtime.sendInfoCardMessage({
      chatId: normalized.chatId,
      replyToMessageId: normalized.messageId,
      text: formatFailureText("处理失败", error),
    });
    throw error;
  }
}

async function onFeishuCardAction(runtime, data) {
  try {
    return await runtime.handleCardAction(data);
  } catch (error) {
    console.error(`[codex-im] failed to process card action: ${error.message}`);
    return runtime.buildCardToast(formatFailureText("处理失败", error));
  }
}

function onCodexMessage(runtime, message) {
  eventsRuntime.handleCodexMessage(runtime, message);
}

module.exports = {
  onCodexMessage,
  onFeishuCardAction,
  onFeishuTextEvent,
};
