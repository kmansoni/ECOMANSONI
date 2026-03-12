import { removeGroupMember, getGroupKeyTree } from "@/lib/e2ee/groupKeyTree";
import { toBase64 } from "@/lib/e2ee/utils";

/**
 * Best-effort local key rotation when a member leaves a group.
 *
 * The in-memory GroupKeyTree may be absent (e.g. after page reload), so this helper
 * is intentionally fail-safe and never throws to the UI layer.
 */
export async function rotateGroupMembershipAfterRemoval(
  conversationId: string,
  removedUserId: string | null | undefined,
): Promise<boolean> {
  if (!conversationId || !removedUserId) return false;

  const tree = getGroupKeyTree(conversationId);
  if (!tree) return false;

  try {
    await removeGroupMember(conversationId, removedUserId, async (_recipientId, nodeKey) => {
      const iv = new Uint8Array(12);
      crypto.getRandomValues(iv);
      return {
        ciphertext: toBase64(nodeKey),
        iv: toBase64(iv),
      };
    });
    return true;
  } catch (error) {
    console.warn("[group-e2ee] membership rotation after removal failed", error);
    return false;
  }
}
