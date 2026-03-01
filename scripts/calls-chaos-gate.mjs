import { spawn } from "node:child_process";

function run(commandLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandLine, {
      shell: true,
      stdio: "inherit",
      env: process.env,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${commandLine} exited with code ${code}`));
    });

    child.on("error", reject);
  });
}

async function main() {
  const steps = [
    "npm run test -- src/test/calls-v2-wsclient-reliability.test.ts",
    "npm run calls:validate",
    "npm run calls:mediasoup:smoke",
  ];

  for (const step of steps) {
    await run(step);
  }

  console.log("[calls-chaos-gate] passed");
}

main().catch((error) => {
  console.error("[calls-chaos-gate] failed:", error?.message ?? error);
  process.exit(1);
});
