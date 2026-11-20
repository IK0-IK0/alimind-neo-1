import { CanvasError, createCanvas, joinSession } from "@github/copilot-sdk/extension";

const appUrl = "http://localhost:5173/pipeline-lab";
const healthUrl = "http://localhost:5173/api/health";

async function checkLocalApp() {
  const [pageResponse, healthResponse] = await Promise.all([
    fetch(appUrl, { signal: AbortSignal.timeout(5000) }),
    fetch(healthUrl, { signal: AbortSignal.timeout(5000) }),
  ]);
  if (!pageResponse.ok || !healthResponse.ok) {
    throw new CanvasError(
      "alimind_app_unavailable",
      `AliMind is not ready (lab HTTP ${pageResponse.status}, API HTTP ${healthResponse.status}). Start the app with npm run dev.`,
    );
  }
  const health = await healthResponse.json();
  return {
    lab: { status: pageResponse.status, url: appUrl },
    api: { status: healthResponse.status, health },
  };
}

await joinSession({
  canvases: [
    createCanvas({
      id: "alimind-pipeline-lab",
      displayName: "AliMind Pipeline Lab",
      description: "Open and verify AliMind's local seven-step pipeline and recipe-generation test page.",
      actions: [
        {
          name: "checkLocalApp",
          description: "Check whether the AliMind pipeline lab and local API are reachable.",
          handler: checkLocalApp,
        },
      ],
      open: async () => {
        await checkLocalApp();
        return {
          url: appUrl,
          title: "AliMind Pipeline Lab",
          status: "Sign in, then run Recipe Generation to test a randomized recipe.",
        };
      },
    }),
  ],
});
