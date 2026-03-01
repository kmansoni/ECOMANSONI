import process from "node:process";

async function hasMediasoup() {
  try {
    await import("mediasoup");
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const hasModule = await hasMediasoup();
  if (!hasModule) {
    console.log("[calls-mediasoup-smoke] skipped: mediasoup dependency is not installed");
    return;
  }

  process.env.SFU_ENABLE_MEDIASOUP = "1";

  const { createMediaPlaneController } = await import("../server/sfu/mediaPlane.mjs");
  const controller = await createMediaPlaneController();

  if (controller.mode !== "mediasoup") {
    throw new Error(`[calls-mediasoup-smoke] expected mediasoup mode, got ${controller.mode}`);
  }

  const roomId = `room_smoke_${Date.now()}`;
  const peerDeviceId = `peer_smoke_${Date.now()}`;

  const room = await controller.createRoom(roomId);
  if (!room?.routerRtpCapabilities || !Array.isArray(room.routerRtpCapabilities.codecs)) {
    throw new Error("[calls-mediasoup-smoke] invalid router RTP capabilities");
  }

  const transport = await controller.createTransport(roomId, peerDeviceId, "send");
  if (!transport?.id) {
    throw new Error("[calls-mediasoup-smoke] transport id is missing");
  }

  const metrics = controller.metrics();
  if (metrics.mode !== "mediasoup") {
    throw new Error("[calls-mediasoup-smoke] metrics mode mismatch");
  }

  await controller.removePeer(roomId, peerDeviceId);
  await controller.closeRoom(roomId);

  console.log("[calls-mediasoup-smoke] passed");
}

main().catch((error) => {
  console.error("[calls-mediasoup-smoke] failed:", error?.message ?? error);
  process.exit(1);
});
