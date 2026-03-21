const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const { buildRuntimeEnv } = require("./process-env");

const IS_WINDOWS = os.platform() === "win32";

async function maybeLaunchVsCode(config = {}) {
  const vscodeConfig = config?.vscode || {};
  if (!vscodeConfig.launchOnStart) {
    return;
  }

  const command = normalizeText(vscodeConfig.command);
  if (!command) {
    throw new Error("CODEX_IM_VSCODE_COMMAND is required when CODEX_IM_VSCODE_LAUNCH_ON_START=true");
  }

  const env = buildRuntimeEnv(process.env, { proxyUrl: config.proxyUrl });
  if (vscodeConfig.killBeforeLaunch) {
    await killExistingProcess(command, env);
  }

  launchDetached(command, env);
}

async function killExistingProcess(command, env) {
  const processName = path.basename(command);
  if (!processName) {
    return;
  }

  if (IS_WINDOWS) {
    await runDetachedCommand("taskkill.exe", ["/F", "/IM", processName], env);
    return;
  }

  await runDetachedCommand("pkill", ["-f", processName], env);
}

function launchDetached(command, env) {
  const child = spawn(command, [], {
    env,
    detached: true,
    stdio: "ignore",
    shell: false,
  });
  child.unref();
  console.log(`[codex-im] launched VSCode command: ${command}`);
}

async function runDetachedCommand(command, args, env) {
  await new Promise((resolve) => {
    const child = spawn(command, args, {
      env,
      stdio: "ignore",
      shell: false,
    });

    child.on("error", () => resolve());
    child.on("close", () => resolve());
  });
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  maybeLaunchVsCode,
};
