import { Alert } from "react-native";
import { isFavorite, removeFavorite } from "./favorites";
import { deleteClaim } from "./live";
import { useStore } from "./store";

export type Confirm = { title: string; message: string; action: string };

/** Asks in the system alert (UIAlertController on iOS) before a destructive action. */
export function confirm({ title, message, action }: Confirm, onConfirm: () => void) {
  Alert.alert(title, message, [
    { text: "Cancelar", style: "cancel" },
    { text: action, style: "destructive", onPress: onConfirm },
  ]);
}

/** Asks before deleting a claim; once confirmed, it leaves the list and Favoritos. */
export function confirmDeleteClaim(id: string, onDeleted?: () => void) {
  const listed = !!useStore.getState().claims[id];
  const message = !isFavorite(id)
    ? "Ela sai da lista desta conversa."
    : listed
      ? "Ela sai da lista e dos favoritos."
      : "Ela sai dos favoritos.";
  confirm({ title: "Excluir a afirmação?", message, action: "Excluir" }, () => {
    deleteClaim(id);
    removeFavorite(id);
    onDeleted?.();
  });
}
