import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const projectRoot = process.cwd();
const vinextCli = resolve(projectRoot, "node_modules/vinext/dist/cli.js");

function run(cwd) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [vinextCli, "build"], {
      cwd,
      stdio: "inherit",
    });

    child.on("error", rejectRun);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(
        new Error(
          "vinext build failed" +
            (signal ? " with signal " + signal : " with exit code " + code),
        ),
      );
    });
  });
}

// On Windows, the current vinext/Vite native build crashes when the working
// directory contains non-ASCII characters. A short ASCII junction keeps build
// output in the real project directory while avoiding that upstream limitation.
if (process.platform !== "win32") {
  await run(projectRoot);
} else {
  const temporaryParent = await mkdtemp(join(tmpdir(), "edubridge-build-"));
  const junctionPath = join(temporaryParent, "app");
  try {
    await symlink(projectRoot, junctionPath, "junction");
    await run(junctionPath);
  } finally {
    await rm(temporaryParent, { recursive: true, force: true, maxRetries: 3 });
  }
}
