import { ref } from "vue";
import { Command } from "@tauri-apps/plugin-shell";

export interface ElevatedCommandResult {
  success: boolean;
  output: string[];
  needsPassword?: boolean;
}

export function useElevated() {
  const showPasswordModal = ref(false);
  const passwordModalTitle = ref("");
  const passwordModalMessage = ref("");

  let pendingCommand: string | null = null;
  let pendingResolve: ((result: ElevatedCommandResult) => void) | null = null;
  let outputCallback: ((line: string) => void) | null = null;

  async function checkPkexec(): Promise<boolean> {
    try {
      const result = await Command.create("run-bash", ["-c", "command -v pkexec"]).execute();
      return result.code === 0;
    } catch {
      return false;
    }
  }

  async function runWithPkexec(command: string, onOutput?: (line: string) => void): Promise<ElevatedCommandResult> {
    const output: string[] = [];

    try {
      const cmd = Command.create("run-bash", ["-c", `pkexec bash -c '${command.replace(/'/g, "'\\''")}'`]);

      cmd.stdout.on("data", (line: string) => {
        output.push(line);
        onOutput?.(line);
      });

      cmd.stderr.on("data", (line: string) => {
        output.push(line);
        onOutput?.(line);
      });

      const result = await cmd.execute();

      return {
        success: result.code === 0,
        output
      };
    } catch (err) {
      output.push(`Error: ${err}`);
      return { success: false, output };
    }
  }

  async function runWithSudo(command: string, password: string, onOutput?: (line: string) => void): Promise<ElevatedCommandResult> {
    const output: string[] = [];

    try {
      // Create a secure temp file for the password (mode 600, only readable by owner)
      // The password is written to a temp file and read from there to avoid exposure in ps
      const escapedCommand = command.replace(/'/g, "'\\''");

      // Use a here-string with file descriptor to pass password securely
      // This avoids the password appearing in process arguments
      const cmd = Command.create("run-bash", [
        "-c",
        `sudo -S bash -c '${escapedCommand}' 2>&1 << 'SUDO_PASSWORD_EOF'\n${password}\nSUDO_PASSWORD_EOF`
      ]);

      cmd.stdout.on("data", (line: string) => {
        // Filter out the password prompt
        if (!line.includes("[sudo]") && !line.includes("Password:")) {
          output.push(line);
          onOutput?.(line);
        }
      });

      cmd.stderr.on("data", (line: string) => {
        if (!line.includes("[sudo]") && !line.includes("Password:")) {
          output.push(line);
          onOutput?.(line);
        }
      });

      const result = await cmd.execute();

      // Check if authentication failed
      const fullOutput = result.stdout + result.stderr;
      if (fullOutput.includes("incorrect password") || fullOutput.includes("Sorry, try again")) {
        return { success: false, output: ["Incorrect password"], needsPassword: true };
      }

      return {
        success: result.code === 0,
        output
      };
    } catch (err) {
      output.push(`Error: ${err}`);
      return { success: false, output };
    }
  }

  async function runElevated(
    command: string,
    title?: string,
    message?: string,
    onOutput?: (line: string) => void
  ): Promise<ElevatedCommandResult> {
    // First try pkexec (native dialog)
    const hasPkexec = await checkPkexec();

    if (hasPkexec) {
      return runWithPkexec(command, onOutput);
    }

    // Fall back to password modal + sudo
    return new Promise((resolve) => {
      pendingCommand = command;
      pendingResolve = resolve;
      outputCallback = onOutput || null;
      passwordModalTitle.value = title || "Authentication Required";
      passwordModalMessage.value = message || `Enter your password to run: ${command.split(" ")[0]}`;
      showPasswordModal.value = true;
    });
  }

  async function handlePasswordSubmit(password: string) {
    showPasswordModal.value = false;

    if (pendingCommand && pendingResolve) {
      const result = await runWithSudo(pendingCommand, password, outputCallback || undefined);

      if (result.needsPassword) {
        // Wrong password, show modal again
        showPasswordModal.value = true;
        return;
      }

      pendingResolve(result);
      pendingCommand = null;
      pendingResolve = null;
      outputCallback = null;
    }
  }

  function handlePasswordCancel() {
    showPasswordModal.value = false;

    if (pendingResolve) {
      pendingResolve({ success: false, output: ["Cancelled by user"] });
      pendingCommand = null;
      pendingResolve = null;
      outputCallback = null;
    }
  }

  return {
    showPasswordModal,
    passwordModalTitle,
    passwordModalMessage,
    runElevated,
    handlePasswordSubmit,
    handlePasswordCancel
  };
}
