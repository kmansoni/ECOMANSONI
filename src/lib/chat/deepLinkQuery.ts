export interface ChatsQueryActions {
  openDmId: string | null;
  openChannelId: string | null;
  openGroupId: string | null;
  invite: string | null;
  newMessage: string | null;
  startCallUserId: string | null;
  startCallType: "audio" | "video";
}

export function parseChatsQueryActions(search: string): ChatsQueryActions {
  const params = new URLSearchParams(search || "");
  const startCallTypeRaw = (params.get("callType") || "audio").toLowerCase();

  return {
    openDmId: params.get("open") || params.get("openDmId"),
    openChannelId: params.get("openChannel"),
    openGroupId: params.get("openGroup"),
    invite: params.get("invite"),
    newMessage: params.get("newMessage"),
    startCallUserId: params.get("startCall"),
    startCallType: startCallTypeRaw === "video" ? "video" : "audio",
  };
}

export function clearHandledChatsQueryParams(search: string): string {
  const params = new URLSearchParams(search || "");
  params.delete("open");
  params.delete("openDmId");
  params.delete("openChannel");
  params.delete("openGroup");
  params.delete("invite");
  params.delete("newMessage");
  params.delete("startCall");
  params.delete("callType");
  const next = params.toString();
  return next ? `?${next}` : "";
}
